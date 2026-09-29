"""EDA 02 — ¿Hay evidencia de demanda de atención ligada a tarjetas (y disputas)?

Cada hipótesis compara contra una línea base. Las temporales usan al propio cliente como control:
tasa de contacto en [t, t+W] tras el evento vs [t-30d-W, t-30d] (misma duración, 30 días antes).
Uso: python eda/02_hipotesis_tarjetas.py
"""
from pathlib import Path

import duckdb

ROOT = Path(__file__).resolve().parent.parent
TABLES = ["complaints", "products", "transactions", "call_center_interactions", "call_transcripts", "digital_events", "customers"]

con = duckdb.connect()
con.execute("SET memory_limit='4GB'; SET threads=4")
for t in TABLES:
    con.execute(f"CREATE VIEW {t} AS SELECT * FROM '{ROOT / 'data_parquet' / t}.parquet'")

con.execute("""
CREATE TEMP TABLE card_products AS
SELECT product_id, customer_id, product_type, product_status, days_past_due FROM products
WHERE product_type IN ('Tarjeta Crédito', 'Tarjeta Débito')""")
con.execute("CREATE TEMP TABLE ints AS SELECT interaction_id, customer_id, interaction_date, contact_reason FROM call_center_interactions")
con.execute("CREATE TEMP TABLE cmps AS SELECT complaint_id, customer_id, creation_date, subcategory FROM complaints")


def event_window(events_sql, target, ts, window, extra_cols=""):
    """Tasa de eventos objetivo del mismo cliente tras el evento vs ventana control 30 días antes."""
    return f"""
    WITH e AS ({events_sql}),
    post AS (SELECT e.eid, count(x.customer_id) n FROM e LEFT JOIN {target} x ON x.customer_id = e.customer_id
             AND x.{ts} > e.t AND x.{ts} <= e.t + INTERVAL {window} GROUP BY e.eid),
    pre AS (SELECT e.eid, count(x.customer_id) n FROM e LEFT JOIN {target} x ON x.customer_id = e.customer_id
            AND x.{ts} > e.t - INTERVAL 30 DAY - INTERVAL {window} AND x.{ts} <= e.t - INTERVAL 30 DAY GROUP BY e.eid)
    SELECT count(*) eventos,
           round(100 * avg((post.n > 0)::INT), 2) pct_con_contacto_post,
           round(100 * avg((pre.n > 0)::INT), 2) pct_con_contacto_control,
           round(avg((post.n > 0)::INT) / nullif(avg((pre.n > 0)::INT), 0), 2) ratio
    FROM e JOIN post USING (eid) JOIN pre USING (eid)"""


def reason_mix_after(events_sql, window):
    """Mezcla de motivos de las llamadas que ocurren tras el evento vs mezcla global."""
    return f"""
    WITH e AS ({events_sql}),
    after AS (SELECT DISTINCT i.interaction_id, i.contact_reason FROM e JOIN ints i ON i.customer_id = e.customer_id
              AND i.interaction_date > e.t AND i.interaction_date <= e.t + INTERVAL {window}),
    a AS (SELECT contact_reason, count(*) n FROM after GROUP BY 1),
    g AS (SELECT contact_reason, count(*) n FROM ints GROUP BY 1)
    SELECT g.contact_reason, round(100 * a.n / sum(a.n) OVER (), 1) pct_tras_evento,
           round(100 * g.n / sum(g.n) OVER (), 1) pct_global, a.n n_tras_evento
    FROM g LEFT JOIN a USING (contact_reason) ORDER BY pct_global DESC"""


# Eventos (eid único, customer_id, t)
DECLINED_CARD = """SELECT transaction_id eid, t.customer_id, transaction_date t FROM transactions t
                   JOIN card_products USING (product_id) WHERE transaction_status = 'Declined'"""
APPROVED_CARD_SAMPLE = """SELECT transaction_id eid, t.customer_id, transaction_date t FROM transactions t
                          JOIN card_products USING (product_id) WHERE transaction_status = 'Approved'
                          USING SAMPLE 80000 ROWS (reservoir, 42)"""
