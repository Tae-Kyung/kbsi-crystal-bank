# GPU 서버 세팅 가이드 — ESM-2 임베딩 + 서열 클러스터링

## 개요

연구실 GPU 서버에서 ESM-2 단백질 언어 모델을 실행하여 286K construct 서열의 임베딩 벡터를 생성하고, Supabase DB에 저장합니다. 생성된 벡터는 서열 유사도 검색, 결정화 성공 예측 모델, 단백질 dedupe 등에 활용됩니다.

## 아키텍처

```
Vercel (웹앱) <--> Supabase (DB) <--> GPU 서버 (연구실)
                        ^
                seq_final 읽기
                embedding 쓰기
```

GPU 서버는 Vercel과 직접 연결할 필요 없이, **Supabase에서 서열을 읽고 결과를 쓰기만** 하면 됩니다.

---

## 1. 환경 세팅

### 1.1 Conda 환경 생성

```bash
conda create -n kbsi python=3.11 -y
conda activate kbsi
```

### 1.2 PyTorch (CUDA 버전에 맞게)

```bash
# CUDA 12.1 기준
pip install torch torchvision --index-url https://download.pytorch.org/whl/cu121

# CUDA 11.8인 경우
# pip install torch torchvision --index-url https://download.pytorch.org/whl/cu118
```

### 1.3 ESM-2 + 의존성

```bash
pip install fair-esm
pip install supabase python-dotenv tqdm
```

### 1.4 서열 클러스터링 도구 (dedupe용)

```bash
conda install -c bioconda mmseqs2 -y
```

---

## 2. 환경변수 설정

```bash
# GPU 서버에 .env 파일 생성
cat > .env << 'EOF'
SUPABASE_URL=https://yjmeolkuhcjpxuxmtkts.supabase.co
SUPABASE_SERVICE_ROLE_KEY=여기에_서비스_롤_키_입력
EOF
```

**주의**: Service Role Key는 RLS를 바이패스하므로 절대 외부에 노출하면 안 됩니다.

---

## 3. DB 마이그레이션 (임베딩 저장용)

Supabase SQL Editor에서 실행:

```sql
-- pgvector 확장 활성화 (Supabase에 이미 설치되어 있음)
CREATE EXTENSION IF NOT EXISTS vector;

-- 임베딩 저장 테이블
CREATE TABLE kbsi_embedding (
  construct_id BIGINT PRIMARY KEY REFERENCES kbsi_construct(id) ON DELETE CASCADE,
  embedding    vector(1280),        -- ESM-2 650M 출력 차원
  model        TEXT DEFAULT 'esm2_t33_650M',
  created_at   TIMESTAMPTZ DEFAULT now()
);

-- 유사도 검색 인덱스 (코사인 유사도)
CREATE INDEX idx_kbsi_embedding_ivfflat
  ON kbsi_embedding USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);
```

---

## 4. ESM-2 임베딩 스크립트

`esm2_embed.py` 파일 생성:

