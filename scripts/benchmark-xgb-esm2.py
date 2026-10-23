"""
XGBoost + LightGBM + ESM-2 벤치마크
precipitant enrichment v2 (56.6%) 반영 재학습

Usage:
  python scripts/benchmark-xgb-esm2.py                  # 기본 (50K 샘플)
  python scripts/benchmark-xgb-esm2.py --limit 100000   # 더 많은 데이터
  python scripts/benchmark-xgb-esm2.py --no-embedding    # ESM-2 없이 (baseline)
"""

import os, json, sys, time
import numpy as np
from pathlib import Path
from dotenv import load_dotenv
from supabase import create_client

# ─── Setup ───
load_dotenv(Path(__file__).resolve().parent.parent / ".env.local")
sb = create_client(os.environ["NEXT_PUBLIC_SUPABASE_URL"],
                   os.environ.get("SUPABASE_SERVICE_ROLE_KEY", os.environ["NEXT_PUBLIC_SUPABASE_ANON_KEY"]))

args = sys.argv[1:]
LIMIT = int(next((a.split("=")[1] for a in args if a.startswith("--limit")), "50000"))
NO_EMB = "--no-embedding" in args
SEED = 42

# ─── Precipitant encoding (top 30 by frequency) ───
PRECIP_MAP = {
    'PEG 3350': 1, 'PEG 4000': 2, 'PEG 8000': 3, 'PEG 6000': 4,
    'PEG 400': 5, 'PEG 3000': 6, 'Ammonium Sulfate': 7,
    'Sodium Chloride': 8, 'MPD': 9, 'Sodium Citrate': 10,
    'PEG 1500': 11, 'PEG 1000': 12, 'PEG 2000': 13,
    'Lithium Sulfate': 14, 'Sodium Formate': 15, 'Sodium Acetate': 16,
    'Potassium Phosphate': 17, 'PEG 20000': 18, 'PEG 200': 19,
    'Isopropanol': 20, 'PEG 10000': 21, 'Magnesium Sulfate': 22,
    'Magnesium Chloride': 23, 'PEG 5000': 24, 'Ethylene Glycol': 25,
    'Calcium Chloride': 26, 'Potassium Sodium Tartrate': 27,
    'Zinc Acetate': 28, 'Ethanol': 29, 'Glycerol': 30,
}

def precip_category(t):
    if not t: return 0
    tl = t.lower()
    if 'peg' in tl: return 1
    if any(s in tl for s in ['sulfate', 'chloride', 'phosphate', 'citrate', 'formate',
                              'malonate', 'acetate', 'tartrate', 'nitrate']): return 2
    if any(s in tl for s in ['mpd', 'isopropanol', 'ethanol', 'methanol', 'glycerol',
                              'dioxane', 'hexanediol']): return 3
    return 4

def fmt(n): return f"{n:,.0f}"

# ═══════════════════════════════════════════════════════
# 1. Data Loading
# ═══════════════════════════════════════════════════════
print("=" * 60)
print("XGBoost + LightGBM Benchmark (ESM-2 Embeddings)")
print(f"Limit: {fmt(LIMIT)}, Embedding: {'OFF' if NO_EMB else 'ON'}")
print("=" * 60)

print("\n[1/4] Loading crystallization data...")
rows = []
offset = 0
PAGE = 1000
while len(rows) < LIMIT:
    resp = sb.table("kbsi_crystallization").select(
        "construct_id, ph, temperature, precipitant_type, precipitant_conc, "
        "protein_concentration, additive, outcome"
    ).not_.is_("outcome", "null").range(offset, offset + PAGE - 1).execute()
    if not resp.data:
        break
    rows.extend(resp.data)
    offset += PAGE
    if len(resp.data) < PAGE:
        break
    if len(rows) % 10000 == 0:
        print(f"  {fmt(len(rows))} loaded...", end="\r")

rows = rows[:LIMIT]
print(f"  Loaded: {fmt(len(rows))} crystallization records")

