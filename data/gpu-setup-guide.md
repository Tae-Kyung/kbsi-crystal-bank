# GPU 서버 세팅 가이드 — ESM-2 임베딩 + 서열 클러스터링

## 개요

연구실 GPU 서버에서 ESM-2 단백질 언어 모델을 실행하여 286K construct 서열의 임베딩 벡터를 생성하고, Supabase DB에 저장합니다. 생성된 벡터는 서열 유사도 검색, 결정화 성공 예측 모델, 단백질 dedupe 등에 활용됩니다.

## 아키텍처

GPU 서버는 두 가지 역할을 합니다:

1. **배치 처리**: 전체 286K 서열의 임베딩을 사전 계산하여 DB에 저장
2. **실시간 API**: 사용자가 새 서열을 입력하면 즉시 임베딩 계산 + 유사 서열 검색

```
                    [배치 처리]
                    GPU 서버 --> Supabase (kbsi_embedding 저장)

                    [실시간 서비스]
사용자 --> Vercel --> GPU API (/embed, /search) --> Supabase (pgvector 검색)
                      :8000
                    (FastAPI + ESM-2)
```

**GPU 서버 요구사항**:
- 고정 IP 또는 도메인 (Vercel에서 접근 가능해야 함)
- 방화벽에서 API 포트(8000) 오픈
- HTTPS 권장 (nginx reverse proxy + Let's Encrypt)

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

# API 서버용
pip install fastapi uvicorn
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

## 8. 실시간 API 서버 (FastAPI)

### 8.1 API 서버 코드

`api_server.py`:

```python
"""
ESM-2 실시간 임베딩 API 서버

GPU 서버에서 실행:
  python api_server.py                     # 기본 (포트 8000)
  python api_server.py --port 8080         # 포트 변경
  python api_server.py --model 3B          # 3B 모델 사용

Vercel에서 호출:
  POST http://gpu-server:8000/embed   { "sequence": "MKTL..." }
  POST http://gpu-server:8000/search  { "sequence": "MKTL...", "limit": 10 }
  GET  http://gpu-server:8000/health
"""

import os, torch, esm, argparse
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

# ─── 인자 ───
parser = argparse.ArgumentParser()
parser.add_argument("--port", type=int, default=8000)
parser.add_argument("--model", choices=["650M", "3B"], default="650M")
args, _ = parser.parse_known_args()

MODEL_MAP = {
    "650M": ("esm2_t33_650M_UR50D", 33, 1280),
    "3B":   ("esm2_t36_3B_UR50D",   36, 2560),
}
model_name, repr_layer, embed_dim = MODEL_MAP[args.model]

# ─── 글로벌 리소스 ───
model = None
alphabet = None
batch_converter = None
device = None
sb = None

API_KEY = os.environ.get("KBSI_API_KEY", "")  # 선택적 인증

@asynccontextmanager
async def lifespan(app: FastAPI):
    global model, alphabet, batch_converter, device, sb

    # 모델 로드
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"Loading {model_name} on {device}...")
    model_obj, alphabet = esm.pretrained.__dict__[model_name]()
    model = model_obj.eval().to(device)
    batch_converter = alphabet.get_batch_converter()

    # Supabase 연결
    sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])

    print(f"API server ready on port {args.port}")
    yield
    print("Shutting down...")

app = FastAPI(title="KBSI ESM-2 API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://kbsi-crystal-bank.vercel.app",
        "http://localhost:3000",
    ],
    allow_methods=["POST", "GET"],
    allow_headers=["*"],
)

MAX_SEQ_LEN = 1022

# ─── Request/Response 모델 ───
class EmbedRequest(BaseModel):
    sequence: str
    api_key: str = ""

class EmbedResponse(BaseModel):
    embedding: list[float]
    sequence_length: int
    model: str

class SearchRequest(BaseModel):
    sequence: str
    limit: int = 10
    threshold: float = 0.7
    api_key: str = ""

class SearchResult(BaseModel):
    construct_id: int
    construct_name: str
    protein_name: str
    organism: str
    similarity: float

class SearchResponse(BaseModel):
    results: list[SearchResult]
    query_length: int
    model: str

# ─── 인증 체크 ───
def check_auth(api_key: str):
    if API_KEY and api_key != API_KEY:
        raise HTTPException(status_code=401, detail="Invalid API key")

# ─── 임베딩 계산 ───
def compute_embedding(sequence: str) -> list[float]:
    seq = sequence.upper().replace(" ", "")[:MAX_SEQ_LEN]
    if len(seq) < 10:
        raise HTTPException(status_code=400, detail="Sequence must be at least 10 residues")

    _, _, tokens = batch_converter([("query", seq)])
    tokens = tokens.to(device)

    with torch.no_grad():
        results = model(tokens, repr_layers=[repr_layer])

    emb = results["representations"][repr_layer][0, 1:len(seq)+1].mean(dim=0)
    return emb.cpu().tolist()

# ─── 엔드포인트 ───
@app.get("/health")
async def health():
    return {
        "status": "ok",
        "model": model_name,
        "device": str(device),
        "gpu": torch.cuda.get_device_name(0) if device.type == "cuda" else "cpu",
    }

@app.post("/embed", response_model=EmbedResponse)
async def embed(req: EmbedRequest):
    check_auth(req.api_key)
    seq = req.sequence.upper().replace(" ", "")
    embedding = compute_embedding(seq)
    return EmbedResponse(
        embedding=embedding,
        sequence_length=len(seq[:MAX_SEQ_LEN]),
        model=model_name,
    )

@app.post("/search", response_model=SearchResponse)
async def search(req: SearchRequest):
    check_auth(req.api_key)
    seq = req.sequence.upper().replace(" ", "")
    query_emb = compute_embedding(seq)

    # pgvector 유사도 검색
    result = sb.rpc("match_embeddings", {
        "query_embedding": query_emb,
        "match_threshold": req.threshold,
        "match_count": req.limit,
    }).execute()

    results = []
    for r in result.data or []:
        results.append(SearchResult(
            construct_id=r["construct_id"],
            construct_name=r.get("construct_name", ""),
            protein_name=r.get("protein_name", ""),
            organism=r.get("organism", ""),
            similarity=round(r["similarity"], 4),
        ))

    return SearchResponse(
        results=results,
        query_length=len(seq[:MAX_SEQ_LEN]),
        model=model_name,
    )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=args.port)
```

### 8.2 Supabase RPC 함수 (유사도 검색)

Supabase SQL Editor에서 실행:

```sql
CREATE OR REPLACE FUNCTION match_embeddings(
  query_embedding vector(1280),
  match_threshold float DEFAULT 0.7,
  match_count int DEFAULT 10
)
RETURNS TABLE (
  construct_id bigint,
  construct_name text,
  protein_name text,
  organism text,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    e.construct_id,
    c.name AS construct_name,
    p.full_name AS protein_name,
    p.organism,
    (1 - (e.embedding <=> query_embedding))::float AS similarity
  FROM kbsi_embedding e
  JOIN kbsi_construct c ON c.id = e.construct_id
  JOIN kbsi_protein p ON p.id = c.protein_id
  WHERE 1 - (e.embedding <=> query_embedding) > match_threshold
  ORDER BY e.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
```

### 8.3 API 서버 실행

```bash
# 직접 실행
python api_server.py --port 8000

# 백그라운드 (systemd 서비스 권장)
nohup python api_server.py --port 8000 > api.log 2>&1 &

# 테스트
curl http://localhost:8000/health
curl -X POST http://localhost:8000/embed \
  -H "Content-Type: application/json" \
  -d '{"sequence": "MTEYKLVVVGAGGVGKSALTIQLIQ"}'
```

### 8.4 systemd 서비스 등록 (자동 시작)

```bash
sudo tee /etc/systemd/system/kbsi-esm2.service << 'EOF'
[Unit]
Description=KBSI ESM-2 API Server
After=network.target

[Service]
Type=simple
User=kbsi
WorkingDirectory=/home/kbsi/kbsi-gpu
Environment="PATH=/home/kbsi/miniconda3/envs/kbsi/bin:$PATH"
ExecStart=/home/kbsi/miniconda3/envs/kbsi/bin/python api_server.py --port 8000
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now kbsi-esm2
sudo systemctl status kbsi-esm2
```

### 8.5 nginx reverse proxy (HTTPS)

```nginx
# /etc/nginx/sites-available/kbsi-esm2
server {
    listen 443 ssl;
    server_name gpu.kbsi-lab.kr;  # 연구실 도메인

    ssl_certificate /etc/letsencrypt/live/gpu.kbsi-lab.kr/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/gpu.kbsi-lab.kr/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 60s;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/kbsi-esm2 /etc/nginx/sites-enabled/
sudo certbot --nginx -d gpu.kbsi-lab.kr
sudo systemctl restart nginx
```

### 8.6 Vercel에서 GPU API 호출

```typescript
// src/lib/external/esm2-api.ts
const ESM2_API_URL = process.env.ESM2_API_URL; // https://gpu.kbsi-lab.kr
const ESM2_API_KEY = process.env.ESM2_API_KEY;

export async function getEmbedding(sequence: string): Promise<number[]> {
  const res = await fetch(`${ESM2_API_URL}/embed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sequence, api_key: ESM2_API_KEY }),
  });
  if (!res.ok) throw new Error(`ESM-2 API error: ${res.status}`);
  const data = await res.json();
  return data.embedding;
}