```python
"""
ESM-2 단백질 서열 임베딩 생성 + Supabase 저장

Usage:
  python esm2_embed.py                    # 전체 실행
  python esm2_embed.py --limit 1000       # 테스트 (1000건)
  python esm2_embed.py --model 3B         # 3B 모델 사용 (H200 권장)
"""

import os, sys, torch, esm, argparse
from dotenv import load_dotenv
from supabase import create_client
from tqdm import tqdm

load_dotenv()

# ─── 인자 파싱 ───
parser = argparse.ArgumentParser()
parser.add_argument("--limit", type=int, default=0, help="처리할 최대 건수 (0=전체)")
parser.add_argument("--batch-size", type=int, default=8, help="GPU 배치 크기")
parser.add_argument("--model", choices=["650M", "3B"], default="650M", help="ESM-2 모델 크기")
args = parser.parse_args()

# ─── Supabase 연결 ───
sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])

# ─── ESM-2 모델 로드 ───
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
print(f"Device: {device}")
if device.type == "cuda":
    print(f"GPU: {torch.cuda.get_device_name(0)}")
    print(f"VRAM: {torch.cuda.get_device_properties(0).total_mem / 1e9:.1f} GB")

MODEL_MAP = {
    "650M": ("esm2_t33_650M_UR50D", 33, 1280),
    "3B":   ("esm2_t36_3B_UR50D",   36, 2560),
}
model_name, repr_layer, embed_dim = MODEL_MAP[args.model]
print(f"Loading {model_name}...")

model, alphabet = esm.pretrained.__dict__[model_name]()
model = model.eval().to(device)
batch_converter = alphabet.get_batch_converter()

BATCH_SIZE = args.batch_size
MAX_SEQ_LEN = 1022  # ESM-2 최대 입력 길이

print(f"Model: {model_name}, embed_dim: {embed_dim}, batch_size: {BATCH_SIZE}")

# ─── 이미 처리된 construct ID 로드 ───
print("Loading existing embeddings...")
existing_ids = set()
offset = 0
while True:
    res = sb.table("kbsi_embedding").select("construct_id").range(offset, offset + 999).execute()
    if not res.data:
        break
    for r in res.data:
        existing_ids.add(r["construct_id"])
    if len(res.data) < 1000:
        break
    offset += 1000
print(f"Already embedded: {len(existing_ids)}")

# ─── DB에서 서열 로드 ───
print("Loading sequences from DB...")
constructs = []
offset = 0
while True:
    res = sb.table("kbsi_construct") \
        .select("id, seq_final") \
        .not_.is_("seq_final", "null") \
        .order("id") \
        .range(offset, offset + 999) \
        .execute()
    if not res.data:
        break
    for c in res.data:
        if c["id"] not in existing_ids:
            constructs.append(c)
    if args.limit and len(constructs) >= args.limit:
        constructs = constructs[:args.limit]
        break
    if len(res.data) < 1000:
        break
    offset += 1000

print(f"To process: {len(constructs)}")

if not constructs:
    print("Nothing to process!")
    sys.exit(0)

# ─── 배치 임베딩 함수 ───
def embed_batch(sequences: list[tuple[str, str]]) -> list[list[float]]:
    """(label, seq) 튜플 리스트 -> 평균 임베딩 리스트"""
    _, _, tokens = batch_converter(sequences)
    tokens = tokens.to(device)

    with torch.no_grad():
        results = model(tokens, repr_layers=[repr_layer])

    embeddings = []
    for i, (_, seq) in enumerate(sequences):
        # 1~len(seq) 범위의 토큰 평균 (CLS, EOS 제외)
        emb = results["representations"][repr_layer][i, 1:len(seq)+1].mean(dim=0)
        embeddings.append(emb.cpu().tolist())

    return embeddings

# ─── 메인 루프 ───
batch = []
total_done = 0

for c in tqdm(constructs, desc="Embedding"):
    seq = c["seq_final"][:MAX_SEQ_LEN]
    if len(seq) < 10:
        continue
    batch.append((str(c["id"]), seq))

    if len(batch) >= BATCH_SIZE:
        try:
            embeddings = embed_batch(batch)
            rows = [
                {"construct_id": int(label), "embedding": emb, "model": model_name}
                for (label, _), emb in zip(batch, embeddings)
            ]
            sb.table("kbsi_embedding").upsert(rows).execute()
            total_done += len(batch)
        except Exception as e:
            print(f"\nError: {e}")
            # 긴 서열 때문일 수 있으므로 배치 크기 줄여서 재시도
            for item in batch:
                try:
                    embs = embed_batch([item])
                    sb.table("kbsi_embedding").upsert([
                        {"construct_id": int(item[0]), "embedding": embs[0], "model": model_name}
                    ]).execute()
                    total_done += 1
                except Exception as e2:
                    print(f"\n  Skip {item[0]}: {e2}")
        batch = []

# 남은 배치
if batch:
    embeddings = embed_batch(batch)
    rows = [
        {"construct_id": int(label), "embedding": emb, "model": model_name}
        for (label, _), emb in zip(batch, embeddings)
    ]
    sb.table("kbsi_embedding").upsert(rows).execute()
    total_done += len(batch)

print(f"\nDone! Embedded {total_done} constructs.")
```

---

## 5. 서열 클러스터링 (dedupe용)

### 5.1 FASTA 내보내기

`export_fasta.py`:

```python
"""construct 서열을 FASTA 파일로 내보내기"""
import os
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()
sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])

with open("sequences.fasta", "w") as f:
    offset = 0
    total = 0
    while True:
        res = sb.table("kbsi_construct") \
            .select("id, protein_id, seq_final") \
            .not_.is_("seq_final", "null") \
            .order("id") \
            .range(offset, offset + 999) \
            .execute()
        if not res.data:
            break
        for c in res.data:
            seq = c["seq_final"]
            if len(seq) >= 10:
                f.write(f">construct_{c['id']}_protein_{c['protein_id']}\n")
                # 80자 줄바꿈
                for i in range(0, len(seq), 80):
                    f.write(seq[i:i+80] + "\n")
                total += 1
        if len(res.data) < 1000:
            break
        offset += 1000

print(f"Exported {total} sequences to sequences.fasta")
```

