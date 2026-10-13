"""
GPU 서버 api_server.py에 추가할 /predict 엔드포인트

사용법:
  1. train_success_model.py로 모델 학습
  2. 이 파일의 코드를 api_server.py에 복사
  3. 서버 재시작

요청:
  POST /predict
  {
    "sequence": "MTEYKLVVV...",
    "ph": 7.0,
    "temperature": 18,
    "precipitant_type": "PEG 3350",
    "precipitant_conc": 25,
    "api_key": "..."
  }

응답:
  {
    "success_probability": 73.2,
    "confidence": "high",
    "model": "xgboost_esm2",
    "features_used": ["embedding_1280", "ph", "temperature", "precipitant", "conc"]
  }
"""

# === api_server.py에 추가할 코드 ===

# 상단 import에 추가:
# import joblib

# lifespan 함수 안에 추가:
# global success_model, precipitant_encoder
# success_model = joblib.load("success_model.joblib")
# precipitant_encoder = joblib.load("precipitant_encoder.joblib")
# print("Success prediction model loaded")

# --- Request model ---
# class PredictRequest(BaseModel):
#     sequence: str
#     ph: float = 7.0
#     temperature: float = 18.0
#     precipitant_type: str = "unknown"
#     precipitant_conc: float = 0.0
#     api_key: str = ""

# --- Endpoint ---
# @app.post("/predict")
# async def predict(req: PredictRequest):
#     check_auth(req.api_key)
#
#     # 1. ESM-2 embedding
#     embedding = compute_embedding(req.sequence)
#
#     # 2. Encode precipitant
#     known = set(precipitant_encoder.classes_)
#     precip = req.precipitant_type if req.precipitant_type in known else "unknown"
#     precip_encoded = precipitant_encoder.transform([precip])[0]
#
#     # 3. Build feature vector
#     import numpy as np
#     features = np.array(embedding + [req.ph, req.temperature, precip_encoded, req.precipitant_conc]).reshape(1, -1)
#
#     # 4. Predict
#     prob = float(success_model.predict_proba(features)[0, 1])
#
#     return {
#         "success_probability": round(prob * 100, 1),
#         "confidence": "high" if prob > 0.7 or prob < 0.3 else "medium",
#         "model": "xgboost_esm2",
#         "features_used": ["embedding_1280", "ph", "temperature", "precipitant", "conc"],
#         "input": {
#             "sequence_length": len(req.sequence),
#             "ph": req.ph,
#             "temperature": req.temperature,
#             "precipitant_type": req.precipitant_type,
#             "precipitant_conc": req.precipitant_conc,
#         },
#     }