# ─── Load embeddings ───
emb_map = {}
if not NO_EMB:
    print("\n[2/4] Loading ESM-2 embeddings...")
    construct_ids = list(set(r["construct_id"] for r in rows))
    # Load in batches (Supabase .in_() has limits)
    BATCH = 500
    loaded = 0
    for i in range(0, len(construct_ids), BATCH):
        batch_ids = construct_ids[i:i+BATCH]
        resp = sb.table("kbsi_embedding").select("construct_id, embedding").in_("construct_id", batch_ids).execute()
        if resp.data:
            for e in resp.data:
                emb_map[e["construct_id"]] = json.loads(e["embedding"])
                loaded += 1
        if loaded % 5000 == 0 and loaded > 0:
            print(f"  {fmt(loaded)} embeddings loaded...", end="\r")
    print(f"  Embeddings loaded: {fmt(len(emb_map))} / {fmt(len(construct_ids))} constructs ({len(emb_map)/len(construct_ids)*100:.1f}%)")
else:
    print("\n[2/4] Skipping embeddings (--no-embedding)")

# ═══════════════════════════════════════════════════════
# 2. Feature Engineering
# ═══════════════════════════════════════════════════════
print("\n[3/4] Feature engineering...")

SUCCESS_OUTCOMES = {"single_crystal", "diffraction_quality"}

X_list = []
y_list = []
emb_dims = 1280

for r in rows:
    ph = r["ph"] if r["ph"] is not None else 7.0
    temp = r["temperature"] if r["temperature"] is not None else 18.0
    precip_code = PRECIP_MAP.get(r["precipitant_type"] or "", 0)
    precip_cat = precip_category(r["precipitant_type"])
    precip_conc = r["precipitant_conc"] if r["precipitant_conc"] is not None else 0.0
    protein_conc = r["protein_concentration"] if r["protein_concentration"] is not None else 0.0
    has_additive = 1 if r["additive"] else 0

    features = [ph, temp, precip_code, precip_cat, precip_conc, protein_conc, has_additive]

    if not NO_EMB:
        emb = emb_map.get(r["construct_id"])
        if emb and len(emb) == emb_dims:
            features.extend(emb)
        else:
            features.extend([0.0] * emb_dims)

    X_list.append(features)
    y_list.append(1 if r["outcome"] in SUCCESS_OUTCOMES else 0)

X = np.array(X_list, dtype=np.float32)
y = np.array(y_list, dtype=np.int32)

n_features = X.shape[1]
n_base = 7
print(f"  Features: {n_base} base + {n_features - n_base} embedding = {n_features} total")
print(f"  Samples: {fmt(len(y))}, Positive: {fmt(np.sum(y))} ({np.mean(y)*100:.1f}%), Negative: {fmt(len(y)-np.sum(y))} ({(1-np.mean(y))*100:.1f}%)")

# ─── Train/Test Split ───
from sklearn.model_selection import train_test_split
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=SEED, stratify=y)
print(f"  Train: {fmt(len(y_train))}, Test: {fmt(len(y_test))}")

# ═══════════════════════════════════════════════════════
# 3. Model Training
# ═══════════════════════════════════════════════════════
print("\n[4/4] Training models...")

from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score, roc_auc_score, confusion_matrix
import xgboost as xgb
import lightgbm as lgb

results = {}

# ─── XGBoost ───
print("\n--- XGBoost ---")
t0 = time.time()
xgb_model = xgb.XGBClassifier(
    n_estimators=300,
    max_depth=6,
    learning_rate=0.1,
    subsample=0.8,
    colsample_bytree=0.8,
    eval_metric="logloss",
    random_state=SEED,
    n_jobs=-1,
    verbosity=0,
)
xgb_model.fit(X_train, y_train)
xgb_time = time.time() - t0

y_pred_xgb = xgb_model.predict(X_test)
y_prob_xgb = xgb_model.predict_proba(X_test)[:, 1]

xgb_acc = accuracy_score(y_test, y_pred_xgb)
xgb_prec = precision_score(y_test, y_pred_xgb)
xgb_rec = recall_score(y_test, y_pred_xgb)
xgb_f1 = f1_score(y_test, y_pred_xgb)
xgb_auc = roc_auc_score(y_test, y_prob_xgb)
xgb_cm = confusion_matrix(y_test, y_pred_xgb)

print(f"  Accuracy:  {xgb_acc*100:.1f}%")
print(f"  Precision: {xgb_prec*100:.1f}%")
print(f"  Recall:    {xgb_rec*100:.1f}%")
print(f"  F1:        {xgb_f1*100:.1f}%")
print(f"  AUC-ROC:   {xgb_auc*100:.1f}%")
print(f"  Time:      {xgb_time:.1f}s")
print(f"  Confusion: TN={xgb_cm[0][0]} FP={xgb_cm[0][1]} FN={xgb_cm[1][0]} TP={xgb_cm[1][1]}")

