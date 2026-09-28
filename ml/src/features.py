"""
Feature engineering para el clasificador de fraude, sobre las 4 tablas
reales descargadas por `scripts/download_tables.py`:
`ml/data/{transactions,customers,products,daily_exchange_rates}.parquet`.
Ver `docs/PLAN.md`, Fase Dispute B, y `ml/README.md` para el razonamiento
completo de por qué estas 4 tablas y no las otras 9 del dataset.

REGLA DE ORO -- sin leakage:

1. Agregados de HISTORIAL del cliente (esta misma tabla `transactions`):
   se calculan SOLO con transacciones ESTRICTAMENTE anteriores a la que se
   está evaluando (ventana `ROWS BETWEEN UNBOUNDED PRECEDING AND 1
   PRECEDING`, particionada por `customer_id`, ordenada por
   `transaction_date`) -- nunca con el dataset completo.

2. Atributos de `customers`/`products` (tablas DIMENSIÓN, sin historial
   versionado -- el dataset solo da el estado ACTUAL de cada cliente/
   producto, no una foto de cómo estaba en el momento de cada
   transacción pasada): se usan ÚNICAMENTE los campos que son estáticos o
   solo pueden MOVERSE HACIA ADELANTE en el tiempo de forma monótona
   (fecha de nacimiento, fecha de alta/apertura -- siempre en el pasado
   respecto a cualquier transacción del cliente, nunca cambian). Se
   EXCLUYEN explícitamente los campos que reflejan estado/comportamiento
   RECIENTE y podrían estar contaminados por fraude ya detectado o
   actividad posterior a la transacción evaluada:
     - `customers.credit_score`, `estimated_monthly_income`, `segment`,
       `customer_status`: pueden recalcularse/actualizarse por
       comportamiento reciente (incluido fraude ya confirmado) -- usar el
       valor ACTUAL para predecir una transacción PASADA sería leakage.
     - `products.current_balance`, `days_past_due`, `product_status`,
       `last_transaction_date`: `current_balance` en particular es
       literalmente la suma de TODAS las transacciones hasta hoy,
       incluidas las posteriores a la fila que se está evaluando --
       leakage directo, nunca se usa.

3. `fraud_score` (en `transactions`) y cualquier campo de `complaints`:
   NUNCA como feature de entrada -- ver docstring de versiones anteriores
   de este archivo / `docs/PLAN.md`. `fraud_score` se usa solo como
   baseline en `evaluate.py`.

La primera transacción de cada cliente no tiene features agregadas de
historial (quedan NULL -> se imputan a 0 con un flag `is_first_transaction`
aparte, nunca se descarta la fila silenciosamente) -- para ESE caso
concreto es donde los atributos de `customers` (país/ciudad de residencia)
aportan más, porque no hay historial propio para comparar.
"""

import os

import duckdb
import pandas as pd

TRANSACTION_HISTORY_SQL = """
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
        lag(transaction_date, 1) OVER (PARTITION BY customer_id ORDER BY transaction_date) AS prev_transaction_date,
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
    product_id,
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
    CASE
        WHEN prior_avg_amount IS NULL OR prior_avg_amount = 0 THEN NULL
        ELSE amount / prior_avg_amount
    END AS amount_vs_customer_avg_ratio
FROM with_history
ORDER BY transaction_date
"""

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data")


def _load_transaction_history(transactions_path: str) -> pd.DataFrame:
    con = duckdb.connect()
    return con.execute(TRANSACTION_HISTORY_SQL, [transactions_path]).fetchdf()


def _join_customers(df: pd.DataFrame, customers_path: str) -> pd.DataFrame:
    customers = pd.read_parquet(
        customers_path,
        columns=["customer_id", "country", "city", "state", "gender", "document_type", "date_of_birth", "registration_date"],
    )
    df = df.merge(customers, on="customer_id", how="left", suffixes=("", "_customer"))

    df["transaction_date"] = pd.to_datetime(df["transaction_date"])
    df["date_of_birth"] = pd.to_datetime(df["date_of_birth"], errors="coerce")
    df["registration_date"] = pd.to_datetime(df["registration_date"], errors="coerce")

    df["customer_age_years"] = (df["transaction_date"] - df["date_of_birth"]).dt.days / 365.25
    df["customer_tenure_days"] = (df["transaction_date"] - df["registration_date"]).dt.days
    # Tenure negativo (registro posterior a la transacción -- dato mal
    # cargado/tarde, el propio dataset documenta "late arrivals") se
    # clampea a NULL en vez de dejarlo como una señal falsa.
    df.loc[df["customer_tenure_days"] < 0, "customer_tenure_days"] = None

    df["is_transaction_country_home_country"] = df["transaction_country"] == df["country"]

    return df.rename(columns={"country": "customer_home_country", "city": "customer_home_city", "state": "customer_home_state"})


