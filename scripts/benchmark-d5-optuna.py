"""
D-5 Model Improvement: Optuna + 5-fold CV + One-hot + MLP
Based on benchmark-xgb-esm2.py with enhancements:
  1. Optuna hyperparameter tuning (50 trials)
  2. Precipitant one-hot encoding (top 30)
  3. 5-fold stratified CV with confidence intervals
  4. Neural Network (MLP) experiment

Usage:
  python scripts/benchmark-d5-optuna.py                    # Full run (50K samples)
  python scripts/benchmark-d5-optuna.py --limit=100000     # More data
  python scripts/benchmark-d5-optuna.py --no-embedding     # Without ESM-2
  python scripts/benchmark-d5-optuna.py --trials=100       # More Optuna trials
  python scripts/benchmark-d5-optuna.py --quick            # Quick mode (20 trials, 20K samples)
"""

import os, json, sys, time, warnings
import numpy as np
from pathlib import Path
from dotenv import load_dotenv
import psycopg2
import psycopg2.extras

warnings.filterwarnings("ignore", category=UserWarning)

# --- Setup ---
load_dotenv(Path(__file__).resolve().parent.parent / ".env.local")

# Lab PostgreSQL (primary data source)
pg_conn = psycopg2.connect(os.environ["DATABASE_URL"], sslmode="require")
pg_conn.set_session(autocommit=True)

# Supabase no longer needed — embeddings are on Lab PG

args = sys.argv[1:]
QUICK = "--quick" in args
BALANCED = "--balanced" in args
LIMIT = int(next((a.split("=")[1] for a in args if a.startswith("--limit")), "20000" if QUICK else "50000"))
NO_EMB = "--no-embedding" in args
N_TRIALS = int(next((a.split("=")[1] for a in args if a.startswith("--trials")), "20" if QUICK else "50"))
SEED = 42

# --- Precipitant encoding ---
PRECIP_TOP30 = [
    'PEG 3350', 'PEG 4000', 'PEG 8000', 'PEG 6000', 'PEG 400', 'PEG 3000',
    'Ammonium Sulfate', 'Sodium Chloride', 'MPD', 'Sodium Citrate',
    'PEG 1500', 'PEG 1000', 'PEG 2000', 'Lithium Sulfate', 'Sodium Formate',
    'Sodium Acetate', 'Potassium Phosphate', 'PEG 20000', 'PEG 200',
    'Isopropanol', 'PEG 10000', 'Magnesium Sulfate', 'Magnesium Chloride',
    'PEG 5000', 'Ethylene Glycol', 'Calcium Chloride',
    'Potassium Sodium Tartrate', 'Zinc Acetate', 'Ethanol', 'Glycerol',
]
PRECIP_TO_IDX = {name: i for i, name in enumerate(PRECIP_TOP30)}

def precip_category(t):
    if not t: return 0
    tl = t.lower()
    if 'peg' in tl: return 1
    if any(s in tl for s in ['sulfate', 'chloride', 'phosphate', 'citrate', 'formate',
                              'malonate', 'acetate', 'tartrate', 'nitrate']): return 2
    if any(s in tl for s in ['mpd', 'isopropanol', 'ethanol', 'methanol', 'glycerol',
                              'dioxane', 'hexanediol']): return 3
    return 4

def precip_onehot(t):
    vec = [0] * len(PRECIP_TOP30)
    idx = PRECIP_TO_IDX.get(t)
    if idx is not None:
        vec[idx] = 1
    return vec

def fmt(n): return f"{n:,.0f}"

# ================================================================
# 1. Data Loading
# ================================================================
print("=" * 70)
print("D-5 Model Improvement: Optuna + 5-fold CV + One-hot + MLP")
print(f"Limit: {fmt(LIMIT)}, Embedding: {'OFF' if NO_EMB else 'ON'}, Trials: {N_TRIALS}, Balanced: {BALANCED}")
print("=" * 70)

