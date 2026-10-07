"""
ESM-2 단백질 서열 임베딩 계산 — H200 GPU에서 실행
286K construct의 seq_final → ESM-2 → 640차원 벡터 → CSV 출력

사용법:
  # 1. 환경 설정
  pip install torch fair-esm supabase-py pandas tqdm

  # 2. DB에서 서열 추출
  python compute_esm_embeddings.py --extract --output sequences.fasta

  # 3. 임베딩 계산 (H200 GPU, ~30분)
  python compute_esm_embeddings.py --embed --input sequences.fasta --output embeddings.csv --batch-size 64

  # 4. Supabase pgvector에 업로드
  python compute_esm_embeddings.py --upload --input embeddings.csv

환경변수:
  SUPABASE_URL=https://xxx.supabase.co
  SUPABASE_SERVICE_ROLE_KEY=xxx
"""

import argparse
import os
import sys
import csv
import json
from pathlib import Path

def extract_sequences(output_path: str):
    """DB에서 seq_final 추출 → FASTA 파일"""
    from supabase import create_client

    url = os.environ.get('SUPABASE_URL') or os.environ.get('NEXT_PUBLIC_SUPABASE_URL')
    key = os.environ.get('SUPABASE_SERVICE_ROLE_KEY')
    if not url or not key:
        print("ERROR: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 환경변수 필요")
        sys.exit(1)

    supabase = create_client(url, key)
    print("DB에서 서열 추출 중...")

    all_seqs = []
    offset = 0
    page_size = 1000
    while True:
        result = supabase.table('kbsi_construct') \
            .select('id, seq_final') \
            .not_('seq_final', 'is', 'null') \
            .range(offset, offset + page_size - 1) \
            .execute()

        if not result.data:
            break

        for row in result.data:
            seq = row['seq_final'].strip().upper()
            # 비단백질 서열 제거 (DNA 등)
            if len(seq) >= 20 and all(c in 'ACDEFGHIKLMNPQRSTVWY' for c in seq[:20]):
                all_seqs.append((row['id'], seq))

        offset += page_size
        if len(result.data) < page_size:
            break
        if offset % 10000 == 0:
            print(f"  {offset} 건 로드...")

    print(f"총 {len(all_seqs)}개 단백질 서열 추출")

    with open(output_path, 'w') as f:
        for cid, seq in all_seqs:
            f.write(f">{cid}\n{seq}\n")

    print(f"저장: {output_path}")


def compute_embeddings(input_path: str, output_path: str, batch_size: int = 64, model_name: str = 'esm2_t33_650M_UR50D'):
    """ESM-2로 임베딩 계산 (GPU)"""
    import torch
    import esm

    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    print(f"디바이스: {device}")
    if device.type == 'cuda':
        print(f"GPU: {torch.cuda.get_device_name(0)}")
        print(f"VRAM: {torch.cuda.get_device_properties(0).total_mem / 1e9:.1f} GB")

    # 모델 로드
    print(f"모델 로드: {model_name}...")
    model, alphabet = esm.pretrained.load_model_and_alphabet(model_name)
    model = model.to(device)
    model.eval()
    batch_converter = alphabet.get_batch_converter()

    # 서열 로드
    sequences = []
    with open(input_path) as f:
        current_id = None
        current_seq = []
        for line in f:
            line = line.strip()
            if line.startswith('>'):
                if current_id is not None:
                    sequences.append((current_id, ''.join(current_seq)))
                current_id = line[1:]
                current_seq = []
            else:
                current_seq.append(line)
        if current_id is not None:
            sequences.append((current_id, ''.join(current_seq)))

    print(f"서열 {len(sequences)}개 로드")

    # 최대 길이 제한 (ESM-2 최대 1022 토큰)
    MAX_LEN = 1022
    sequences = [(sid, seq[:MAX_LEN]) for sid, seq in sequences]

    # 배치 처리
    embeddings = []
    total_batches = (len(sequences) + batch_size - 1) // batch_size

    with torch.no_grad():
        for batch_idx in range(total_batches):
            start = batch_idx * batch_size
            end = min(start + batch_size, len(sequences))
            batch_seqs = sequences[start:end]

            # 배치 내 길이 정렬 (패딩 최소화)
            batch_data = [(f"seq_{sid}", seq) for sid, seq in batch_seqs]
            _, _, batch_tokens = batch_converter(batch_data)
            batch_tokens = batch_tokens.to(device)

            results = model(batch_tokens, repr_layers=[33], return_contacts=False)
            token_representations = results["representations"][33]

            for i, (sid, seq) in enumerate(batch_seqs):
                # mean pooling (CLS + 서열 토큰, BOS/EOS 제외)
                seq_len = len(seq)
                embedding = token_representations[i, 1:seq_len+1].mean(0).cpu().numpy()
                embeddings.append((sid, embedding))

            if (batch_idx + 1) % 10 == 0 or batch_idx == total_batches - 1:
                elapsed = (batch_idx + 1) / total_batches * 100
                print(f"  [{batch_idx+1}/{total_batches}] {elapsed:.1f}% ({len(embeddings)} 완료)")

    # CSV 저장
    print(f"임베딩 저장: {output_path}")
    with open(output_path, 'w', newline='') as f:
        writer = csv.writer(f)
        writer.writerow(['construct_id', 'embedding'])
        for sid, emb in embeddings:
            writer.writerow([sid, json.dumps(emb.tolist())])

    print(f"완료: {len(embeddings)}개 임베딩 ({output_path})")


