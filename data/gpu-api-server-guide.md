# GPU API Server Setup — ESM-2 Real-time Embedding

## What This Does

The web app (kbsi-crystal-bank.vercel.app) needs to convert a protein sequence into a 1280-dimensional vector using the ESM-2 language model. This requires a GPU. Your job is to run a small FastAPI server on the lab GPU that does this conversion.

```
User types a sequence on the website
    |
    v
Vercel (web server) --HTTP POST--> GPU Server :8000/search
    |                                   |
    |                           ESM-2 model converts
    |                           sequence -> 1280-dim vector
    |                                   |
    |                           Supabase pgvector finds
    |                           similar proteins (284K DB)
    |                                   |
    v                                   v
User sees similar proteins + crystallization recommendations
```

---

## Prerequisites

- GPU server with CUDA (any NVIDIA GPU with 8GB+ VRAM)
- SSH access to the server
- `.env` file (I will send credentials separately)

---

## Step-by-Step Setup

### 1. Create environment

```bash
conda create -n kbsi python=3.11 -y
conda activate kbsi
```

### 2. Install packages

```bash
# Check your CUDA version first
nvidia-smi
# Look for "CUDA Version: XX.X" in the top right

# Install PyTorch (pick ONE matching your CUDA version)
pip install torch --index-url https://download.pytorch.org/whl/cu121   # CUDA 12.x
# pip install torch --index-url https://download.pytorch.org/whl/cu118 # CUDA 11.8

# Install ESM-2 + API server
pip install fair-esm fastapi uvicorn supabase python-dotenv
```

### 3. Create project directory

```bash
mkdir -p ~/kbsi-gpu && cd ~/kbsi-gpu
```

### 4. Create `.env` file

I will send you the values. Paste them:

```bash
cat > .env << 'EOF'
SUPABASE_URL=<I will send this>
SUPABASE_SERVICE_ROLE_KEY=<I will send this>
KBSI_API_KEY=<I will send this>
EOF
```

**IMPORTANT: Never share these values or commit to git.**

### 5. Create `api_server.py`

```bash
cat > api_server.py << 'PYEOF'
"""
KBSI ESM-2 API Server
- GET  /health              -> server status
- POST /embed  {sequence}   -> 1280-dim embedding vector
- POST /search {sequence}   -> similar proteins from DB
"""

import os, torch, esm, argparse
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

parser = argparse.ArgumentParser()
parser.add_argument("--port", type=int, default=8000)
parser.add_argument("--model", choices=["650M", "3B"], default="650M")
args, _ = parser.parse_known_args()

MODEL_MAP = {
    "650M": ("esm2_t33_650M_UR50D", 33, 1280),
    "3B":   ("esm2_t36_3B_UR50D",   36, 2560),
}
model_name, repr_layer, embed_dim = MODEL_MAP[args.model]

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
    print(f"Ready! http://0.0.0.0:{args.port}")
    yield

app = FastAPI(title="KBSI ESM-2 API", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://kbsi-crystal-bank.vercel.app", "http://localhost:3000"],
    allow_methods=["POST", "GET"],
    allow_headers=["*"],
)

MAX_SEQ_LEN = 1022

class EmbedRequest(BaseModel):
    sequence: str
    api_key: str = ""

class SearchRequest(BaseModel):
    sequence: str
    limit: int = 10
    threshold: float = 0.5
    api_key: str = ""

class SearchResult(BaseModel):
    construct_id: int
    construct_name: str
    protein_name: str
    organism: str
    similarity: float

def check_auth(api_key: str):
    if API_KEY and api_key != API_KEY:
        raise HTTPException(status_code=401, detail="Invalid API key")

def compute_embedding(sequence: str) -> list[float]:
    seq = sequence.upper().replace(" ", "")[:MAX_SEQ_LEN]
    if len(seq) < 10:
        raise HTTPException(status_code=400, detail="Sequence must be >= 10 residues")
    _, _, tokens = batch_converter([("query", seq)])
    tokens = tokens.to(device)
    with torch.no_grad():
        results = model(tokens, repr_layers=[repr_layer])
    emb = results["representations"][repr_layer][0, 1:len(seq)+1].mean(dim=0)
    return emb.cpu().tolist()

@app.get("/health")
async def health():
    return {
        "status": "ok",
        "model": model_name,
        "device": str(device),
        "gpu": torch.cuda.get_device_name(0) if device and device.type == "cuda" else "cpu",
        "embeddings_dim": embed_dim,
    }

@app.post("/embed")
async def embed(req: EmbedRequest):
    check_auth(req.api_key)
    embedding = compute_embedding(req.sequence)
    return {"embedding": embedding, "sequence_length": min(len(req.sequence), MAX_SEQ_LEN), "model": model_name}

@app.post("/search")
async def search(req: SearchRequest):
    check_auth(req.api_key)
    query_emb = compute_embedding(req.sequence)
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
    return {"results": results, "query_length": min(len(req.sequence), MAX_SEQ_LEN), "model": model_name}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=args.port)
PYEOF
```

### 6. First run (test)

```bash
cd ~/kbsi-gpu
conda activate kbsi
python api_server.py
```

First run downloads ESM-2 model (~2.5 GB), takes a few minutes. After loading you should see:

