"""Profile the raw LATAM Bank CSVs.

Steps per table:
  1. Detect header variants across partition files (schema evolution).
  2. Load all files with DuckDB (union_by_name) and write a raw Parquet copy to data_parquet/ for the EDA.
  3. Compute column stats, duplicates, FK orphans, partition/date consistency.

Outputs: profiling/profile.json and profiling/profile_report.md
"""
import json
import sys
from collections import defaultdict
from pathlib import Path

import duckdb

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data"
PARQUET = ROOT / "data_parquet"
OUT = ROOT / "profiling"

# table -> (glob, primary key, event timestamp column or None)
TABLES = {
    "customers": ("customers.csv", "customer_id", None),
    "products": ("products.csv", "product_id", None),
    "branches": ("branches.csv", "branch_id", None),
    "service_agents": ("service_agents.csv", "agent_id", None),
    "marketing_campaigns": ("marketing_campaigns.csv", "campaign_id", None),
    "daily_exchange_rates": ("daily_exchange_rates.csv", None, None),
    "transactions": ("transactions/*/*/*/*.csv", "transaction_id", "transaction_date"),
    "call_center_interactions": ("call_center_interactions/*/*/*/*.csv", "interaction_id", "interaction_date"),
    "call_transcripts": ("call_transcripts/*/*/*/*.csv", "transcript_id", None),
    "satisfaction_surveys": ("satisfaction_surveys/*/*/*/*.csv", "survey_id", "survey_date"),
    "digital_events": ("digital_events/*/*/*/*.csv", "event_id", "event_date"),
    "complaints": ("complaints/*/*/*/*.csv", "complaint_id", "creation_date"),
    "campaign_sends": ("campaign_sends/*/*/*/*.csv", "send_id", "send_date"),
}

# (child table, child column, parent table, parent column); mentioned_products is a list, handled separately
FKS = [
    ("products", "customer_id", "customers", "customer_id"),
    ("transactions", "customer_id", "customers", "customer_id"),
    ("call_center_interactions", "customer_id", "customers", "customer_id"),
    ("call_transcripts", "customer_id", "customers", "customer_id"),
    ("satisfaction_surveys", "customer_id", "customers", "customer_id"),
    ("digital_events", "customer_id", "customers", "customer_id"),
    ("complaints", "customer_id", "customers", "customer_id"),
    ("campaign_sends", "customer_id", "customers", "customer_id"),
    ("customers", "registration_branch_id", "branches", "branch_id"),
    ("products", "opening_branch_id", "branches", "branch_id"),
    ("service_agents", "assigned_branch_id", "branches", "branch_id"),
    ("transactions", "branch_id", "branches", "branch_id"),
    ("complaints", "related_branch_id", "branches", "branch_id"),
    ("call_center_interactions", "agent_id", "service_agents", "agent_id"),
    ("call_transcripts", "agent_id", "service_agents", "agent_id"),
    ("satisfaction_surveys", "agent_id", "service_agents", "agent_id"),
    ("complaints", "assigned_agent_id", "service_agents", "agent_id"),
    ("transactions", "product_id", "products", "product_id"),
    ("digital_events", "product_id", "products", "product_id"),
    ("complaints", "affected_product_id", "products", "product_id"),
    ("campaign_sends", "campaign_id", "marketing_campaigns", "campaign_id"),
    ("call_transcripts", "interaction_id", "call_center_interactions", "interaction_id"),
    ("satisfaction_surveys", "interaction_id", "call_center_interactions", "interaction_id"),
    ("complaints", "origin_interaction_id", "call_center_interactions", "interaction_id"),
]

TOP_K = 8
LOW_CARD = 60  # show top values for columns with at most this many distinct values, or any text column

con = duckdb.connect()
con.execute("SET preserve_insertion_order=false")
# Bounded resources: an unbounded run (default ~80% RAM, all cores) crashed the WSL VM on digital_events.
con.execute("SET memory_limit='4GB'")
con.execute("SET threads=4")
con.execute(f"SET temp_directory='{ROOT / '.duckdb_tmp'}'")
con.execute("SET max_temp_directory_size='10GB'")


def q(sql):
    return con.execute(sql).fetchall()


def header_variants(glob):
    variants = defaultdict(list)
    for f in sorted(RAW.glob(glob)):
        with open(f, encoding="utf-8-sig") as fh:
            variants[fh.readline().strip()].append(f.relative_to(RAW).as_posix())
    return [
        {"columns": h.split(","), "n_files": len(fs), "first_file": fs[0], "last_file": fs[-1]}
        for h, fs in sorted(variants.items(), key=lambda kv: kv[1][0])
    ]