def _join_products(df: pd.DataFrame, products_path: str) -> pd.DataFrame:
    products = pd.read_parquet(products_path, columns=["product_id", "product_type", "credit_limit", "opening_date"])
    df = df.merge(products, on="product_id", how="left", suffixes=("", "_product"))

    df["opening_date"] = pd.to_datetime(df["opening_date"], errors="coerce")
    df["account_age_days"] = (df["transaction_date"] - df["opening_date"]).dt.days
    df.loc[df["account_age_days"] < 0, "account_age_days"] = None

    df["amount_vs_credit_limit_ratio"] = df["amount"] / df["credit_limit"].where(df["credit_limit"] > 0)

    return df


def _join_exchange_rates(df: pd.DataFrame, rates_path: str) -> pd.DataFrame:
    """Normaliza `amount` a USD usando `daily_exchange_rates`. Defensivo a
    propósito: el schema exacto de esta tabla no se confirmó todavía contra
    el archivo real (no se pudo inspeccionar sin acceso al dataset) -- si
    las columnas esperadas (`currency`, `rate_date`, `rate_to_usd`) no
    existen con esos nombres, se loguea una advertencia y se sigue sin la
    normalización en vez de romper todo el pipeline."""
    try:
        rates = pd.read_parquet(rates_path)
    except Exception as e:  # noqa: BLE001 -- defensivo, ver docstring
        print(f"ADVERTENCIA: no se pudo leer {rates_path} ({e}) -- sin normalización de moneda.")
        df["amount_usd_normalized"] = df["amount"]
        return df

    expected = {"currency", "rate_date", "rate_to_usd"}
    if not expected.issubset(set(c.lower() for c in rates.columns)):
        print(
            f"ADVERTENCIA: daily_exchange_rates.parquet no tiene las columnas esperadas {expected} "
            f"(tiene {list(rates.columns)}) -- AJUSTAR _join_exchange_rates() con los nombres reales. "
            "Sin normalización de moneda por ahora."
        )
        df["amount_usd_normalized"] = df["amount"]
        return df

    rates = rates.rename(columns={c: c.lower() for c in rates.columns})
    rates["rate_date"] = pd.to_datetime(rates["rate_date"])
    df["process_date"] = pd.to_datetime(df["transaction_date"]).dt.floor("D")
    df = df.merge(rates[["currency", "rate_date", "rate_to_usd"]], left_on=["currency", "process_date"], right_on=["currency", "rate_date"], how="left")
    df["amount_usd_normalized"] = df["amount"] * df["rate_to_usd"]
    # USD ya es USD (rate=1) -- si la tabla no cubre USD explícitamente, no
    # dejar NULL una fila que en realidad no necesitaba conversión.
    df.loc[df["currency"] == "USD", "amount_usd_normalized"] = df.loc[df["currency"] == "USD", "amount"]
    return df


def build_features(
    transactions_path: str,
    customers_path: str | None = None,
    products_path: str | None = None,
    exchange_rates_path: str | None = None,
) -> pd.DataFrame:
    """Devuelve un DataFrame con una fila por transacción. `customers_path`/
    `products_path`/`exchange_rates_path` son opcionales (default: buscar en
    `ml/data/` junto a `transactions_path`) para poder seguir corriendo el
    smoke test sintético que solo tiene `transactions` sin romper."""
    df = _load_transaction_history(transactions_path)

    customers_path = customers_path or os.path.join(DATA_DIR, "customers.parquet")
    products_path = products_path or os.path.join(DATA_DIR, "products.parquet")
    exchange_rates_path = exchange_rates_path or os.path.join(DATA_DIR, "daily_exchange_rates.parquet")

    if os.path.exists(customers_path):
        df = _join_customers(df, customers_path)
    if os.path.exists(products_path):
        df = _join_products(df, products_path)
    if os.path.exists(exchange_rates_path):
        df = _join_exchange_rates(df, exchange_rates_path)
    else:
        df["amount_usd_normalized"] = df["amount"]

    return df


FEATURE_COLUMNS = [
    "amount",
    "amount_usd_normalized",
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
    # customers (solo atributos estáticos, ver docstring del módulo)
    "customer_home_country",
    "gender",
    "document_type",
    "customer_age_years",
    "customer_tenure_days",
    "is_transaction_country_home_country",
    # products (solo atributos estáticos, ver docstring del módulo)
    "product_type",
    "credit_limit",
    "account_age_days",
    "amount_vs_credit_limit_ratio",
]

CATEGORICAL_COLUMNS = [
    "currency",
    "channel",
    "transaction_type",
    "transaction_category",
    "merchant_category",
    "transaction_country",
    "customer_home_country",
    "gender",
    "document_type",
    "product_type",
]

# Booleanas -- necesitan su propia rama de preprocesamiento en train.py
# (SimpleImputer no soporta dtype bool directo, ver preprocessing.py).
# Lista explícita (no derivada por dtype) para que agregar una columna
# nueva a FEATURE_COLUMNS sin actualizar esta lista falle ruidosamente
# (KeyError en ColumnTransformer) en vez de silenciosamente tratarla como
# numérica.
BOOLEAN_COLUMNS = [
    "is_weekend",
    "is_first_transaction",
    "is_new_country_for_customer",
    "is_transaction_country_home_country",
]

NUMERIC_COLUMNS = [c for c in FEATURE_COLUMNS if c not in CATEGORICAL_COLUMNS and c not in BOOLEAN_COLUMNS]