```
Loading esm2_t33_650M_UR50D on cuda...
Ready! http://0.0.0.0:8000
```

### 7. Test the API

Open another terminal:

```bash
# Health check
curl http://localhost:8000/health

# Test embedding (should return 1280 numbers)
curl -X POST http://localhost:8000/embed \
  -H "Content-Type: application/json" \
  -d '{"sequence": "MTEYKLVVVGAVGVGKSALTIQLIQ", "api_key": "<KBSI_API_KEY>"}'

# Test search (should return similar proteins)
curl -X POST http://localhost:8000/search \
  -H "Content-Type: application/json" \
  -d '{"sequence": "MTEYKLVVVGAVGVGKSALTIQLIQNHFVDEYDPTIEDSYRKQVVIDGETCLLDILDTAGQEEYSAMRDQYMRTGEGFLCVFAINNTKSFEDIHHQRQETKRRASYTEKEVKDFLARILSSA", "limit": 5, "api_key": "<KBSI_API_KEY>"}'
```

If `/search` returns GTPase KRas proteins, everything works!

### 8. Run as background service

```bash
# Option A: Simple background process
nohup python api_server.py --port 8000 > api.log 2>&1 &
echo $! > api.pid
tail -f api.log

# Option B: systemd (auto-restart on reboot, recommended)
sudo tee /etc/systemd/system/kbsi-esm2.service << EOF
[Unit]
Description=KBSI ESM-2 API Server
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$HOME/kbsi-gpu
Environment="PATH=$HOME/miniconda3/envs/kbsi/bin:\$PATH"
ExecStart=$HOME/miniconda3/envs/kbsi/bin/python api_server.py --port 8000
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now kbsi-esm2
sudo systemctl status kbsi-esm2     # should show "active (running)"
journalctl -u kbsi-esm2 -f          # view logs
```

### 9. Expose to the internet

The Vercel web app needs to reach this server. Choose ONE:

#### Option A: Direct IP (simplest, if server has public IP)

```bash
# Open firewall
sudo ufw allow 8000/tcp

# Test from outside
curl http://<SERVER_IP>:8000/health
```

Then tell me: `http://<SERVER_IP>:8000`

#### Option B: nginx + HTTPS (recommended for production)

```bash
# Install nginx + certbot
sudo apt install nginx certbot python3-certbot-nginx -y

# Create config (replace <YOUR_DOMAIN>)
sudo tee /etc/nginx/sites-available/kbsi-esm2 << 'NGINX'
server {
    listen 80;
    server_name <YOUR_DOMAIN>;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 60s;
    }
}
NGINX

sudo ln -s /etc/nginx/sites-available/kbsi-esm2 /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl restart nginx

# Add HTTPS
sudo certbot --nginx -d <YOUR_DOMAIN>
```

Then tell me: `https://<YOUR_DOMAIN>`

#### Option C: ngrok (quick test, no domain needed)

```bash
# Install ngrok
curl -sSL https://ngrok-agent.s3.amazonaws.com/ngrok-v3-stable-linux-amd64.tgz | sudo tar xz -C /usr/local/bin
ngrok config add-authtoken <YOUR_NGROK_TOKEN>  # get from ngrok.com

# Tunnel
ngrok http 8000
```

ngrok gives you a URL like `https://xxxx.ngrok-free.app`. Tell me that URL.

---

## Checklist

| # | Task | Test command | Expected |
|---|------|-------------|----------|
| 1 | `nvidia-smi` works | `nvidia-smi` | Shows GPU info |
| 2 | conda env created | `conda activate kbsi && python -c "import torch; print(torch.cuda.is_available())"` | `True` |
| 3 | API server starts | `python api_server.py` | "Ready!" message |
| 4 | Health check | `curl localhost:8000/health` | `{"status":"ok",...}` |
| 5 | Embedding works | `curl -X POST localhost:8000/embed -H "Content-Type: application/json" -d '{"sequence":"MTEYKLVVV"}'` | 1280 numbers |
| 6 | Search works | `curl -X POST localhost:8000/search -H "Content-Type: application/json" -d '{"sequence":"MTEYKLVVVGAVGVGKSALTIQLIQ","limit":3}'` | KRas results |
| 7 | External access | `curl http://<IP>:8000/health` (from another machine) | `{"status":"ok"}` |
| 8 | Service auto-restart | `sudo systemctl status kbsi-esm2` | active (running) |

**When done, send me the external URL (step 7). I will configure Vercel to connect to it.**

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `nvidia-smi` not found | Install NVIDIA drivers: `sudo apt install nvidia-driver-535` |
| `torch.cuda.is_available()` is False | PyTorch CUDA version mismatch. Check `nvidia-smi` CUDA version and reinstall PyTorch |
| CUDA out of memory | Server needs at least 4GB VRAM for ESM-2 650M |
| Model download slow | First run downloads ~2.5GB, cached in `~/.cache/torch/hub/` after that |
| `ModuleNotFoundError: fair-esm` | `conda activate kbsi && pip install fair-esm` |
| Port 8000 already in use | `lsof -i :8000` to find the process, or use `--port 8080` |
| Supabase connection error | Check `.env` values are correct |
| Can't reach from outside | Check firewall: `sudo ufw status`, open port 8000 |
| Server dies after SSH disconnect | Use systemd (step 8) or `nohup` |