def upload_to_supabase(input_path: str, batch_size: int = 100):
    """임베딩을 Supabase pgvector에 업로드"""
    from supabase import create_client

    url = os.environ.get('SUPABASE_URL') or os.environ.get('NEXT_PUBLIC_SUPABASE_URL')
    key = os.environ.get('SUPABASE_SERVICE_ROLE_KEY')
    if not url or not key:
        print("ERROR: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 환경변수 필요")
        sys.exit(1)

    supabase = create_client(url, key)

    print(f"임베딩 업로드: {input_path}")
    rows = []
    with open(input_path, 'r') as f:
        reader = csv.DictReader(f)
        for row in reader:
            rows.append({
                'construct_id': int(row['construct_id']),
                'embedding': json.loads(row['embedding']),
                'model_version': 'esm2_t33_650M_UR50D',
            })

    print(f"총 {len(rows)}개 임베딩")

    uploaded = 0
    for i in range(0, len(rows), batch_size):
        batch = rows[i:i+batch_size]
        try:
            supabase.table('kbsi_sequence_embedding').upsert(batch).execute()
            uploaded += len(batch)
        except Exception as e:
            print(f"  에러 (offset {i}): {e}")

        if (uploaded) % 1000 == 0:
            print(f"  업로드: {uploaded}/{len(rows)}")

    print(f"완료: {uploaded}개 업로드")


def main():
    parser = argparse.ArgumentParser(description='ESM-2 단백질 임베딩 계산')
    parser.add_argument('--extract', action='store_true', help='DB에서 서열 추출')
    parser.add_argument('--embed', action='store_true', help='ESM-2 임베딩 계산')
    parser.add_argument('--upload', action='store_true', help='Supabase에 업로드')
    parser.add_argument('--input', type=str, default='sequences.fasta')
    parser.add_argument('--output', type=str, default='embeddings.csv')
    parser.add_argument('--batch-size', type=int, default=64)
    parser.add_argument('--model', type=str, default='esm2_t33_650M_UR50D',
                        choices=['esm2_t33_650M_UR50D', 'esm2_t36_3B_UR50D'])
    args = parser.parse_args()

    if args.extract:
        extract_sequences(args.output if args.output != 'embeddings.csv' else 'sequences.fasta')
    elif args.embed:
        compute_embeddings(args.input, args.output, args.batch_size, args.model)
    elif args.upload:
        upload_to_supabase(args.input)
    else:
        parser.print_help()


if __name__ == '__main__':
    main()
