"""
Split train/test para el clasificador de fraude. Ver docstring de
`features.py` para la regla de leakage de las features -- este módulo
resuelve la parte de "qué filas van a train y cuáles a test".

Metodología (documentada, no la única posible -- ver limitación abajo):
corte TEMPORAL (train = transacciones más antiguas, test = las más
recientes) es el escenario realista de este problema: un modelo de fraude
en producción siempre se entrena con el pasado y se aplica sobre
transacciones futuras, incluyendo del MISMO cliente -- por eso las features
de `features.py` ya son point-in-time correctas (nunca miran el futuro de
ESA fila), lo cual es la protección real contra leakage, no la partición en
sí.

LIMITACIÓN DECLARADA: no se fuerza además una partición exclusiva por
`customer_id` (un cliente puede aparecer en ambos lados del corte temporal)
-- se reporta el % de clientes de test ya vistos en train como métrica de
transparencia (`overlap_report`), no se oculta. Forzar además una partición
100% exclusiva por cliente sería un escenario DISTINTO ("¿generaliza a
clientes nunca vistos?") y más estricto que el problema real que se está
resolviendo acá ("¿generaliza a transacciones futuras?") -- documentado como
simplificación deliberada de este checkpoint, no un descuido.
"""

from dataclasses import dataclass

import pandas as pd


@dataclass
class SplitResult:
    train: pd.DataFrame
    test: pd.DataFrame
    cutoff_date: pd.Timestamp
    customer_overlap_pct: float


def temporal_split(df: pd.DataFrame, test_fraction: float = 0.2) -> SplitResult:
    df = df.sort_values("transaction_date").reset_index(drop=True)
    cutoff_idx = int(len(df) * (1 - test_fraction))
    cutoff_date = df.iloc[cutoff_idx]["transaction_date"]

    train = df[df["transaction_date"] < cutoff_date].copy()
    test = df[df["transaction_date"] >= cutoff_date].copy()

    train_customers = set(train["customer_id"])
    test_customers = set(test["customer_id"])
    overlap = len(test_customers & train_customers)
    overlap_pct = 100.0 * overlap / max(1, len(test_customers))

    return SplitResult(train=train, test=test, cutoff_date=cutoff_date, customer_overlap_pct=overlap_pct)
