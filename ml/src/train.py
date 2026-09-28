"""
Entrena el clasificador de fraude. Empieza simple (regresión logística) a
propósito -- ver docs/PLAN.md, Fase B, paso 4: si el ganador es simple, se
traduce a una función TypeScript auditable (`fraud-risk-score.ts`, mismo
criterio "reproducible a mano" que `compute-score.ts`); solo se escala a un
modelo más complejo (gradient boosting) si la regresión logística no
alcanza una mejora real sobre el baseline (`fraud_score` existente).

Uso: python -m ml.src.train (desde la raíz del repo, con ml/data/transactions.parquet ya descargado).
"""

import os
import pickle

import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import FunctionTransformer, OneHotEncoder, StandardScaler

from .features import BOOLEAN_COLUMNS, CATEGORICAL_COLUMNS, FEATURE_COLUMNS, NUMERIC_COLUMNS, build_features
from .preprocessing import bool_to_float
from .split import temporal_split

DATA_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "transactions.parquet")
MODEL_PATH = os.path.join(os.path.dirname(__file__), "..", "models", "fraud_model.pkl")


def build_pipeline() -> Pipeline:
    preprocessor = ColumnTransformer(
        transformers=[
            ("numeric", Pipeline([("impute", SimpleImputer(strategy="median")), ("scale", StandardScaler())]), NUMERIC_COLUMNS),
            # SimpleImputer no soporta dtype bool directo (ValueError) --
            # castea a float primero (True/False -> 1.0/0.0), después
            # imputa/escala igual que las columnas numéricas.
            (
                "boolean",
                Pipeline(
                    [
                        ("to_float", FunctionTransformer(bool_to_float)),
                        ("impute", SimpleImputer(strategy="most_frequent")),
                    ]
                ),
                BOOLEAN_COLUMNS,
            ),
            ("categorical", OneHotEncoder(handle_unknown="ignore"), CATEGORICAL_COLUMNS),
        ]
    )
    # class_weight="balanced": el fraude es raro (desbalance severo) -- sin
    # esto, el modelo aprende trivialmente "nunca es fraude" y saca accuracy
    # alta pero recall cero. Ver evaluate.py para por qué accuracy NO es la
    # métrica reportada acá.
    model = LogisticRegression(max_iter=1000, class_weight="balanced")
    return Pipeline([("preprocess", preprocessor), ("model", model)])


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

    X_train, y_train = split.train[FEATURE_COLUMNS], split.train["is_fraud"]
    pipeline = build_pipeline()
    pipeline.fit(X_train, y_train)

    os.makedirs(os.path.dirname(MODEL_PATH), exist_ok=True)
    with open(MODEL_PATH, "wb") as f:
        pickle.dump(pipeline, f)
    print(f"Modelo entrenado y guardado en {MODEL_PATH}.")

    # Persistimos también el split de test (no el de train, que puede ser
    # grande) para que evaluate.py corra sin tener que reconstruir features
    # ni repetir el split -- misma fuente de verdad, un solo lugar donde se
    # define el corte temporal.
    test_path = os.path.join(os.path.dirname(__file__), "..", "data", "test_split.parquet")
    split.test.to_parquet(test_path)
    print(f"Split de test guardado en {test_path} para evaluate.py.")


if __name__ == "__main__":
    main()