print("\n[1/5] Loading crystallization data from Lab PostgreSQL...")
t_load = time.time()
with pg_conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
    if BALANCED:
        # 균형 데이터셋: positive와 negative를 동수로 샘플링
        half = LIMIT // 2
        cur.execute("""
            (SELECT construct_id, ph, temperature, precipitant_type, precipitant_conc,
                    protein_concentration, additive, outcome
             FROM kbsi_crystallization
             WHERE outcome IN ('single_crystal', 'diffraction_quality')
             ORDER BY random()
             LIMIT %s)
            UNION ALL
            (SELECT construct_id, ph, temperature, precipitant_type, precipitant_conc,
                    protein_concentration, additive, outcome
             FROM kbsi_crystallization
             WHERE outcome IN ('clear', 'precipitate', 'phase_separation', 'microcrystal')
             ORDER BY random()
             LIMIT %s)
        """, (half, half))
    else:
        cur.execute("""
            SELECT construct_id, ph, temperature, precipitant_type, precipitant_conc,
                   protein_concentration, additive, outcome
            FROM kbsi_crystallization
            WHERE outcome IS NOT NULL
            ORDER BY id
            LIMIT %s
        """, (LIMIT,))
    rows = cur.fetchall()
print(f"  Loaded: {fmt(len(rows))} crystallization records ({time.time()-t_load:.1f}s)")

# --- Load embeddings from Lab PG ---
emb_map = {}
if not NO_EMB:
    print("\n[2/5] Loading ESM-2 embeddings from Lab PostgreSQL...")
    t_emb = time.time()
    construct_ids = list(set(r["construct_id"] for r in rows))
    with pg_conn.cursor() as cur:
        cur.execute("""
            SELECT construct_id, embedding::text
            FROM kbsi_embedding
            WHERE construct_id = ANY(%s)
        """, (construct_ids,))
        for cid, emb_text in cur.fetchall():
            # embedding::text returns "[0.1,0.2,...]"
            emb_map[cid] = json.loads(emb_text)
    print(f"  Embeddings: {fmt(len(emb_map))} / {fmt(len(construct_ids))} ({len(emb_map)/len(construct_ids)*100:.1f}%) ({time.time()-t_emb:.1f}s)")
else:
    print("\n[2/5] Skipping embeddings (--no-embedding)")

# ================================================================
# 2. Feature Engineering (with one-hot precipitant)
# ================================================================
print("\n[3/5] Feature engineering (one-hot precipitant)...")

SUCCESS_OUTCOMES = {"single_crystal", "diffraction_quality"}
emb_dims = 1280

X_list = []
y_list = []

for r in rows:
    ph = r["ph"] if r["ph"] is not None else 7.0
    temp = r["temperature"] if r["temperature"] is not None else 18.0
    precip_cat = precip_category(r["precipitant_type"])
    precip_conc = r["precipitant_conc"] if r["precipitant_conc"] is not None else 0.0
    protein_conc = r["protein_concentration"] if r["protein_concentration"] is not None else 0.0
    has_additive = 1 if r["additive"] else 0
    onehot = precip_onehot(r["precipitant_type"] or "")

    features = [ph, temp, precip_cat, precip_conc, protein_conc, has_additive] + onehot

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
n_base = 6 + len(PRECIP_TOP30)
print(f"  Features: {n_base} base (6 numeric + 30 one-hot) + {n_features - n_base} embedding = {n_features} total")
print(f"  Samples: {fmt(len(y))}, Positive: {fmt(np.sum(y))} ({np.mean(y)*100:.1f}%), Negative: {fmt(len(y)-np.sum(y))} ({(1-np.mean(y))*100:.1f}%)")

# ================================================================
# 3. Optuna Hyperparameter Tuning (on single split first)
# ================================================================
print(f"\n[4/5] Optuna hyperparameter tuning ({N_TRIALS} trials)...")

from sklearn.model_selection import train_test_split, StratifiedKFold, cross_val_score
from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score, roc_auc_score, confusion_matrix
from sklearn.neural_network import MLPClassifier
import xgboost as xgb
import lightgbm as lgb
import optuna

optuna.logging.set_verbosity(optuna.logging.WARNING)

X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=SEED, stratify=y)
print(f"  Train: {fmt(len(y_train))}, Test: {fmt(len(y_test))}")

# --- Optuna for LightGBM ---
print("\n  Tuning LightGBM...")
t0 = time.time()