FRAUD = "SELECT transaction_id eid, customer_id, transaction_date t FROM transactions WHERE is_fraud"
REVERSED = "SELECT transaction_id eid, customer_id, transaction_date t FROM transactions WHERE transaction_status = 'Reversed'"
DIGITAL_ERROR_CARD = """SELECT event_id eid, customer_id, event_date t FROM digital_events
                        WHERE event_type = 'Error' AND customer_id IS NOT NULL AND page_url = '/products/credit-card'"""
DIGITAL_ERROR_ANY = """SELECT event_id eid, customer_id, event_date t FROM digital_events
                       WHERE event_type = 'Error' AND customer_id IS NOT NULL USING SAMPLE 80000 ROWS (reservoir, 42)"""

HYPOTHESES = {
    "H1 · Llamadas que mencionan una tarjeta (entre los mentioned_products válidos): mezcla de motivos": """
        WITH m AS (SELECT i.interaction_id, i.contact_reason, unnest(string_split(i.mentioned_products, ',')) pid
                   FROM call_center_interactions i WHERE mentioned_products IS NOT NULL),
        v AS (SELECT DISTINCT m.interaction_id, m.contact_reason,
                     max((p.product_type LIKE 'Tarjeta%')::INT) OVER (PARTITION BY m.interaction_id) menciona_tarjeta
              FROM m JOIN products p ON p.product_id = m.pid)
        PIVOT (SELECT contact_reason, CASE WHEN menciona_tarjeta = 1 THEN 'con_tarjeta' ELSE 'sin_tarjeta' END g FROM v)
        ON g USING count(*) GROUP BY contact_reason""",
    "H2a · Tras una compra con tarjeta DECLINADA, ¿llama más el cliente? (72h vs control)":
        event_window(DECLINED_CARD, "ints", "interaction_date", "72 HOUR"),
    "H2b · Control negativo: tras una compra con tarjeta APROBADA (muestra 80k)":
        event_window(APPROVED_CARD_SAMPLE, "ints", "interaction_date", "72 HOUR"),
    "H2c · Motivos de las llamadas en las 72h tras una declinada vs mezcla global":
        reason_mix_after(DECLINED_CARD, "72 HOUR"),
    "H3a · Tras una transacción FRAUDULENTA, ¿llama más? (7 días)":
        event_window(FRAUD, "ints", "interaction_date", "7 DAY"),
    "H3b · Tras una transacción FRAUDULENTA, ¿reclama más? (30 días)":
        event_window(FRAUD, "cmps", "creation_date", "30 DAY"),
    "H3c · Subcategoría de quejas en los 30 días tras un fraude": """
        WITH e AS (""" + FRAUD + """), a AS (SELECT DISTINCT c.complaint_id, coalesce(c.subcategory, 'NULL') sub FROM e JOIN cmps c
                  ON c.customer_id = e.customer_id AND c.creation_date > e.t AND c.creation_date <= e.t + INTERVAL 30 DAY)
        SELECT sub, count(*) n, round(100 * count(*) / sum(count(*)) OVER (), 1) pct_tras_fraude,
               (SELECT round(100 * count(*) FILTER (WHERE coalesce(subcategory, 'NULL') = a.sub) / count(*), 1) FROM cmps) pct_global
        FROM a GROUP BY sub ORDER BY n DESC""",
    "H4 · Tras un REVERSO, ¿reclama más? (30 días)":
        event_window(REVERSED, "cmps", "creation_date", "30 DAY"),
    "H5a · Tras un Error digital en la página de tarjeta de crédito, ¿llama más? (24h)":
        event_window(DIGITAL_ERROR_CARD, "ints", "interaction_date", "24 HOUR"),
    "H5b · Tras cualquier Error digital (muestra 80k), ¿llama más? (24h)":
        event_window(DIGITAL_ERROR_ANY, "ints", "interaction_date", "24 HOUR"),
    "H6 · Clientes con tarjeta bloqueada/suspendida vs activa: contactos por cliente y motivos": """
        WITH c AS (SELECT customer_id,
                          CASE WHEN bool_or(product_status IN ('Blocked', 'Suspended')) THEN 'tarjeta_bloq_susp' ELSE 'solo_activas_o_cerradas' END g
                   FROM card_products GROUP BY 1),
        n AS (SELECT c.g, c.customer_id, count(i.interaction_id) n_int,
                     count(i.interaction_id) FILTER (WHERE i.contact_reason = 'Queja') n_queja
              FROM c LEFT JOIN ints i USING (customer_id) GROUP BY ALL)
        SELECT g, count(*) clientes, round(avg(n_int), 3) contactos_x_cliente, round(avg(n_queja), 3) quejas_x_cliente
        FROM n GROUP BY g""",
    "H7 · Clientes con vs sin tarjeta: contactos por cliente y % Queja": """
        WITH c AS (SELECT cu.customer_id, (cp.customer_id IS NOT NULL) tiene_tarjeta FROM customers cu
                   LEFT JOIN (SELECT DISTINCT customer_id FROM card_products) cp USING (customer_id)),
        n AS (SELECT c.tiene_tarjeta, c.customer_id, count(i.interaction_id) n_int,
                     count(i.interaction_id) FILTER (WHERE i.contact_reason = 'Queja') n_queja
              FROM c LEFT JOIN ints i USING (customer_id) GROUP BY ALL)
        SELECT tiene_tarjeta, count(*) clientes, round(avg(n_int), 3) contactos_x_cliente,
               round(100 * sum(n_queja) / sum(n_int), 1) pct_queja
        FROM n GROUP BY 1""",
    "H8 · Apertura del transcript ('tarjeta de crédito' vs 'cuenta de ahorros') vs si el cliente tiene tarjeta de crédito": """
        WITH t AS (SELECT customer_id, CASE WHEN customer_text LIKE '%tarjeta de crédito%' THEN 'habla_de_tarjeta'
                                            ELSE 'habla_de_ahorros' END apertura FROM call_transcripts),
        cc AS (SELECT DISTINCT customer_id FROM products WHERE product_type = 'Tarjeta Crédito')
        SELECT apertura, count(*) n, round(100 * avg((cc.customer_id IS NOT NULL)::INT), 1) pct_tiene_tc
        FROM t LEFT JOIN cc USING (customer_id) GROUP BY 1""",
    "H9 · Tarjeta de crédito en mora (days_past_due > 0) vs al día: contactos y motivos Comercial/Retención": """
        WITH c AS (SELECT customer_id, CASE WHEN max(days_past_due) > 0 THEN 'en_mora' ELSE 'al_dia' END g
                   FROM card_products WHERE product_type = 'Tarjeta Crédito' AND days_past_due IS NOT NULL GROUP BY 1),
        n AS (SELECT c.g, c.customer_id, count(i.interaction_id) n_int,
                     count(i.interaction_id) FILTER (WHERE i.contact_reason IN ('Comercial', 'Retención')) n_cr
              FROM c LEFT JOIN ints i USING (customer_id) GROUP BY ALL)
        SELECT g, count(*) clientes, round(avg(n_int), 3) contactos_x_cliente, round(100 * sum(n_cr) / sum(n_int), 1) pct_comercial_retencion
        FROM n GROUP BY g""",
    "H10 · A nivel cliente: correlación de Spearman entre #declinadas de tarjeta y #llamadas Queja": """
        WITH d AS (SELECT t.customer_id, count(*) n_decl FROM transactions t JOIN card_products USING (product_id)
                   WHERE transaction_status = 'Declined' GROUP BY 1),
        q AS (SELECT customer_id, count(*) FILTER (WHERE contact_reason = 'Queja') n_queja, count(*) n_int FROM ints GROUP BY 1),
        j AS (SELECT coalesce(d.n_decl, 0) x, coalesce(q.n_queja, 0) y, coalesce(q.n_int, 0) z
              FROM (SELECT DISTINCT customer_id FROM card_products) c LEFT JOIN d USING (customer_id) LEFT JOIN q USING (customer_id)),
        r AS (SELECT rank() OVER (ORDER BY x) rx, rank() OVER (ORDER BY y) ry, rank() OVER (ORDER BY z) rz FROM j)
        SELECT count(*) clientes, round(corr(rx, ry), 4) spearman_decl_vs_queja, round(corr(rx, rz), 4) spearman_decl_vs_contactos FROM r""",
}

if __name__ == "__main__":
    import sys
    only = sys.argv[1:]
    for title, sql in HYPOTHESES.items():
        if only and not any(title.startswith(o) for o in only):
            continue
        print(f"\n### {title}\n{con.sql(sql).df().to_string(index=False)}", flush=True)