export async function searchSimilar(
  sequence: string,
  limit = 10,
  threshold = 0.7
) {
  const res = await fetch(`${ESM2_API_URL}/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sequence, limit, threshold, api_key: ESM2_API_KEY }),
  });
  if (!res.ok) throw new Error(`ESM-2 API error: ${res.status}`);
  return res.json();
}
```

```bash
# Vercel 환경변수 추가
vercel env add ESM2_API_URL    # https://gpu.kbsi-lab.kr
vercel env add ESM2_API_KEY    # 서버에 설정한 API 키
```

---

## 9. 임베딩 활용 요약

| 용도 | 방법 | 경로 |
|------|------|------|
| **실시간 유사 서열 검색** | 사용자 서열 → GPU API `/search` → pgvector | Vercel → GPU → Supabase |
| **결정화 조건 추천** | 유사 단백질 → 성공 조건 조회 | GPU `/search` + Supabase 쿼리 |
| **단백질 dedupe** | 전체 임베딩 → cosine similarity | 배치 스크립트 |
| **ML 피처** | 임베딩 벡터를 예측 모델 입력으로 | Supabase kbsi_embedding |
| **MCP 도구** | `sequence_search` 도구에서 k-mer 대신 ESM-2 사용 | Vercel API |

---

## 10. 체크리스트 (학생에게 전달)

### 필요한 것

| # | 항목 | 제공 방법 |
|---|------|----------|
| 1 | 이 문서 (`gpu-setup-guide.md`) | Git repo `data/` 폴더 |
| 2 | `.env` 파일 (Supabase URL + Service Role Key) | 별도 전달 (보안) |
| 3 | GPU 서버 접근 권한 (SSH) | 연구실 관리자 |
| 4 | 도메인 또는 고정 IP | 연구실 네트워크 관리자 |

**서열 데이터는 별도 전달 불필요** -- 스크립트가 Supabase에서 직접 읽습니다. `.env`만 있으면 됩니다.

### 세팅 순서

1. Conda 환경 생성 + 패키지 설치 (섹션 1)
2. `.env` 파일 생성 (섹션 2)
3. `python api_server.py` 로 테스트 (섹션 8.3)
4. `curl http://localhost:8000/health` 확인
5. `python esm2_embed.py --limit 100` 배치 테스트 (섹션 6.2)
6. systemd 서비스 등록 (섹션 8.4)
7. nginx + HTTPS 설정 (섹션 8.5)
8. Vercel 환경변수 추가 (섹션 8.6)
9. `python esm2_embed.py` 전체 배치 실행 (섹션 6.3)

### Supabase 마이그레이션 (관리자가 사전에 실행)

학생이 세팅하기 전에 Supabase에서 아래를 실행해야 합니다:
- `CREATE EXTENSION vector;` (섹션 3)
- `CREATE TABLE kbsi_embedding ...` (섹션 3)
- `CREATE FUNCTION match_embeddings ...` (섹션 8.2)

---

## 11. 트러블슈팅

| 문제 | 해결 |
|------|------|
| CUDA out of memory | `--batch-size` 줄이기 (4 -> 2 -> 1) |
| Supabase 연결 거부 | `.env` 파일의 URL/Key 확인, 방화벽 확인 |
| ESM-2 다운로드 느림 | 첫 실행 시 모델 다운로드 (~2.5GB), 이후 캐시됨 |
| 긴 서열 OOM | MAX_SEQ_LEN=1022로 자동 자름 (ESM-2 제한) |
| pgvector 미설치 | Supabase Dashboard > SQL Editor > `CREATE EXTENSION vector;` |