def lgb_objective(trial):
    params = {
        "n_estimators": trial.suggest_int("n_estimators", 200, 800),
        "max_depth": trial.suggest_int("max_depth", 4, 10),
        "learning_rate": trial.suggest_float("learning_rate", 0.01, 0.3, log=True),
        "subsample": trial.suggest_float("subsample", 0.6, 1.0),
        "colsample_bytree": trial.suggest_float("colsample_bytree", 0.5, 1.0),
        "min_child_samples": trial.suggest_int("min_child_samples", 5, 100),
        "reg_alpha": trial.suggest_float("reg_alpha", 1e-8, 10.0, log=True),
        "reg_lambda": trial.suggest_float("reg_lambda", 1e-8, 10.0, log=True),
        "num_leaves": trial.suggest_int("num_leaves", 20, 150),
        "random_state": SEED,
        "n_jobs": -1,
        "verbose": -1,
    }
    model = lgb.LGBMClassifier(**params)
    scores = cross_val_score(model, X_train, y_train, cv=3, scoring="f1", n_jobs=-1)
    return scores.mean()

lgb_study = optuna.create_study(direction="maximize", sampler=optuna.samplers.TPESampler(seed=SEED))
lgb_study.optimize(lgb_objective, n_trials=N_TRIALS, show_progress_bar=True)
lgb_tune_time = time.time() - t0

print(f"  Best F1 (3-fold): {lgb_study.best_value*100:.1f}%")
print(f"  Best params: {json.dumps({k: round(v, 4) if isinstance(v, float) else v for k, v in lgb_study.best_params.items()}, indent=4)}")
print(f"  Tuning time: {lgb_tune_time:.1f}s")

# --- Optuna for XGBoost ---
print("\n  Tuning XGBoost...")
t0 = time.time()

def xgb_objective(trial):
    params = {
        "n_estimators": trial.suggest_int("n_estimators", 200, 800),
        "max_depth": trial.suggest_int("max_depth", 4, 10),
        "learning_rate": trial.suggest_float("learning_rate", 0.01, 0.3, log=True),
        "subsample": trial.suggest_float("subsample", 0.6, 1.0),
        "colsample_bytree": trial.suggest_float("colsample_bytree", 0.5, 1.0),
        "min_child_weight": trial.suggest_int("min_child_weight", 1, 20),
        "reg_alpha": trial.suggest_float("reg_alpha", 1e-8, 10.0, log=True),
        "reg_lambda": trial.suggest_float("reg_lambda", 1e-8, 10.0, log=True),
        "gamma": trial.suggest_float("gamma", 0, 5.0),
        "eval_metric": "logloss",
        "random_state": SEED,
        "n_jobs": -1,
        "verbosity": 0,
    }
    model = xgb.XGBClassifier(**params)
    scores = cross_val_score(model, X_train, y_train, cv=3, scoring="f1", n_jobs=-1)
    return scores.mean()

xgb_study = optuna.create_study(direction="maximize", sampler=optuna.samplers.TPESampler(seed=SEED))
xgb_study.optimize(xgb_objective, n_trials=N_TRIALS, show_progress_bar=True)
xgb_tune_time = time.time() - t0

print(f"  Best F1 (3-fold): {xgb_study.best_value*100:.1f}%")
print(f"  Best params: {json.dumps({k: round(v, 4) if isinstance(v, float) else v for k, v in xgb_study.best_params.items()}, indent=4)}")
print(f"  Tuning time: {xgb_tune_time:.1f}s")

# ================================================================
# 4. 5-fold Stratified CV with best params
# ================================================================
print(f"\n[5/5] 5-fold Stratified CV with best params...")

skf = StratifiedKFold(n_splits=5, shuffle=True, random_state=SEED)

