# GPU Server Setup Guide — ESM-2 Embedding + Sequence Clustering

## Overview

This guide explains how to set up a GPU server to run the ESM-2 protein language model for the KBSI Protein Crystallization Bank. The server computes embedding vectors for ~286K protein construct sequences and provides a real-time API for sequence similarity search.

## Architecture

The GPU server has two roles:

1. **Batch processing**: Pre-compute embeddings for all 286K sequences and store them in the database
2. **Real-time API**: When a user submits a new sequence, compute its embedding on-the-fly and search for similar proteins

```
                    [Batch — one time]
                    GPU Server --> Supabase (store kbsi_embedding)

                    [Real-time service]
User --> Vercel --> GPU API (/embed, /search) --> Supabase (pgvector search)
                     :8000
                   (FastAPI + ESM-2)
```

**GPU server requirements**:
- Static IP or domain (must be reachable from Vercel)
- Firewall must allow API port (8000)
- HTTPS recommended (nginx reverse proxy + Let's Encrypt)

---

## 1. Environment Setup

### 1.1 Create Conda environment

```bash
conda create -n kbsi python=3.11 -y
conda activate kbsi
```

### 1.2 Install PyTorch (match your CUDA version)

```bash
# For CUDA 12.1
pip install torch torchvision --index-url https://download.pytorch.org/whl/cu121

# For CUDA 11.8
# pip install torch torchvision --index-url https://download.pytorch.org/whl/cu118
```

### 1.3 Install ESM-2 and dependencies

```bash
pip install fair-esm
pip install supabase python-dotenv tqdm

# For the API server
pip install fastapi uvicorn
```

### 1.4 Install sequence clustering tool (optional, for dedupe)

```bash
conda install -c bioconda mmseqs2 -y
```

---

## 2. Environment Variables

Create a `.env` file on the GPU server. **I will send you the credentials separately.**

```bash
cat > .env << 'EOF'
SUPABASE_URL=<will be provided>
SUPABASE_SERVICE_ROLE_KEY=<will be provided>
KBSI_API_KEY=<choose a secret key for API auth>
EOF
```

**IMPORTANT**: The Service Role Key bypasses Row Level Security. Never expose it publicly or commit it to git.

---

## 3. Database Migration (already done by admin)

The following has already been applied to Supabase. No action needed from you.

```sql
-- pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Embedding storage table
CREATE TABLE kbsi_embedding (
  construct_id BIGINT PRIMARY KEY REFERENCES kbsi_construct(id) ON DELETE CASCADE,
  embedding    vector(1280),        -- ESM-2 650M output dimension
  model        TEXT DEFAULT 'esm2_t33_650M',
  created_at   TIMESTAMPTZ DEFAULT now()
);

-- Similarity search index (cosine distance)
CREATE INDEX idx_kbsi_embedding_ivfflat
  ON kbsi_embedding USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- Similarity search RPC function
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

---

## 4. Batch Embedding Script

Create `esm2_embed.py`:

```python
"""
ESM-2 protein sequence embedding generator + Supabase storage

Usage:
  python esm2_embed.py                    # Run all
  python esm2_embed.py --limit 1000       # Test with 1000 sequences
  python esm2_embed.py --model 3B         # Use 3B model (H200 recommended)
"""

import os, sys, torch, esm, argparse
from dotenv import load_dotenv
from supabase import create_client
from tqdm import tqdm

load_dotenv()

# --- Args ---
parser = argparse.ArgumentParser()
parser.add_argument("--limit", type=int, default=0, help="Max sequences to process (0=all)")
parser.add_argument("--batch-size", type=int, default=8, help="GPU batch size")
parser.add_argument("--model", choices=["650M", "3B"], default="650M", help="ESM-2 model size")
args = parser.parse_args()

# --- Supabase connection ---
sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])

# --- Load ESM-2 model ---
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
MAX_SEQ_LEN = 1022  # ESM-2 max input length

print(f"Model: {model_name}, embed_dim: {embed_dim}, batch_size: {BATCH_SIZE}")

# --- Load already-processed construct IDs ---
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

# --- Load sequences from DB ---
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

# --- Batch embedding function ---
def embed_batch(sequences: list[tuple[str, str]]) -> list[list[float]]:
    """(label, seq) tuples -> list of mean embeddings"""
    _, _, tokens = batch_converter(sequences)
    tokens = tokens.to(device)

    with torch.no_grad():
        results = model(tokens, repr_layers=[repr_layer])

    embeddings = []
    for i, (_, seq) in enumerate(sequences):
        # Mean of token representations (excluding CLS and EOS)
        emb = results["representations"][repr_layer][i, 1:len(seq)+1].mean(dim=0)
        embeddings.append(emb.cpu().tolist())

    return embeddings

# --- Main loop ---
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
            # Retry one by one (may fail on very long sequences)
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

# Remaining batch
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

## 5. Real-time API Server (FastAPI)

Create `api_server.py`:

