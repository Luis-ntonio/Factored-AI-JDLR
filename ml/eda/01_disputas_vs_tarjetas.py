"""EDA 01 — Disputas vs soporte de tarjetas.

Compara la evidencia disponible para ambos flujos candidatos. Lee data_parquet/ (generado por scripts/profile_data.py).
Uso: python eda/01_disputas_vs_tarjetas.py
"""
from pathlib import Path

import duckdb

ROOT = Path(__file__).resolve().parent.parent
TABLES = ["complaints", "products", "transactions", "call_center_interactions", "satisfaction_surveys", "customers"]

con = duckdb.connect()
con.execute("SET memory_limit='4GB'; SET threads=4")
for t in TABLES:
    con.execute(f"CREATE VIEW {t} AS SELECT * FROM '{ROOT / 'data_parquet' / t}.parquet'")

QUERIES = {
    # --- Señal por motivo de contacto (la única dimensión con variación real)
    "Interacciones por motivo de contacto": """
        SELECT contact_reason, count(*) n, round(100 * count(*) / sum(count(*)) OVER (), 1) pct,
               round(100 * avg(was_resolved::INT), 1) fcr, round(100 * avg(was_escalated::INT), 1) escal,
               round(100 * avg(requires_followup::INT), 1) followup, round(avg(sentiment_score), 3) sent,
               median(duration_seconds) dur_p50, median(wait_time_seconds) wait_p50
        FROM call_center_interactions GROUP BY 1 ORDER BY n DESC""",
    "Encuestas por motivo de contacto": """
        SELECT i.contact_reason, s.survey_type, count(*) n, round(avg(main_score), 2) avg_score
        FROM satisfaction_surveys s JOIN call_center_interactions i USING (interaction_id)
        GROUP BY ALL ORDER BY 1, 2""",
    "FCR por motivo x país": """
        PIVOT (SELECT i.contact_reason, c.country, was_resolved::INT r
               FROM call_center_interactions i JOIN customers c USING (customer_id))
        ON country USING round(100 * avg(r), 1) GROUP BY contact_reason""",
    "FCR por motivo x segmento": """
        PIVOT (SELECT i.contact_reason, c.segment, was_resolved::INT r
               FROM call_center_interactions i JOIN customers c USING (customer_id))
        ON segment USING round(100 * avg(r), 1) GROUP BY contact_reason""",
    "Estacionalidad mensual por motivo (CV = std/media)": """
        WITH m AS (SELECT strftime(interaction_date, '%Y-%m') ym, contact_reason, count(*) n
                   FROM call_center_interactions GROUP BY ALL)
        SELECT contact_reason, min(n) min_mes, max(n) max_mes, round(avg(n)) media_mes, round(stddev(n) / avg(n), 3) cv
        FROM m WHERE ym BETWEEN '2023-07' AND '2026-05' GROUP BY 1 ORDER BY media_mes DESC""",
    # --- Quejas: ¿diferencian disputas de otros casos?
    "Quejas: categoría x subcategoría": """
        PIVOT (SELECT category, coalesce(subcategory, 'NULL') sub FROM complaints)
        ON sub USING count(*) GROUP BY category""",
    "Quejas por subcategoría": """
        SELECT coalesce(subcategory, 'NULL') sub, count(*) n, round(100 * avg(sla_breached::INT), 1) sla_breach,
               median(resolution_days) res_days_p50, round(100 * avg((priority IN ('High', 'Critical'))::INT), 1) high_crit,
               round(100 * avg(is_repeat_complainer::INT), 1) repeat_, round(100 * count(compensation_granted) / count(*), 1) comp_pct,
               round(100 * avg((reception_channel = 'Regulator')::INT), 2) regulator
        FROM complaints GROUP BY 1 ORDER BY n DESC""",
    "Quejas: producto afectado x subcategoría": """
        SELECT coalesce(p.product_type, '(sin producto)') ptype, count(*) n,
               count(*) FILTER (WHERE subcategory = 'Cargo no reconocido') cargo_no_rec,
               count(*) FILTER (WHERE subcategory = 'Cobro indebido') cobro_indebido
        FROM complaints q LEFT JOIN products p ON q.affected_product_id = p.product_id GROUP BY 1 ORDER BY n DESC""",
    # --- Integridad de vínculos entre tablas (¿se puede fundamentar una disputa?)
    "Queja: el producto afectado pertenece al cliente que reclama": """
        SELECT count(*) n, count(*) FILTER (WHERE p.customer_id = q.customer_id) mismo_duenio
        FROM complaints q JOIN products p ON p.product_id = q.affected_product_id""",
    "Transacción: el producto pertenece al cliente de la transacción": """
        SELECT count(*) n, count(*) FILTER (WHERE t.customer_id = p.customer_id) mismo_duenio
        FROM transactions t JOIN products p USING (product_id)""",
    "Queja con transacción en el producto afectado (30 días previos)": """
        WITH q AS (SELECT complaint_id, subcategory, affected_product_id, creation_date, claimed_amount
                   FROM complaints WHERE affected_product_id IS NOT NULL),
        j AS (SELECT q.complaint_id, q.subcategory, q.claimed_amount, t.amount, t.amount_usd, t.is_fraud
              FROM q LEFT JOIN transactions t ON t.product_id = q.affected_product_id
               AND t.transaction_date BETWEEN q.creation_date - INTERVAL 30 DAY AND q.creation_date)
        SELECT coalesce(subcategory, 'NULL') sub, count(DISTINCT complaint_id) n,
               round(100 * count(DISTINCT complaint_id) FILTER (WHERE amount IS NOT NULL) / count(DISTINCT complaint_id), 1) pct_con_txn,
               round(100 * count(DISTINCT complaint_id) FILTER (WHERE is_fraud) / count(DISTINCT complaint_id), 2) pct_con_fraude,
               round(100 * count(DISTINCT complaint_id) FILTER (WHERE abs(amount - claimed_amount) < 0.01
                     OR abs(amount_usd - claimed_amount) < 0.01) / count(DISTINCT complaint_id), 2) pct_monto_coincide
        FROM j GROUP BY 1 ORDER BY n DESC""",
    "Interacción seguida de queja del mismo cliente (7 días)": """
        SELECT i.contact_reason, count(DISTINCT i.interaction_id) n,
               round(100 * count(DISTINCT i.interaction_id) FILTER (WHERE q.complaint_id IS NOT NULL)
                     / count(DISTINCT i.interaction_id), 1) pct_con_queja
        FROM call_center_interactions i LEFT JOIN complaints q ON q.customer_id = i.customer_id
         AND q.creation_date BETWEEN i.interaction_date AND i.interaction_date + INTERVAL 7 DAY
        GROUP BY 1 ORDER BY n DESC""",
    "mentioned_products que existen en products": """
        WITH m AS (SELECT unnest(string_split(mentioned_products, ',')) pid
                   FROM call_center_interactions WHERE mentioned_products IS NOT NULL)
        SELECT count(*) n, count(p.product_id) existentes FROM m LEFT JOIN products p ON p.product_id = m.pid""",
    # --- Tarjetas
    "Transacciones por tipo de producto: estado y fraude": """
        SELECT p.product_type, count(*) n, round(100 * avg((transaction_status = 'Declined')::INT), 2) pct_declinada,
               round(100 * avg((transaction_status = 'Reversed')::INT), 2) pct_reversada, round(100 * avg(is_fraud::INT), 3) pct_fraude
        FROM transactions t JOIN products p USING (product_id) GROUP BY 1 ORDER BY n DESC""",
    "Tipo de transacción por tipo de producto": """
        PIVOT (SELECT p.product_type, transaction_type FROM transactions t JOIN products p USING (product_id))
        ON transaction_type USING count(*) GROUP BY product_type""",
    "Código de respuesta x estado (no aprobadas)": """
        SELECT response_code, transaction_status, count(*) n FROM transactions
        WHERE transaction_status <> 'Approved' GROUP BY ALL ORDER BY ALL""",
}

if __name__ == "__main__":
    for title, sql in QUERIES.items():
        print(f"\n### {title}\n{con.sql(sql).df().to_string(index=False)}")
