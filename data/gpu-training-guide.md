# Training the Crystallization Success Prediction Model

## Overview

We're building a machine learning model that predicts whether a crystallization experiment will succeed or fail, given:
- A protein sequence (converted to a 1280-dim ESM-2 embedding)
- Crystallization conditions (pH, temperature, precipitant type, concentration)

The model is **XGBoost** and runs on the same GPU server as the ESM-2 API.

```
Training data (from Supabase):
  216K successful crystallizations (from PDB)
  921K failed crystallizations (synthetic negatives)
       ↓
  Each row = [ESM-2 embedding (1280) + pH + temp + precipitant + conc] → success/failure
       ↓
  XGBoost classifier → success_model.joblib

Serving:
  POST /predict { sequence, ph, temperature, precipitant_type, precipitant_conc }
       ↓
  ESM-2 embedding + conditions → XGBoost → { success_probability: 73.2% }
```

---

## Step 1: Install additional packages

```bash
conda activate kbsi
pip install xgboost scikit-learn pandas joblib
```

## Step 2: Get the training script

The script is in the git repo. Copy it to the GPU server:

```bash
cd ~/kbsi-gpu

# Option A: Clone the repo (if you haven't)
git clone https://github.com/Tae-Kyung/kbsi-crystal-bank.git
cp kbsi-crystal-bank/scripts/python/train_success_model.py .
cp kbsi-crystal-bank/scripts/python/predict_endpoint.py .

# Option B: Download directly
curl -O https://raw.githubusercontent.com/Tae-Kyung/kbsi-crystal-bank/main/scripts/python/train_success_model.py
curl -O https://raw.githubusercontent.com/Tae-Kyung/kbsi-crystal-bank/main/scripts/python/predict_endpoint.py
```

## Step 3: Quick test (small dataset)

```bash
python train_success_model.py --limit 50000
```

This trains on 50K samples to verify everything works. Should take ~2 minutes. You'll see output like:

```
Loading crystallization data...
  Total crystallization rows: 50000
  After filtering (ph+temp required): 49800
  Success: 12000, Failure: 37800
Loading embeddings...
  Embeddings loaded: 15000
  Final dataset: 48000
  Feature matrix: (48000, 1284)

=== Training XGBoost ===
  scale_pos_weight: 3.15
  [0]  validation_0-logloss: 0.58
  [20] validation_0-logloss: 0.32
  ...

=== Evaluation ===
  Accuracy:  91.2%
  Precision: 88.5%
  F1:        89.3%
  AUC-ROC:   95.1%

=== Baseline (conditions only, no embedding) ===
  Accuracy:  85.4%
  F1:        83.1%
  AUC-ROC:   89.2%

=== ESM-2 Embedding Improvement ===
  Accuracy: +5.8%
  F1:       +6.2%
  AUC-ROC:  +5.9%
```

## Step 4: Full training

```bash
# This processes ~1.1M rows. Takes 30-60 minutes depending on CPU.
# The heavy part is loading embeddings from Supabase, not the XGBoost training itself.
nohup python train_success_model.py > training.log 2>&1 &
tail -f training.log
```

Three files will be created:
- `success_model.joblib` — trained XGBoost model (~50 MB)
- `precipitant_encoder.joblib` — label encoder for precipitant names (~10 KB)
- `model_metrics.json` — evaluation results

**Send me `model_metrics.json` when done** — the numbers go directly into the paper.

## Step 5: Add `/predict` endpoint to the API server

Open `api_server.py` and add the following:

### 5.1 Add import at the top

```python
import joblib
import numpy as np
```

### 5.2 Add global variables

```python
success_model = None
precipitant_encoder = None
```

### 5.3 Load model in the `lifespan` function

Add these lines after `batch_converter = alphabet.get_batch_converter()`:

```python
    global success_model, precipitant_encoder
    try:
        success_model = joblib.load("success_model.joblib")
        precipitant_encoder = joblib.load("precipitant_encoder.joblib")
        print("Success prediction model loaded")
    except FileNotFoundError:
        print("WARNING: success_model.joblib not found, /predict disabled")
```

### 5.4 Add request model

```python
class PredictRequest(BaseModel):
    sequence: str
    ph: float = 7.0
    temperature: float = 18.0
    precipitant_type: str = "unknown"
    precipitant_conc: float = 0.0
    api_key: str = ""
```

