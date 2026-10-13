"""
Crystallization Success Prediction Model
ESM-2 embedding (1280) + conditions (pH, temp, precipitant) -> success/failure

Usage (on GPU server):
  pip install xgboost scikit-learn pandas supabase python-dotenv tqdm joblib
  python train_success_model.py                    # full training
  python train_success_model.py --limit 50000      # quick test
  python train_success_model.py --eval-only        # evaluate saved model

Output:
  success_model.joblib          # trained XGBoost model
  precipitant_encoder.joblib    # label encoder for precipitant_type
  model_metrics.json            # evaluation metrics
"""

import os, sys, json, argparse
import numpy as np
import pandas as pd
from pathlib import Path
from dotenv import load_dotenv
from supabase import create_client
from tqdm import tqdm

load_dotenv()

parser = argparse.ArgumentParser()
parser.add_argument("--limit", type=int, default=0, help="Max samples (0=all)")
parser.add_argument("--test-size", type=float, default=0.2)
parser.add_argument("--eval-only", action="store_true")
parser.add_argument("--output-dir", type=str, default=".")
args = parser.parse_args()

sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])

MODEL_PATH = Path(args.output_dir) / "success_model.joblib"
ENCODER_PATH = Path(args.output_dir) / "precipitant_encoder.joblib"
METRICS_PATH = Path(args.output_dir) / "model_metrics.json"


def load_data(limit=0):
    """DB에서 결정화 + 임베딩 데이터 로드"""
    print("Loading crystallization data...")

    all_rows = []
    offset = 0
    page_size = 1000

    while True:
        res = sb.table("kbsi_crystallization") \
            .select("construct_id, ph, temperature, precipitant_type, precipitant_conc, outcome, source_type") \
            .not_("outcome", "is", "null") \
            .range(offset, offset + page_size - 1) \
            .execute()

        if not res.data:
            break
        all_rows.extend(res.data)

        if limit and len(all_rows) >= limit:
            all_rows = all_rows[:limit]
            break
        if len(res.data) < page_size:
            break
        offset += page_size
        if offset % 50000 == 0:
            print(f"  {offset} rows...")

    print(f"  Total crystallization rows: {len(all_rows)}")

    # pH와 temperature가 있는 것만
    df = pd.DataFrame(all_rows)
    df = df.dropna(subset=["ph", "temperature"])
    print(f"  After filtering (ph+temp required): {len(df)}")

    # 라벨: success=1, failure=0
    success_outcomes = {"single_crystal", "diffraction_quality"}
    df["label"] = df["outcome"].apply(lambda x: 1 if x in success_outcomes else 0)
    print(f"  Success: {df['label'].sum()}, Failure: {len(df) - df['label'].sum()}")

    # construct_id별 임베딩 로드
    unique_cids = df["construct_id"].unique().tolist()
    print(f"  Unique constructs: {len(unique_cids)}")

    print("Loading embeddings...")
    embeddings = {}
    for i in range(0, len(unique_cids), 500):
        batch_ids = unique_cids[i:i+500]
        res = sb.table("kbsi_embedding") \
            .select("construct_id, embedding") \
            .in_("construct_id", batch_ids) \
            .execute()
        for r in res.data or []:
            embeddings[r["construct_id"]] = r["embedding"]
        if (i + 500) % 5000 == 0:
            print(f"  {i + 500} / {len(unique_cids)} constructs loaded...")

    print(f"  Embeddings loaded: {len(embeddings)}")

    # 임베딩 있는 행만 유지
    df = df[df["construct_id"].isin(embeddings)]
    print(f"  Final dataset: {len(df)}")

    return df, embeddings


def build_features(df, embeddings, precipitant_encoder=None):
    """Feature matrix 생성: [embedding_1280 + ph + temp + precip_encoded + conc]"""
    from sklearn.preprocessing import LabelEncoder

    # precipitant encoding
    df["precipitant_type"] = df["precipitant_type"].fillna("unknown")

    if precipitant_encoder is None:
        precipitant_encoder = LabelEncoder()
        precipitant_encoder.fit(df["precipitant_type"])
    else:
        # unseen labels -> "unknown"
        known = set(precipitant_encoder.classes_)
        df["precipitant_type"] = df["precipitant_type"].apply(lambda x: x if x in known else "unknown")

    precip_encoded = precipitant_encoder.transform(df["precipitant_type"])
    conc = df["precipitant_conc"].fillna(0).values

    # embedding matrix
    emb_matrix = np.array([embeddings[cid] for cid in df["construct_id"]])

    # condition features
    conditions = np.column_stack([
        df["ph"].values,
        df["temperature"].values,
        precip_encoded,
        conc,
    ])

    X = np.hstack([emb_matrix, conditions])
    y = df["label"].values

    print(f"  Feature matrix: {X.shape}, Labels: {y.shape}")
    print(f"  Features: embedding(1280) + ph + temp + precipitant + conc = {X.shape[1]}")

    return X, y, precipitant_encoder


