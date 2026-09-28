"""
Entrena el clasificador de fraude.

Escaló a HistGradientBoostingClassifier (sklearn, sin dependencia extra)
DESPUÉS de un intento real con regresión logística (empezar simple, ver
docs/PLAN.md, Fase B, paso 4) que falló de forma verificable: con
`class_weight="balanced"` bajo el desbalance real (fraude 0.098%), las
probabilidades predichas quedaban casi sin separación entre clases
(fraude real: media 0.489, std 0.03 -- prácticamente indistinguible del
resto) y el modelo nunca superó el baseline `fraud_score` ya existente en
el dataset. Ver docs/STATUS.md para el detalle completo del diagnóstico.
Gradient boosting maneja mejor interacciones no lineales entre features y
NaN/categóricas nativamente (sin imputar/escalar/one-hot a mano) -- ver
`features.prepare_model_input`.

Si este modelo SÍ supera al baseline con margen real (ver evaluate.py):
dado que no es un modelo lineal simple, la exportación a producción NO es
una traducción manual a TypeScript (a diferencia del plan original para
una regresión logística) -- se exporta a ONNX + onnxruntime-node, ver
docs/PLAN.md paso 5.

Uso: python -m src.train (desde ml/, con ml/data/{transactions,customers,products,daily_exchange_rates}.parquet ya descargados).
"""

import json
import os
import pickle

from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.metrics import average_precision_score, f1_score

from .features import CATEGORICAL_COLUMNS, build_features, prepare_model_input
from .split import temporal_split

DATA_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "transactions.parquet")
MODEL_PATH = os.path.join(os.path.dirname(__file__), "..", "models", "fraud_model.pkl")


def build_model() -> HistGradientBoostingClassifier:
    return HistGradientBoostingClassifier(
        categorical_features=CATEGORICAL_COLUMNS,
        class_weight="balanced",
        max_iter=300,
        early_stopping=True,
        random_state=42,
    )


def best_threshold_for_f1(y_true, y_score) -> float:
    """Barre thresholds de probabilidad para maximizar F1 sobre una
    validación interna de train (nunca sobre el held-out final, ver
    main()) -- necesario porque `class_weight="balanced"` desplaza la
    probabilidad "de fábrica" 0.5 respecto al desbalance real."""
    best_t, best_f1 = 0.5, -1.0
    for t in [i / 100 for i in range(1, 100)]:
        preds = (y_score >= t).astype(int)
        f1 = f1_score(y_true, preds, zero_division=0)
        if f1 > best_f1:
            best_t, best_f1 = t, f1
    return best_t


def main() -> None:
    if not os.path.exists(DATA_PATH):
        raise SystemExit(
            f"{DATA_PATH} no existe -- correr primero scripts/download_tables.py --table transactions (ver ml/README.md)."
        )

    print("Construyendo features (point-in-time, ver features.py)...")
    df = build_features(DATA_PATH)
    print(f"{len(df)} transacciones, {df['is_fraud'].sum()} marcadas is_fraud=true ({100*df['is_fraud'].mean():.3f}%).")

    split = temporal_split(df)
    print(
        f"Split temporal: train={len(split.train)} filas (hasta {split.cutoff_date}), "
        f"test={len(split.test)} filas. Overlap de clientes test-en-train: {split.customer_overlap_pct:.1f}% "
        "(ver limitación declarada en split.py)."
    )

    # Carve de validación DENTRO de train (temporal, últimas filas de train
    # -- nunca toca test) para elegir el threshold de decisión -- ver
    # best_threshold_for_f1(). El modelo FINAL se re-entrena sobre TODO
    # train una vez elegido el threshold, para no desperdiciar datos.
    train_sorted = split.train.sort_values("transaction_date").reset_index(drop=True)
    val_cutoff_idx = int(len(train_sorted) * 0.85)
    train_fit, train_val = train_sorted.iloc[:val_cutoff_idx], train_sorted.iloc[val_cutoff_idx:]
    print(
        f"Validación interna para threshold: {len(train_val)} filas, "
        f"{int(train_val['is_fraud'].sum())} fraude real (suficiente muestra para un threshold estable)."
    )

    model = build_model()
    model.fit(prepare_model_input(train_fit), train_fit["is_fraud"])
    val_scores = model.predict_proba(prepare_model_input(train_val))[:, 1]
    threshold = best_threshold_for_f1(train_val["is_fraud"], val_scores)
    print(f"Threshold de decisión elegido sobre validación interna de train (nunca sobre test): {threshold}")

    print("Re-entrenando sobre TODO train con el threshold ya elegido...")
    model = build_model()
    model.fit(prepare_model_input(train_sorted), train_sorted["is_fraud"])

    os.makedirs(os.path.dirname(MODEL_PATH), exist_ok=True)
    with open(MODEL_PATH, "wb") as f:
        pickle.dump({"pipeline": model, "threshold": threshold}, f)
    print(f"Modelo + threshold entrenados y guardados en {MODEL_PATH}.")

    # Diagnóstico in-sample: ¿el modelo separa clases sobre datos que SÍ vio
    # en entrenamiento? Si no, no es un problema de generalización -- es
    # evidencia de que las features (sin fraud_score) no predicen is_fraud
    # mejor que el azar. Se calcula ACÁ (no en evaluate.py) porque
    # train_sorted ya está en memoria, featurizado -- reconstruirlo desde
    # cero solo para este diagnóstico sería carísimo sobre 4.4M filas.
    diag_sample = train_sorted.sample(n=min(200_000, len(train_sorted)), random_state=1)
    diag_scores = model.predict_proba(prepare_model_input(diag_sample))[:, 1]
    diagnostic = {
        "in_sample_pr_auc": average_precision_score(diag_sample["is_fraud"], diag_scores),
        "in_sample_base_rate": float(diag_sample["is_fraud"].mean()),
        "sample_size": len(diag_sample),
    }
    diagnostic_path = os.path.join(os.path.dirname(__file__), "..", "data", "train_diagnostic.json")
    with open(diagnostic_path, "w") as f:
        json.dump(diagnostic, f, indent=2)
    print(f"Diagnóstico in-sample: PR-AUC={diagnostic['in_sample_pr_auc']:.4f} vs. base rate={diagnostic['in_sample_base_rate']:.5f} -- guardado en {diagnostic_path}.")

    # Persistimos también el split de test (no el de train, que puede ser
    # grande) para que evaluate.py corra sin tener que reconstruir features
    # ni repetir el split -- misma fuente de verdad, un solo lugar donde se
    # define el corte temporal.
    test_path = os.path.join(os.path.dirname(__file__), "..", "data", "test_split.parquet")
    split.test.to_parquet(test_path)
    print(f"Split de test guardado en {test_path} para evaluate.py.")


if __name__ == "__main__":
    main()