def evaluate_cv(model_cls, params, name):
    metrics = {"acc": [], "prec": [], "rec": [], "f1": [], "auc": []}
    t0 = time.time()

    for fold, (train_idx, val_idx) in enumerate(skf.split(X, y)):
        X_tr, X_val = X[train_idx], X[val_idx]
        y_tr, y_val = y[train_idx], y[val_idx]

        model = model_cls(**params)
        model.fit(X_tr, y_tr)
        y_pred = model.predict(X_val)
        y_prob = model.predict_proba(X_val)[:, 1]

        metrics["acc"].append(accuracy_score(y_val, y_pred))
        metrics["prec"].append(precision_score(y_val, y_pred))
        metrics["rec"].append(recall_score(y_val, y_pred))
        metrics["f1"].append(f1_score(y_val, y_pred))
        metrics["auc"].append(roc_auc_score(y_val, y_prob))

    elapsed = time.time() - t0
    print(f"\n  --- {name} (5-fold CV) ---")
    for k, v in metrics.items():
        arr = np.array(v)
        print(f"  {k.upper():>5s}: {arr.mean()*100:.1f}% +/- {arr.std()*100:.1f}%")
    print(f"  Time: {elapsed:.1f}s")

    return {k: {"mean": round(np.mean(v)*100, 1), "std": round(np.std(v)*100, 1)} for k, v in metrics.items()}

# LightGBM with Optuna best params
lgb_best = {**lgb_study.best_params, "random_state": SEED, "n_jobs": -1, "verbose": -1}
lgb_cv = evaluate_cv(lgb.LGBMClassifier, lgb_best, "LightGBM (Optuna)")

# XGBoost with Optuna best params
xgb_best = {**xgb_study.best_params, "eval_metric": "logloss", "random_state": SEED, "n_jobs": -1, "verbosity": 0}
xgb_cv = evaluate_cv(xgb.XGBClassifier, xgb_best, "XGBoost (Optuna)")

# Baseline (default params, for comparison)
lgb_default = {"n_estimators": 300, "max_depth": 6, "learning_rate": 0.1, "subsample": 0.8,
               "colsample_bytree": 0.8, "random_state": SEED, "n_jobs": -1, "verbose": -1}
lgb_base_cv = evaluate_cv(lgb.LGBMClassifier, lgb_default, "LightGBM (Baseline)")

# MLP experiment
print("\n  Training MLP...")
mlp_params = {
    "hidden_layer_sizes": (256, 128, 64),
    "activation": "relu",
    "max_iter": 200,
    "early_stopping": True,
    "validation_fraction": 0.1,
    "random_state": SEED,
}
mlp_cv = evaluate_cv(MLPClassifier, mlp_params, "MLP (256-128-64)")

# ================================================================
# 5. Final evaluation on held-out test set
# ================================================================
print("\n" + "=" * 70)
print("Final Test Set Evaluation (best models)")
print("=" * 70)

results = {}

for name, cls, params in [
    ("LightGBM-Optuna", lgb.LGBMClassifier, lgb_best),
    ("XGBoost-Optuna", xgb.XGBClassifier, xgb_best),
    ("LightGBM-Base", lgb.LGBMClassifier, lgb_default),
    ("MLP", MLPClassifier, mlp_params),
]:
    t0 = time.time()
    model = cls(**params)
    model.fit(X_train, y_train)
    elapsed = time.time() - t0

    y_pred = model.predict(X_test)
    y_prob = model.predict_proba(X_test)[:, 1]
    cm = confusion_matrix(y_test, y_pred)

    acc = accuracy_score(y_test, y_pred)
    prec = precision_score(y_test, y_pred)
    rec = recall_score(y_test, y_pred)
    f1 = f1_score(y_test, y_pred)
    auc = roc_auc_score(y_test, y_prob)

    print(f"\n  --- {name} ---")
    print(f"  Accuracy:  {acc*100:.1f}%")
    print(f"  Precision: {prec*100:.1f}%")
    print(f"  Recall:    {rec*100:.1f}%")
    print(f"  F1:        {f1*100:.1f}%")
    print(f"  AUC-ROC:   {auc*100:.1f}%")
    print(f"  Confusion: TN={cm[0][0]} FP={cm[0][1]} FN={cm[1][0]} TP={cm[1][1]}")
    print(f"  Time:      {elapsed:.1f}s")

    results[name] = {
        "accuracy": round(acc * 100, 1),
        "precision": round(prec * 100, 1),
        "recall": round(rec * 100, 1),
        "f1": round(f1 * 100, 1),
        "auc_roc": round(auc * 100, 1),
        "time_sec": round(elapsed, 1),
        "confusion_matrix": cm.tolist(),
    }