### 5.5 Add the endpoint

```python
@app.post("/predict")
async def predict(req: PredictRequest):
    check_auth(req.api_key)
    if success_model is None:
        raise HTTPException(status_code=503, detail="Prediction model not loaded")

    # 1. ESM-2 embedding
    embedding = compute_embedding(req.sequence)

    # 2. Encode precipitant
    known = set(precipitant_encoder.classes_)
    precip = req.precipitant_type if req.precipitant_type in known else "unknown"
    precip_encoded = int(precipitant_encoder.transform([precip])[0])

    # 3. Build feature vector
    features = np.array(
        embedding + [req.ph, req.temperature, precip_encoded, req.precipitant_conc]
    ).reshape(1, -1)

    # 4. Predict
    prob = float(success_model.predict_proba(features)[0, 1])

    return {
        "success_probability": round(prob * 100, 1),
        "confidence": "high" if prob > 0.7 or prob < 0.3 else "medium",
        "model": "xgboost_esm2",
        "input": {
            "sequence_length": min(len(req.sequence), 1022),
            "ph": req.ph,
            "temperature": req.temperature,
            "precipitant_type": req.precipitant_type,
            "precipitant_conc": req.precipitant_conc,
        },
    }
```

### 5.6 Update the `/health` endpoint

Add model status to the health check:

```python
@app.get("/health")
async def health():
    return {
        "status": "ok",
        "model": model_name,
        "device": str(device),
        "gpu": torch.cuda.get_device_name(0) if device and device.type == "cuda" else "cpu",
        "prediction_model": "loaded" if success_model is not None else "not loaded",
    }
```

## Step 6: Restart the API server

```bash
sudo systemctl restart kbsi-esm2
```

## Step 7: Test the `/predict` endpoint

```bash
# Health check (should show "prediction_model": "loaded")
curl https://kbsi-esm2.aiconvergencelab.com/health

# Test prediction
curl -X POST https://kbsi-esm2.aiconvergencelab.com/predict \
  -H "Content-Type: application/json" \
  -d '{
    "sequence": "MTEYKLVVVGAVGVGKSALTIQLIQNHFVDEYDPTIEDSYRKQVVIDGETCLLDILDTAGQEEYSAMRDQYMRTGEGFLCVFAINNTKSFEDIHHQRQETKRRASYTEKEVKDFLARILSSA",
    "ph": 7.0,
    "temperature": 18,
    "precipitant_type": "PEG 3350",
    "precipitant_conc": 25,
    "api_key": "<KBSI_API_KEY>"
  }'
```

Expected response:
```json
{
  "success_probability": 73.2,
  "confidence": "high",
  "model": "xgboost_esm2"
}
```

---

## Checklist

| # | Task | Test | Expected |
|---|------|------|----------|
| 1 | Install packages | `python -c "import xgboost; print(xgboost.__version__)"` | Version number |
| 2 | Quick test | `python train_success_model.py --limit 50000` | Metrics printed |
| 3 | Full training | `python train_success_model.py` | 3 files created |
| 4 | Model files exist | `ls -lh success_model.joblib precipitant_encoder.joblib model_metrics.json` | All 3 present |
| 5 | API updated | `curl localhost:8000/health` | `"prediction_model": "loaded"` |
| 6 | Prediction works | `curl -X POST localhost:8000/predict ...` | `success_probability` returned |
| 7 | External access | `curl https://kbsi-esm2.aiconvergencelab.com/predict ...` | Same result |

**When done, send me:**
1. `model_metrics.json` (the full file)
2. Screenshot of the `/predict` test result

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `ModuleNotFoundError: xgboost` | `pip install xgboost` |
| Training is slow | Bottleneck is Supabase data loading, not XGBoost. Use `--limit 100000` for faster test |
| `MemoryError` during training | 1.1M rows × 1284 features needs ~6GB RAM. Reduce with `--limit` |
| `success_model.joblib not found` | Run training first, or check working directory |
| `/predict` returns 503 | Model not loaded. Check server logs: `journalctl -u kbsi-esm2 -n 50` |
| Supabase timeout loading data | Script loads in pages of 1000. If timeout, restart and it will resume from where it stopped |
