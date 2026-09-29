"""EDA 02b — Robustez de las hipótesis con ratio > 1 en EDA 02.

(1) McNemar pareado (post vs control 30 días antes) excluyendo eventos a <60 días de los bordes, con placebos.
(2) Comparación no pareada: tasa de queja/llamada tras declinada/reverso/fraude vs transacciones aprobadas (muestra 2%).
Uso: python eda/02b_robustez.py
"""
import math
from pathlib import Path

import duckdb

ROOT = Path(__file__).resolve().parent.parent
con = duckdb.connect()
con.execute("SET memory_limit='4GB'; SET threads=4")
for t in ["transactions", "call_center_interactions", "complaints", "products"]:
    con.execute(f"CREATE VIEW {t} AS SELECT * FROM '{ROOT / 'data_parquet' / t}.parquet'")
EDGE = "transaction_date BETWEEN '2023-08-20' AND '2026-05-15'"
CARDS = "product_id IN (SELECT product_id FROM products WHERE product_type LIKE 'Tarjeta%')"


def binom_p(b, n):
    """Exact two-sided binomial test vs p=0.5 (log space)."""
    lp = lambda k: math.lgamma(n + 1) - math.lgamma(k + 1) - math.lgamma(n - k + 1) - n * math.log(2)
    return min(1.0, 2 * sum(math.exp(lp(i)) for i in range(min(b, n - b) + 1)))


def mcnemar(name, cond, target, ts, w, sample=""):
    ev = f"SELECT transaction_id eid, customer_id, transaction_date t FROM transactions WHERE {cond} AND {EDGE} {sample}"
    b, c = con.sql(f"""
        WITH e AS ({ev}),
        post AS (SELECT e.eid, count(x.customer_id) > 0 hit FROM e LEFT JOIN {target} x ON x.customer_id = e.customer_id
                 AND x.{ts} > e.t AND x.{ts} <= e.t + INTERVAL {w} GROUP BY e.eid),
        pre AS (SELECT e.eid, count(x.customer_id) > 0 hit FROM e LEFT JOIN {target} x ON x.customer_id = e.customer_id
                AND x.{ts} > e.t - INTERVAL 30 DAY - INTERVAL {w} AND x.{ts} <= e.t - INTERVAL 30 DAY GROUP BY e.eid)
        SELECT count(*) FILTER (WHERE post.hit AND NOT pre.hit), count(*) FILTER (WHERE pre.hit AND NOT post.hit)
        FROM post JOIN pre USING (eid)""").fetchone()
    print(f"{name}: solo_post={b} solo_control={c} ratio={b / c:.2f} p={binom_p(b, b + c):.3f}")


def unpaired():
    con.execute(f"""CREATE TEMP TABLE ev AS
        SELECT transaction_id eid, customer_id, transaction_date t,
               CASE WHEN is_fraud THEN 'fraude' WHEN transaction_status = 'Reversed' THEN 'reverso'
                    WHEN transaction_status = 'Declined' THEN 'declinada' ELSE 'aprobada' END g
        FROM transactions WHERE {EDGE}
          AND (is_fraud OR transaction_status IN ('Reversed', 'Declined') OR hash(transaction_id) % 50 = 0)""")
    for target, ts, w, label in [("complaints", "creation_date", "30 DAY", "queja 30d"),
                                 ("call_center_interactions", "interaction_date", "7 DAY", "llamada 7d")]:
        r = dict((g, (n, h)) for g, n, h in con.sql(f"""
            SELECT g, count(*), sum(hit::INT) FROM (
              SELECT e.g, e.eid, count(x.customer_id) > 0 hit FROM ev e LEFT JOIN {target} x
              ON x.customer_id = e.customer_id AND x.{ts} > e.t AND x.{ts} <= e.t + INTERVAL {w} GROUP BY ALL)
            GROUP BY g""").fetchall())
        n2, h2 = r["aprobada"]
        for g in ["declinada", "reverso", "fraude"]:
            n1, h1 = r[g]
            p1, p2, p = h1 / n1, h2 / n2, (h1 + h2) / (n1 + n2)
            z = (p1 - p2) / math.sqrt(p * (1 - p) * (1 / n1 + 1 / n2))
            print(f"{label}: {g} {100 * p1:.2f}% (n={n1}) vs aprobada {100 * p2:.2f}% (n={n2}) "
                  f"ratio={p1 / p2:.2f} p={math.erfc(abs(z) / math.sqrt(2)):.3f}")


if __name__ == "__main__":
    print("## McNemar pareado (sin bordes)")
    mcnemar("H2a declinada tarjeta->llamada 72h", f"transaction_status = 'Declined' AND {CARDS}", "call_center_interactions", "interaction_date", "72 HOUR")
    mcnemar("H2b placebo aprobada tarjeta->llamada 72h", f"transaction_status = 'Approved' AND {CARDS}", "call_center_interactions", "interaction_date", "72 HOUR", "USING SAMPLE 80000 ROWS (reservoir, 42)")
    mcnemar("H3a fraude->llamada 7d", "is_fraud", "call_center_interactions", "interaction_date", "7 DAY")
    mcnemar("H3b fraude->queja 30d", "is_fraud", "complaints", "creation_date", "30 DAY")
    mcnemar("H4 reverso->queja 30d", "transaction_status = 'Reversed'", "complaints", "creation_date", "30 DAY")
    mcnemar("Placebo aprobada->queja 30d", "transaction_status = 'Approved'", "complaints", "creation_date", "30 DAY", "USING SAMPLE 44750 ROWS (reservoir, 7)")
    mcnemar("Placebo aprobada->llamada 7d", "transaction_status = 'Approved'", "call_center_interactions", "interaction_date", "7 DAY", "USING SAMPLE 44750 ROWS (reservoir, 7)")
    print("\n## No pareado vs aprobadas (mismo periodo)")
    unpaired()