# --- Feature Importance (best LightGBM) ---
print("\n--- Feature Importance (LightGBM-Optuna top 20) ---")
best_lgb = lgb.LGBMClassifier(**lgb_best)
best_lgb.fit(X_train, y_train)

feature_names = ["ph", "temperature", "precipitant_cat", "precipitant_conc", "protein_conc", "additive"]
feature_names += [f"onehot_{name}" for name in PRECIP_TOP30]
if not NO_EMB:
    feature_names += [f"emb_{i}" for i in range(emb_dims)]

importances = best_lgb.feature_importances_.astype(float)
imp_sum = importances.sum()
if imp_sum > 0:
    importances /= imp_sum
top_idx = np.argsort(importances)[::-1][:20]
for rank, idx in enumerate(top_idx):
    print(f"  {rank+1:2d}. {feature_names[idx]:30s} {importances[idx]:.4f}")

# ================================================================
# Save results
# ================================================================
out = {
    "date": time.strftime("%Y-%m-%d"),
    "version": "D-5 Optuna",
    "data_size": len(y),
    "train_size": len(y_train),
    "test_size": len(y_test),
    "positive_rate": round(np.mean(y) * 100, 1),
    "n_features": n_features,
    "n_base_features": n_base,
    "embedding": not NO_EMB,
    "optuna_trials": N_TRIALS,
    "results": results,
    "cv_results": {
        "LightGBM-Optuna": lgb_cv,
        "XGBoost-Optuna": xgb_cv,
        "LightGBM-Base": lgb_base_cv,
        "MLP": mlp_cv,
    },
    "best_params": {
        "lightgbm": lgb_study.best_params,
        "xgboost": xgb_study.best_params,
    },
    "top_features": [
        {"name": feature_names[idx], "importance": round(float(importances[idx]), 4)}
        for idx in top_idx
    ],
}

out_path = Path(__file__).resolve().parent.parent / "data" / "model_metrics_d5.json"
with open(out_path, "w") as f:
    json.dump(out, f, indent=2, default=str)
print(f"\nResults saved: {out_path}")

# --- Summary ---
print("\n" + "=" * 70)
print("SUMMARY")
print("=" * 70)
print(f"{'Model':<20} {'Acc':>6} {'Prec':>6} {'Rec':>6} {'F1':>6} {'AUC':>6}")
print("-" * 70)
for name, r in results.items():
    print(f"{name:<20} {r['accuracy']:>5.1f}% {r['precision']:>5.1f}% {r['recall']:>5.1f}% {r['f1']:>5.1f}% {r['auc_roc']:>5.1f}%")
print("-" * 70)
print("\n5-fold CV (mean +/- std):")
print(f"{'Model':<20} {'Acc':>12} {'F1':>12} {'AUC':>12}")
print("-" * 70)
for name, cv in [("LightGBM-Optuna", lgb_cv), ("XGBoost-Optuna", xgb_cv), ("LightGBM-Base", lgb_base_cv), ("MLP", mlp_cv)]:
    print(f"{name:<20} {cv['acc']['mean']:>5.1f}+/-{cv['acc']['std']:.1f}% {cv['f1']['mean']:>5.1f}+/-{cv['f1']['std']:.1f}% {cv['auc']['mean']:>5.1f}+/-{cv['auc']['std']:.1f}%")
print("=" * 70)

# Improvement over baseline
if "LightGBM-Optuna" in results and "LightGBM-Base" in results:
    delta_f1 = results["LightGBM-Optuna"]["f1"] - results["LightGBM-Base"]["f1"]
    delta_acc = results["LightGBM-Optuna"]["accuracy"] - results["LightGBM-Base"]["accuracy"]
    print(f"\nOptuna vs Baseline: Acc {delta_acc:+.1f}%, F1 {delta_f1:+.1f}%")
    prev_f1 = 92.4  # v5 benchmark
    print(f"vs v5 Benchmark (F1 92.4%): {results['LightGBM-Optuna']['f1'] - prev_f1:+.1f}%")