def load(table, glob):
    pq = PARQUET / f"{table}.parquet"
    if not pq.exists():
        PARQUET.mkdir(exist_ok=True)
        con.execute(f"""
            COPY (
              SELECT * FROM read_csv('{RAW / glob}', union_by_name=true, filename=true,
                                     header=true, sample_size=200000, hive_partitioning=false)
            ) TO '{pq}' (FORMAT parquet, COMPRESSION zstd)
        """)
    con.execute(f"CREATE OR REPLACE VIEW {table} AS SELECT * FROM read_parquet('{pq}')")


def col_stats(table, n_rows):
    cols = q(f"DESCRIBE {table}")
    out = []
    for name, dtype, *_ in cols:
        if name == "filename":
            continue
        c = f'"{name}"'
        is_text = dtype == "VARCHAR"
        empty = f"count(*) FILTER (WHERE trim({c}) = '')" if is_text else "0"
        nulls, empties, distinct, mn, mx = q(
            f"SELECT count(*) - count({c}), {empty}, count(DISTINCT {c}), "
            f"min({c})::VARCHAR, max({c})::VARCHAR FROM {table}"
        )[0]
        s = {
            "column": name, "type": dtype,
            "null_pct": round(100 * nulls / n_rows, 2) if n_rows else 0,
            "empty_str_pct": round(100 * empties / n_rows, 2) if n_rows else 0,
            "distinct": distinct, "min": mn, "max": mx,
        }
        if dtype in ("BIGINT", "DOUBLE", "INTEGER", "FLOAT") or dtype.startswith("DECIMAL"):
            mean, std, p01, p50, p99 = q(
                f"SELECT avg({c}), stddev({c}), quantile_cont({c}, 0.01), median({c}), "
                f"quantile_cont({c}, 0.99) FROM {table}"
            )[0]
            s.update(mean=mean, std=std, p01=p01, p50=p50, p99=p99,
                     neg_pct=round(100 * q(f"SELECT count(*) FILTER (WHERE {c} < 0) FROM {table}")[0][0] / n_rows, 2))
        if distinct <= LOW_CARD or (is_text and distinct < n_rows * 0.5):
            s["top"] = [[str(v), n] for v, n in q(
                f"SELECT {c}, count(*) n FROM {table} GROUP BY 1 ORDER BY n DESC LIMIT {TOP_K}")]
        out.append(s)
    return out


def duplicates(table, pk):
    cols = [r[0] for r in q(f"DESCRIBE {table}") if r[0] != "filename"]
    collist = ", ".join(f'"{c}"' for c in cols)
    exact = q(f"SELECT count(*) - (SELECT count(*) FROM (SELECT DISTINCT {collist} FROM {table})) FROM {table}")[0][0]
    res = {"exact_duplicate_rows": exact}
    if pk:
        extra, keys = q(f"""SELECT coalesce(sum(n - 1), 0), count(*) FROM
                            (SELECT count(*) n FROM {table} GROUP BY "{pk}" HAVING n > 1)""")[0]
        conflicting = q(f"""SELECT count(*) FROM (SELECT "{pk}" FROM
                             (SELECT DISTINCT {collist} FROM {table}) GROUP BY 1 HAVING count(*) > 1)""")[0][0]
        res.update(pk_extra_rows=extra, pk_keys_duplicated=keys, pk_keys_with_conflicting_values=conflicting,
                   pk_null=q(f'SELECT count(*) FROM {table} WHERE "{pk}" IS NULL')[0][0])
    return res


def temporal(table, ts_col, has_process_date):
    res = {}
    if has_process_date:
        # partition folder date (from filename) vs process_date column
        res["partition_vs_process_date_mismatch"] = q(f"""
            SELECT count(*) FROM {table}
            WHERE regexp_extract(filename, '(\\d{{8}})\\.csv$', 1) <> strftime(process_date::DATE, '%Y%m%d')""")[0][0]
        res["process_date_range"] = [str(x) for x in q(f"SELECT min(process_date), max(process_date) FROM {table}")[0]]
    if ts_col and has_process_date:
        rows = q(f"""
            SELECT date_diff('day', "{ts_col}"::DATE, process_date::DATE) lag, count(*) n
            FROM {table} GROUP BY 1 ORDER BY 1""")
        res["lag_days_process_minus_event"] = [[lag, n] for lag, n in rows[:10]] + (
            [["...", sum(n for _, n in rows[10:])]] if len(rows) > 10 else [])
    if ts_col:
        res["rows_per_month"] = [[str(m), n] for m, n in q(f"""
            SELECT strftime("{ts_col}"::TIMESTAMP, '%Y-%m') m, count(*) FROM {table} GROUP BY 1 ORDER BY 1""")]
    return res