### 5.2 MMseqs2 클러스터링

```bash
# 95% identity, 80% coverage 기준 클러스터링
mmseqs easy-cluster sequences.fasta clust tmp \
  --min-seq-id 0.95 \
  -c 0.8 \
  --threads 16

# 결과 파일:
#   clust_cluster.tsv     — 대표서열 \t 멤버서열
#   clust_rep_seq.fasta   — 대표 서열
```

### 5.3 클러스터 결과 확인

```python
"""클러스터 결과 분석 (병합은 수동 판단)"""
from collections import defaultdict

clusters = defaultdict(list)
with open("clust_cluster.tsv") as f:
    for line in f:
        rep, member = line.strip().split("\t")
        clusters[rep].append(member)

# 같은 protein_id 내 클러스터만 dedupe 후보
multi = {k: v for k, v in clusters.items() if len(v) > 1}
print(f"Total clusters: {len(clusters)}")
print(f"Multi-member clusters: {len(multi)}")

# protein_id가 다른 construct끼리 묶인 클러스터 찾기
cross_protein = 0
for rep, members in multi.items():
    pids = set()
    for m in members:
        pid = m.split("_protein_")[1] if "_protein_" in m else None
        if pid:
            pids.add(pid)
    if len(pids) > 1:
        cross_protein += 1
        if cross_protein <= 10:
            print(f"  Cross-protein cluster: {rep} -> {members[:3]}...")

print(f"\nCross-protein clusters (dedupe candidates): {cross_protein}")
```

---

## 6. 실행 가이드

### 6.1 GPU 확인

```bash
nvidia-smi
# CUDA 버전, GPU 모델, VRAM 확인
```

### 6.2 테스트 실행

```bash
# 소량 테스트
python esm2_embed.py --limit 100 --batch-size 4
```

### 6.3 전체 실행

```bash
# ESM-2 임베딩 (백그라운드)
nohup python esm2_embed.py --batch-size 8 > embed.log 2>&1 &
tail -f embed.log

# 서열 클러스터링
python export_fasta.py
mmseqs easy-cluster sequences.fasta clust tmp --min-seq-id 0.95 -c 0.8 --threads 16
python import_clusters.py
```

### 6.4 중단 후 재시작

스크립트가 `existing_ids`를 먼저 로드하므로, 중단 후 같은 명령어로 재실행하면 이미 처리된 건은 자동 스킵됩니다.

---

## 7. 예상 소요 시간

| 작업 | H200 (80GB) | A100 (80GB) | RTX 4090 (24GB) |
|------|-------------|-------------|-----------------|
| ESM-2 650M 임베딩 (286K) | ~4시간 | ~8시간 | ~12시간 |
| ESM-2 3B 임베딩 (286K) | ~8시간 | ~20시간 | OOM |
| MMseqs2 클러스터링 | CPU 30분 | CPU 30분 | CPU 30분 |

### 배치 크기 가이드

| GPU VRAM | ESM-2 650M | ESM-2 3B |
|----------|-----------|----------|
| 24GB | batch_size=4 | 불가 |
| 40GB | batch_size=8 | batch_size=2 |
| 80GB | batch_size=16 | batch_size=4 |

---

## 8. 임베딩 활용 (Vercel에서)

임베딩이 DB에 저장되면 Supabase의 pgvector를 통해 Vercel 앱에서 바로 사용 가능:

```sql
-- 유사 서열 검색 (코사인 유사도)
SELECT c.id, c.name, p.full_name,
       1 - (e.embedding <=> query_embedding) AS similarity
FROM kbsi_embedding e
JOIN kbsi_construct c ON c.id = e.construct_id
JOIN kbsi_protein p ON p.id = c.protein_id
ORDER BY e.embedding <=> query_embedding
LIMIT 10;
```

```typescript
// Next.js API에서 사용
const { data } = await supabase.rpc('match_embeddings', {
  query_embedding: queryVector,
  match_threshold: 0.8,
  match_count: 10,
});
```

---

## 9. 트러블슈팅

| 문제 | 해결 |
|------|------|
| CUDA out of memory | `--batch-size` 줄이기 (4 -> 2 -> 1) |
| Supabase 연결 거부 | `.env` 파일의 URL/Key 확인, 방화벽 확인 |
| ESM-2 다운로드 느림 | 첫 실행 시 모델 다운로드 (~2.5GB), 이후 캐시됨 |
| 긴 서열 OOM | MAX_SEQ_LEN=1022로 자동 자름 (ESM-2 제한) |
| pgvector 미설치 | Supabase Dashboard > SQL Editor > `CREATE EXTENSION vector;` |
