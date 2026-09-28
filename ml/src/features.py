"""
Feature engineering para el clasificador de fraude, sobre
`ml/data/transactions.parquet` (descargado por
`scripts/download_transactions.py`). Ver `docs/PLAN.md`, Fase Dispute B.

REGLA DE ORO -- sin leakage: toda feature agregada del cliente se calcula
SOLO con transacciones ESTRICTAMENTE anteriores a la que se está evaluando
(ventana `ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING`, particionada
por `customer_id`, ordenada por `transaction_date`) -- nunca con el dataset
completo. La primera transacción de cada cliente no tiene features
agregadas (quedan NULL -> se imputan a 0 con un flag `is_first_transaction`
aparte, nunca se descarta la fila silenciosamente).

Explícitamente EXCLUIDO como feature de entrada: `fraud_score`. En el mock
chico separaba perfectamente `is_fraud` (único caso true = 96.0, resto
0.5-4.2) -- es sospechoso de ser casi el label disfrazado. Se usa como
BASELINE a superar (ver `evaluate.py`), nunca como insumo del modelo nuevo.
"""

import duckdb
import pandas as pd

FEATURE_SQL = """
WITH ordered AS (
    SELECT
        *,
        row_number() OVER (PARTITION BY customer_id ORDER BY transaction_date) AS customer_txn_seq
    FROM read_parquet(?)
),
with_history AS (
    SELECT
        *,
        count(*) OVER w_prior AS prior_txn_count,
        avg(amount) OVER w_prior AS prior_avg_amount,
        count(DISTINCT merchant_name) OVER w_prior AS prior_distinct_merchants,
        count(DISTINCT transaction_country) OVER w_prior AS prior_distinct_countries,
        -- Ultima fecha de transaccion previa del mismo cliente (para
        -- days_since_last_txn); NULL en la primera transaccion del cliente.
        lag(transaction_date, 1) OVER (PARTITION BY customer_id ORDER BY transaction_date) AS prev_transaction_date,
        -- Paises vistos en transacciones previas del cliente, para el flag
        -- "pais nuevo para este cliente" (senial clasica de fraude).
        list(DISTINCT transaction_country) OVER w_prior AS prior_countries_seen
    FROM ordered
    WINDOW w_prior AS (
        PARTITION BY customer_id ORDER BY transaction_date
        ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
    )
)
SELECT
    transaction_id,
    customer_id,
    transaction_date,
    is_fraud,                                              -- LABEL, nunca feature de entrada
    fraud_score,                                            -- solo para el baseline, nunca feature
    amount,
    currency,
    channel,
    transaction_type,
    transaction_category,
    merchant_category,
    transaction_country,
    extract(hour FROM transaction_date) AS hour_of_day,
    dayofweek(transaction_date) AS day_of_week,
    (dayofweek(transaction_date) IN (0, 6)) AS is_weekend,
    coalesce(prior_txn_count, 0) AS prior_txn_count,
    (prior_txn_count IS NULL OR prior_txn_count = 0) AS is_first_transaction,
    coalesce(prior_avg_amount, amount) AS prior_avg_amount,
    coalesce(prior_distinct_merchants, 0) AS prior_distinct_merchants,
    coalesce(prior_distinct_countries, 0) AS prior_distinct_countries,
    CASE
        WHEN prev_transaction_date IS NULL THEN NULL
        ELSE date_diff('hour', prev_transaction_date, transaction_date)
    END AS hours_since_last_txn,
    CASE
        WHEN prior_countries_seen IS NULL THEN false
        ELSE NOT list_contains(prior_countries_seen, transaction_country)
    END AS is_new_country_for_customer,
    -- amount respecto al promedio historico del cliente -- señal de "esto
    -- es mucho mas grande de lo que este cliente gasta normalmente".
    CASE
        WHEN prior_avg_amount IS NULL OR prior_avg_amount = 0 THEN NULL
        ELSE amount / prior_avg_amount
    END AS amount_vs_customer_avg_ratio
FROM with_history
ORDER BY transaction_date
"""


def build_features(transactions_parquet_path: str) -> pd.DataFrame:
    """Devuelve un DataFrame con una fila por transacción, listo para
    train/test split (ver `split.py`). `is_fraud`/`fraud_score` quedan en el
    resultado para poder derivar el label y el baseline, pero
    `train.py`/`evaluate.py` son responsables de NUNCA pasarlos como
    feature de entrada al modelo (ver docstring del módulo)."""
    con = duckdb.connect()
    return con.execute(FEATURE_SQL, [transactions_parquet_path]).fetchdf()


FEATURE_COLUMNS = [
    "amount",
    "currency",
    "channel",
    "transaction_type",
    "transaction_category",
    "merchant_category",
    "transaction_country",
    "hour_of_day",
    "day_of_week",
    "is_weekend",
    "prior_txn_count",
    "is_first_transaction",
    "prior_avg_amount",
    "prior_distinct_merchants",
    "prior_distinct_countries",
    "hours_since_last_txn",
    "is_new_country_for_customer",
    "amount_vs_customer_avg_ratio",
]

CATEGORICAL_COLUMNS = [
    "currency",
    "channel",
    "transaction_type",
    "transaction_category",
    "merchant_category",
    "transaction_country",
]
