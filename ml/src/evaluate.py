"""
Evalúa el modelo entrenado (`train.py`) sobre el held-out `test_split.parquet`
contra DOS baselines, y escribe `ml/REPORT.md`.

Baselines (ver docs/PLAN.md, Fase B, paso 4):
  (a) Threshold sobre `fraud_score` YA EXISTENTE en el dataset -- probablemente
      la salida de un modelo/regla del propio organizador. Se barre el
      threshold sobre el set de TRAIN (nunca sobre test, sería leakage de
      hiperparámetro) y se reporta con el threshold que maximiza F1 en train.
  (b) Predictor de clase mayoritaria ("nunca es fraude") -- deliberadamente
      trivial, para mostrar por qué accuracy sola es engañosa con este
      desbalance de clases.

Métrica primaria: PR-AUC / precision / recall / F1, NUNCA accuracy sola
(el fraude es raro -- un predictor "nunca es fraude" ya saca accuracy muy
alta sin detectar nada). Se prioriza el análisis de FALSOS NEGATIVOS (fraude
no detectado) por ser el fallo caro para un banco.
"""

import os
import pickle

import pandas as pd
from sklearn.metrics import average_precision_score, confusion_matrix, f1_score, precision_score, recall_score

from .features import FEATURE_COLUMNS

MODEL_PATH = os.path.join(os.path.dirname(__file__), "..", "models", "fraud_model.pkl")
TEST_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "test_split.parquet")
TRAIN_PATH_FOR_THRESHOLD = os.path.join(os.path.dirname(__file__), "..", "data", "transactions.parquet")
REPORT_PATH = os.path.join(os.path.dirname(__file__), "..", "REPORT.md")


def best_fraud_score_threshold(train_df: pd.DataFrame) -> float:
    """Barre thresholds sobre TRAIN (nunca sobre el held-out) para no
    filtrar información del test set a la elección del baseline."""
    best_t, best_f1 = 0.0, -1.0
    for t in [i / 2 for i in range(0, 201)]:  # 0.0 a 100.0, paso 0.5
        preds = (train_df["fraud_score"].fillna(0) >= t).astype(int)
        f1 = f1_score(train_df["is_fraud"], preds, zero_division=0)
        if f1 > best_f1:
            best_t, best_f1 = t, f1
    return best_t


def metrics_block(y_true, y_pred, y_score=None) -> dict:
    tn, fp, fn, tp = confusion_matrix(y_true, y_pred, labels=[0, 1]).ravel()
    return {
        "precision": precision_score(y_true, y_pred, zero_division=0),
        "recall": recall_score(y_true, y_pred, zero_division=0),
        "f1": f1_score(y_true, y_pred, zero_division=0),
        "pr_auc": average_precision_score(y_true, y_score) if y_score is not None else None,
        "tp": int(tp),
        "fp": int(fp),
        "fn": int(fn),
        "tn": int(tn),
    }


def main() -> None:
    if not os.path.exists(TEST_PATH) or not os.path.exists(MODEL_PATH):
        raise SystemExit("Correr primero train.py (ml/models/fraud_model.pkl y ml/data/test_split.parquet no existen).")

    with open(MODEL_PATH, "rb") as f:
        pipeline = pickle.load(f)

    test = pd.read_parquet(TEST_PATH)
    full = pd.read_parquet(TRAIN_PATH_FOR_THRESHOLD)
    # El train real usado por el threshold del baseline es todo lo que NO
    # está en test (mismo corte temporal que train.py, reconstruido acá
    # solo para no re-descargar/re-featurizar todo el dataset).
    train_for_threshold = full[~full["transaction_id"].isin(test["transaction_id"])]

    # --- Modelo entrenado ---
    y_true = test["is_fraud"]
    y_score_model = pipeline.predict_proba(test[FEATURE_COLUMNS])[:, 1]
    y_pred_model = (y_score_model >= 0.5).astype(int)
    model_metrics = metrics_block(y_true, y_pred_model, y_score_model)

    # --- Baseline (a): threshold sobre fraud_score existente ---
    threshold = best_fraud_score_threshold(train_for_threshold)
    y_pred_fraud_score = (test["fraud_score"].fillna(0) >= threshold).astype(int)
    fraud_score_metrics = metrics_block(y_true, y_pred_fraud_score, test["fraud_score"].fillna(0))

    # --- Baseline (b): clase mayoritaria ---
    y_pred_majority = pd.Series([0] * len(test))
    majority_metrics = metrics_block(y_true, y_pred_majority)

    # --- Error analysis: falsos negativos del modelo (fraude no detectado) ---
    fn_mask = (y_true == 1) & (y_pred_model == 0)
    false_negatives = test[fn_mask][["transaction_id", "customer_id", "amount", "transaction_country", "merchant_category"]]

    lines = []
    lines.append("# Reporte de evaluación — clasificador de fraude entrenado")
    lines.append("")
    lines.append(f"Held-out set: {len(test)} transacciones ({int(y_true.sum())} fraude real, {100*y_true.mean():.3f}%).")
    lines.append("")
    lines.append("## Métricas held-out (modelo vs. 2 baselines)")
    lines.append("")
    lines.append("| Métrica | Modelo entrenado | Baseline: threshold sobre fraud_score existente | Baseline: clase mayoritaria |")
    lines.append("| --- | --- | --- | --- |")
    for key, label in [("precision", "Precision"), ("recall", "Recall"), ("f1", "F1"), ("pr_auc", "PR-AUC")]:
        lines.append(
            f"| {label} | {model_metrics[key]:.4f} | {fraud_score_metrics[key] if fraud_score_metrics[key] is None else f'{fraud_score_metrics[key]:.4f}'} | "
            f"{majority_metrics[key] if majority_metrics[key] is None else f'{majority_metrics[key]:.4f}'} |"
        )
    lines.append("")
    lines.append("## Matrices de confusión")
    lines.append("")
    lines.append(f"- Modelo: TP={model_metrics['tp']} FP={model_metrics['fp']} FN={model_metrics['fn']} TN={model_metrics['tn']}")
    lines.append(
        f"- Baseline fraud_score (threshold={threshold}, elegido sobre TRAIN, nunca sobre held-out): "
        f"TP={fraud_score_metrics['tp']} FP={fraud_score_metrics['fp']} FN={fraud_score_metrics['fn']} TN={fraud_score_metrics['tn']}"
    )
    lines.append(f"- Baseline clase mayoritaria: TP=0 FP=0 FN={int(y_true.sum())} TN={int((y_true == 0).sum())}")
    lines.append("")
    lines.append("## Análisis de errores — falsos negativos del modelo (fraude NO detectado, el fallo caro)")
    lines.append("")
    lines.append(f"{len(false_negatives)} caso(s):")
    lines.append("")
    lines.append(false_negatives.to_markdown(index=False) if len(false_negatives) > 0 else "_Ninguno en este held-out set._")
    lines.append("")
    lines.append("## Limitaciones declaradas")
    lines.append("")
    lines.append(
        "- Split temporal sin exclusión estricta por `customer_id` (ver `split.py`) — un cliente puede aparecer en ambos lados del corte."
    )
    lines.append("- `fraud_score` se usó SOLO como baseline (threshold), nunca como feature de entrada del modelo nuevo (ver `features.py`).")
    lines.append("- Una sola corrida de train/test — sin validación cruzada ni intervalos de confianza sobre las métricas.")
    lines.append("")

    with open(REPORT_PATH, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))
    print(f"Reporte escrito en {REPORT_PATH}")


if __name__ == "__main__":
    main()