def fk_orphans():
    out = []
    for child, ccol, parent, pcol in FKS:
        n, orphans = q(f"""
            SELECT count(c."{ccol}"), count(c."{ccol}") FILTER (WHERE p.k IS NULL)
            FROM {child} c LEFT JOIN (SELECT DISTINCT "{pcol}" k FROM {parent}) p ON c."{ccol}" = p.k""")[0]
        out.append({"child": f"{child}.{ccol}", "parent": f"{parent}.{pcol}", "non_null": n,
                    "orphans": orphans, "orphan_pct": round(100 * orphans / n, 3) if n else None})
    return out


def main(only=None):
    OUT.mkdir(exist_ok=True)
    report = {}
    for table, (glob, pk, ts) in TABLES.items():
        if only and table not in only:
            continue
        print(f"[profile] {table}", file=sys.stderr, flush=True)
        variants = header_variants(glob)
        load(table, glob)
        n = q(f"SELECT count(*) FROM {table}")[0][0]
        cols = {r[0] for r in q(f"DESCRIBE {table}")}
        report[table] = {
            "rows": n, "files": sum(v["n_files"] for v in variants), "schema_variants": variants,
            "columns": col_stats(table, n), "duplicates": duplicates(table, pk),
            "temporal": temporal(table, ts, "process_date" in cols),
        }
    if not only:
        print("[profile] foreign keys", file=sys.stderr, flush=True)
        report["_foreign_keys"] = fk_orphans()
    (OUT / "profile.json").write_text(json.dumps(report, indent=1, default=str, ensure_ascii=False))
    (OUT / "profile_report.md").write_text(render(report))


def fmt(v):
    if isinstance(v, float):
        return f"{v:,.2f}"
    return "" if v is None else str(v).replace("|", "\\|").replace("\n", " ")[:60]


def render(report):
    lines = ["# LATAM Bank — raw data profile", ""]
    lines += ["| Table | Rows | Files | Schema variants | Exact dup rows | PK dup keys | PK conflicting |",
              "| --- | ---: | ---: | ---: | ---: | ---: | ---: |"]
    for t, r in report.items():
        if t.startswith("_"):
            continue
        d = r["duplicates"]
        lines.append(f"| {t} | {r['rows']:,} | {r['files']} | {len(r['schema_variants'])} | "
                     f"{d['exact_duplicate_rows']:,} | {d.get('pk_keys_duplicated', '')} | "
                     f"{d.get('pk_keys_with_conflicting_values', '')} |")
    for t, r in report.items():
        if t.startswith("_"):
            continue
        lines += ["", f"## {t}", "", f"Rows: {r['rows']:,} · Files: {r['files']}", ""]
        if len(r["schema_variants"]) > 1:
            lines.append("**Schema variants:**")
            base = set(r["schema_variants"][0]["columns"])
            for v in r["schema_variants"]:
                cs = set(v["columns"])
                lines.append(f"- {v['n_files']} files ({v['first_file']} … {v['last_file']}): "
                             f"+{sorted(cs - base)} −{sorted(base - cs)}")
            lines.append("")
        lines.append(f"**Duplicates:** `{r['duplicates']}`")
        lines.append("")
        tm = {k: v for k, v in r["temporal"].items() if k != "rows_per_month"}
        if tm:
            lines += [f"**Temporal:** `{tm}`", ""]
        lines += ["| Column | Type | Null % | Empty % | Distinct | Min | Max | p50 | Top values |",
                  "| --- | --- | ---: | ---: | ---: | --- | --- | ---: | --- |"]
        for c in r["columns"]:
            top = "; ".join(f"{fmt(v)} ({n:,})" for v, n in c.get("top", [])[:6])
            lines.append(f"| {c['column']} | {c['type']} | {c['null_pct']} | {c['empty_str_pct']} | "
                         f"{c['distinct']:,} | {fmt(c['min'])} | {fmt(c['max'])} | {fmt(c.get('p50'))} | {top} |")
    if "_foreign_keys" in report:
        lines += ["", "## Foreign keys", "", "| Child | Parent | Non-null | Orphans | Orphan % |",
                  "| --- | --- | ---: | ---: | ---: |"]
        for f in report["_foreign_keys"]:
            lines.append(f"| {f['child']} | {f['parent']} | {f['non_null']:,} | {f['orphans']:,} | {f['orphan_pct']} |")
    return "\n".join(lines) + "\n"


if __name__ == "__main__":
    main(set(sys.argv[1:]) or None)