def train_model(X_train, y_train, X_test, y_test):
    """XGBoost 모델 학습"""
    import xgboost as xgb

    # 클래스 불균형 보정
    scale_pos = (y_train == 0).sum() / max((y_train == 1).sum(), 1)
    print(f"  scale_pos_weight: {scale_pos:.2f}")

    model = xgb.XGBClassifier(
        n_estimators=200,
        max_depth=6,
        learning_rate=0.1,
        scale_pos_weight=scale_pos,
        eval_metric="logloss",
        early_stopping_rounds=20,
        random_state=42,
        tree_method="hist",  # fast CPU training
        n_jobs=-1,
    )

    model.fit(
        X_train, y_train,
        eval_set=[(X_test, y_test)],
        verbose=20,
    )

    return model


def evaluate_model(model, X_test, y_test):
    """모델 평가"""
    from sklearn.metrics import (
        accuracy_score, precision_score, recall_score, f1_score,
        roc_auc_score, confusion_matrix, classification_report,
    )

    y_pred = model.predict(X_test)
    y_prob = model.predict_proba(X_test)[:, 1]

    metrics = {
        "accuracy": round(accuracy_score(y_test, y_pred) * 100, 1),
        "precision": round(precision_score(y_test, y_pred) * 100, 1),
        "recall": round(recall_score(y_test, y_pred) * 100, 1),
        "f1": round(f1_score(y_test, y_pred) * 100, 1),
        "auc_roc": round(roc_auc_score(y_test, y_prob) * 100, 1),
        "confusion_matrix": confusion_matrix(y_test, y_pred).tolist(),
        "test_size": len(y_test),
        "test_positive": int((y_test == 1).sum()),
        "test_negative": int((y_test == 0).sum()),
    }

    print("\n=== Evaluation ===")
    print(f"  Accuracy:  {metrics['accuracy']}%")
    print(f"  Precision: {metrics['precision']}%")
    print(f"  Recall:    {metrics['recall']}%")
    print(f"  F1:        {metrics['f1']}%")
    print(f"  AUC-ROC:   {metrics['auc_roc']}%")
    print(f"\n{classification_report(y_test, y_pred, target_names=['failure', 'success'])}")

    # Feature importance (top 20)
    importance = model.feature_importances_
    feature_names = [f"emb_{i}" for i in range(1280)] + ["ph", "temperature", "precipitant", "conc"]
    top_idx = np.argsort(importance)[-20:][::-1]
    print("Top 20 features:")
    for idx in top_idx:
        print(f"  {feature_names[idx]:15s} {importance[idx]:.4f}")

    metrics["top_features"] = [
        {"name": feature_names[idx], "importance": round(float(importance[idx]), 4)}
        for idx in top_idx
    ]

    return metrics


def main():
    import joblib
    from sklearn.model_selection import train_test_split

    if args.eval_only:
        if not MODEL_PATH.exists():
            print("No saved model found!")
            sys.exit(1)
        model = joblib.load(MODEL_PATH)
        encoder = joblib.load(ENCODER_PATH)
        df, embeddings = load_data(args.limit or 50000)
        X, y, _ = build_features(df, embeddings, encoder)
        metrics = evaluate_model(model, X, y)
        with open(METRICS_PATH, "w") as f:
            json.dump(metrics, f, indent=2)
        return

    # Load data
    df, embeddings = load_data(args.limit)

    # Build features
    X, y, encoder = build_features(df, embeddings)

    # Split
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=args.test_size, random_state=42, stratify=y,
    )
    print(f"\nTrain: {len(X_train)}, Test: {len(X_test)}")

    # Train
    print("\n=== Training XGBoost ===")
    model = train_model(X_train, y_train, X_test, y_test)

    # Evaluate
    metrics = evaluate_model(model, X_test, y_test)

    # Also train baseline (conditions only, no embedding)
    print("\n=== Baseline (conditions only, no embedding) ===")
    X_cond_train = X_train[:, 1280:]
    X_cond_test = X_test[:, 1280:]
    baseline = train_model(X_cond_train, y_train, X_cond_test, y_test)
    baseline_metrics = evaluate_model(baseline, X_cond_test, y_test)
    metrics["baseline_accuracy"] = baseline_metrics["accuracy"]
    metrics["baseline_f1"] = baseline_metrics["f1"]
    metrics["baseline_auc_roc"] = baseline_metrics["auc_roc"]
    metrics["embedding_improvement"] = {
        "accuracy": round(metrics["accuracy"] - baseline_metrics["accuracy"], 1),
        "f1": round(metrics["f1"] - baseline_metrics["f1"], 1),
        "auc_roc": round(metrics["auc_roc"] - baseline_metrics["auc_roc"], 1),
    }

    print(f"\n=== ESM-2 Embedding Improvement ===")
    print(f"  Accuracy: +{metrics['embedding_improvement']['accuracy']}%")
    print(f"  F1:       +{metrics['embedding_improvement']['f1']}%")
    print(f"  AUC-ROC:  +{metrics['embedding_improvement']['auc_roc']}%")

    # Save
    joblib.dump(model, MODEL_PATH)
    joblib.dump(encoder, ENCODER_PATH)
    with open(METRICS_PATH, "w") as f:
        json.dump(metrics, f, indent=2)

    print(f"\nSaved: {MODEL_PATH}, {ENCODER_PATH}, {METRICS_PATH}")


if __name__ == "__main__":
    main()