```python
"""
ESM-2 real-time embedding API server

Run on GPU server:
  python api_server.py                     # default (port 8000)
  python api_server.py --port 8080         # custom port
  python api_server.py --model 3B          # use 3B model

Endpoints:
  GET  /health                             # health check
  POST /embed   { "sequence": "MKTL..." }  # get embedding vector
  POST /search  { "sequence": "MKTL...", "limit": 10 }  # find similar proteins
"""

import os, torch, esm, argparse
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

# --- Args ---
parser = argparse.ArgumentParser()
parser.add_argument("--port", type=int, default=8000)
parser.add_argument("--model", choices=["650M", "3B"], default="650M")
args, _ = parser.parse_known_args()

MODEL_MAP = {
    "650M": ("esm2_t33_650M_UR50D", 33, 1280),
    "3B":   ("esm2_t36_3B_UR50D",   36, 2560),
}
model_name, repr_layer, embed_dim = MODEL_MAP[args.model]

# --- Global resources ---
model = None
alphabet = None
batch_converter = None
device = None
sb = None

API_KEY = os.environ.get("KBSI_API_KEY", "")

@asynccontextmanager
async def lifespan(app: FastAPI):
    global model, alphabet, batch_converter, device, sb

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"Loading {model_name} on {device}...")
    model_obj, alphabet = esm.pretrained.__dict__[model_name]()
    model = model_obj.eval().to(device)
    batch_converter = alphabet.get_batch_converter()

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

# --- Request/Response models ---
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

# --- Auth check ---
def check_auth(api_key: str):
    if API_KEY and api_key != API_KEY:
        raise HTTPException(status_code=401, detail="Invalid API key")

# --- Compute embedding ---
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

# --- Endpoints ---
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

---

## 6. Running the Server

### 6.1 Verify GPU

```bash
nvidia-smi
# Check CUDA version, GPU model, VRAM
```

### 6.2 Test run (small batch)

```bash
# Test with 100 sequences first
python esm2_embed.py --limit 100 --batch-size 4
```

### 6.3 Start API server

```bash
# Direct run
python api_server.py --port 8000

# Test health endpoint
curl http://localhost:8000/health

# Test embedding
curl -X POST http://localhost:8000/embed \
  -H "Content-Type: application/json" \
  -d '{"sequence": "MTEYKLVVVGAGGVGKSALTIQLIQ"}'
```

### 6.4 Run full batch embedding (background)

```bash
nohup python esm2_embed.py --batch-size 8 > embed.log 2>&1 &
tail -f embed.log
```

**Safe to restart**: The script loads already-processed IDs first, so if interrupted, just re-run the same command and it will skip completed sequences automatically.

### 6.5 Register as systemd service (auto-start on reboot)

```bash
sudo tee /etc/systemd/system/kbsi-esm2.service << 'EOF'
[Unit]
Description=KBSI ESM-2 API Server
After=network.target

[Service]
Type=simple
User=<your_username>
WorkingDirectory=/home/<your_username>/kbsi-gpu
Environment="PATH=/home/<your_username>/miniconda3/envs/kbsi/bin:$PATH"
ExecStart=/home/<your_username>/miniconda3/envs/kbsi/bin/python api_server.py --port 8000
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now kbsi-esm2
sudo systemctl status kbsi-esm2
```

### 6.6 HTTPS with nginx (recommended for production)

```nginx
# /etc/nginx/sites-available/kbsi-esm2
server {
    listen 443 ssl;
    server_name <your_domain>;

    ssl_certificate /etc/letsencrypt/live/<your_domain>/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/<your_domain>/privkey.pem;

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
sudo certbot --nginx -d <your_domain>
sudo systemctl restart nginx
```

---

## 7. Estimated Time

| Task | H200 (80GB) | A100 (80GB) | RTX 4090 (24GB) |
|------|-------------|-------------|-----------------|
| ESM-2 650M embedding (286K seqs) | ~4 hours | ~8 hours | ~12 hours |
| ESM-2 3B embedding (286K seqs) | ~8 hours | ~20 hours | OOM |

### Batch size guide

| GPU VRAM | ESM-2 650M | ESM-2 3B |
|----------|-----------|----------|
| 24GB | batch_size=4 | N/A |
| 40GB | batch_size=8 | batch_size=2 |
| 80GB | batch_size=16 | batch_size=4 |

---

## 8. Step-by-Step Checklist

### What you need from me

| # | Item | How |
|---|------|-----|
| 1 | This document | Already in the repo: `data/gpu-setup-guide.md` |
| 2 | `.env` credentials (Supabase URL + Key) | I will send separately (do NOT share) |
| 3 | GPU server SSH access | Lab admin |

**You do NOT need sequence data files** -- the scripts read directly from Supabase.

### Setup order

1. SSH into GPU server
2. Create conda env + install packages (Section 1)
3. Create `.env` file with the credentials I send you (Section 2)
4. Run `python api_server.py` and test with `curl http://localhost:8000/health` (Section 6.3)
5. Run `python esm2_embed.py --limit 100` to test batch processing (Section 6.2)
6. If everything works, run full batch: `nohup python esm2_embed.py --batch-size 8 > embed.log 2>&1 &` (Section 6.4)
7. Register systemd service for auto-restart (Section 6.5)
8. Set up nginx + HTTPS if needed (Section 6.6)
9. Tell me the server URL so I can configure Vercel

---

## 9. Troubleshooting

| Problem | Solution |
|---------|----------|
| CUDA out of memory | Reduce `--batch-size` (8 -> 4 -> 2 -> 1) |
| Supabase connection refused | Check `.env` values, check firewall allows outbound HTTPS |
| ESM-2 download slow | First run downloads ~2.5GB model, cached after that |
| Long sequence OOM | Automatically truncated to 1022 residues (ESM-2 limit) |
| `ModuleNotFoundError: fair-esm` | Make sure conda env is activated: `conda activate kbsi` |
| API server won't start | Check port 8000 is not in use: `lsof -i :8000` |