results["xgboost"] = {
    "accuracy": round(xgb_acc * 100, 1),
    "precision": round(xgb_prec * 100, 1),
    "recall": round(xgb_rec * 100, 1),
    "f1": round(xgb_f1 * 100, 1),
    "auc_roc": round(xgb_auc * 100, 1),
    "time_sec": round(xgb_time, 1),
}

# ─── LightGBM ───
print("\n--- LightGBM ---")
t0 = time.time()
lgb_model = lgb.LGBMClassifier(
    n_estimators=300,
    max_depth=6,
    learning_rate=0.1,
    subsample=0.8,
    colsample_bytree=0.8,
    random_state=SEED,
    n_jobs=-1,
    verbose=-1,
)
lgb_model.fit(X_train, y_train)
lgb_time = time.time() - t0

y_pred_lgb = lgb_model.predict(X_test)
y_prob_lgb = lgb_model.predict_proba(X_test)[:, 1]

lgb_acc = accuracy_score(y_test, y_pred_lgb)
lgb_prec = precision_score(y_test, y_pred_lgb)
lgb_rec = recall_score(y_test, y_pred_lgb)
lgb_f1 = f1_score(y_test, y_pred_lgb)
lgb_auc = roc_auc_score(y_test, y_prob_lgb)
lgb_cm = confusion_matrix(y_test, y_pred_lgb)

print(f"  Accuracy:  {lgb_acc*100:.1f}%")
print(f"  Precision: {lgb_prec*100:.1f}%")
print(f"  Recall:    {lgb_rec*100:.1f}%")
print(f"  F1:        {lgb_f1*100:.1f}%")
print(f"  AUC-ROC:   {lgb_auc*100:.1f}%")
print(f"  Time:      {lgb_time:.1f}s")
print(f"  Confusion: TN={lgb_cm[0][0]} FP={lgb_cm[0][1]} FN={lgb_cm[1][0]} TP={lgb_cm[1][1]}")

results["lightgbm"] = {
    "accuracy": round(lgb_acc * 100, 1),
    "precision": round(lgb_prec * 100, 1),
    "recall": round(lgb_rec * 100, 1),
    "f1": round(lgb_f1 * 100, 1),
    "auc_roc": round(lgb_auc * 100, 1),
    "time_sec": round(lgb_time, 1),
}

# ─── Feature Importance (XGBoost) ───
print("\n--- Feature Importance (XGBoost top 20) ---")
feature_names = ["ph", "temperature", "precipitant_code", "precipitant_cat", "precipitant_conc", "protein_conc", "additive"]
if not NO_EMB:
    feature_names += [f"emb_{i}" for i in range(emb_dims)]

importances = xgb_model.feature_importances_
top_idx = np.argsort(importances)[::-1][:20]
for rank, idx in enumerate(top_idx):
    print(f"  {rank+1:2d}. {feature_names[idx]:25s} {importances[idx]:.4f}")

# ═══════════════════════════════════════════════════════
# Save results
# ═══════════════════════════════════════════════════════
out = {
    "date": time.strftime("%Y-%m-%d"),
    "data_size": len(y),
    "train_size": len(y_train),
    "test_size": len(y_test),
    "positive_rate": round(np.mean(y) * 100, 1),
    "n_features": n_features,
    "embedding": not NO_EMB,
    "precipitant_coverage": "56.6%",
    "results": results,
    "top_features": [
        {"name": feature_names[idx], "importance": round(float(importances[idx]), 4)}
        for idx in top_idx
    ],
    "confusion_matrix_xgb": xgb_cm.tolist(),
    "confusion_matrix_lgb": lgb_cm.tolist(),
}

out_path = Path(__file__).resolve().parent.parent / "data" / "model_metrics.json"
with open(out_path, "w") as f:
    json.dump(out, f, indent=2)
print(f"\nResults saved: {out_path}")

# ─── Summary ───
print("\n" + "=" * 60)
print("SUMMARY")
print("=" * 60)
print(f"{'Model':<12} {'Acc':>6} {'Prec':>6} {'Rec':>6} {'F1':>6} {'AUC':>6} {'Time':>6}")
print("-" * 60)
for name, r in results.items():
    print(f"{name:<12} {r['accuracy']:>5.1f}% {r['precision']:>5.1f}% {r['recall']:>5.1f}% {r['f1']:>5.1f}% {r['auc_roc']:>5.1f}% {r['time_sec']:>5.1f}s")
print("=" * 60)
