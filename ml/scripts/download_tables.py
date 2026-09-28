"""
Descarga tablas puntuales del bucket S3 real del hackathon a Parquet local
(`ml/data/<tabla>.parquet`), usando DuckDB con la extensión `httpfs` --
mismo método que ya usó el equipo para su EDA (`hacka-info/
EDA_LATAM_Bank_resumen.md`: "convertidos a Parquet con DuckDB", "DuckDB
consulta el Parquet directo desde disco... corre en segundos").

NUNCA se corre con credenciales hardcodeadas acá -- todo viene de
`ml/.env` (gitignoreado, ver `ml/.env.example`), vía variables de entorno
estándar de AWS (`AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY`/
`AWS_SESSION_TOKEN`) que boto3/DuckDB leen automáticamente.

Tablas soportadas (ver docs/PLAN.md, Fase Dispute B, y ml/README.md para el
razonamiento completo de por qué estas 4 y no las otras 9):
  - transactions (5M filas): la tabla principal, features + label de fraude.
  - customers (150k filas): demografía/ubicación de residencia -- resuelve
    el "cold start" de clientes con poco historial propio.
  - products (400k filas): tipo real de producto/límite de crédito.
  - daily_exchange_rates (3k filas): normalizar montos multi-moneda a USD.

Explícitamente NO se descargan: complaints (integridad referencial rota,
ver EDA real), call_center_interactions/call_transcripts/digital_events
(el EDA probó 10 hipótesis de conexión con tarjetas/transacciones y todas
dieron nulo -- no hay señal real que joinear), branches/service_agents/
marketing_campaigns/campaign_sends/satisfaction_surveys (sin relación con
fraude de transacciones).

Este script se corre en DOS pasos deliberadamente separados, por tabla:

1. `python download_tables.py --list --table transactions` -- SOLO lista
   los objetos bajo el subpath de esa tabla (sin descargar nada, sin
   límite -- escribe a ml/data/s3_listing_<tabla>.txt, nunca a consola,
   puede haber miles de particiones diarias). Confirmar el patrón real
   antes de bajar cada tabla evita adivinar mal.

2. `python download_tables.py --table transactions --glob "<patrón confirmado>"`
   -- baja SOLO los archivos que matcheen ese glob, los consulta con
   DuckDB directo desde S3, y materializa `ml/data/<tabla>.parquet` local.
"""

import argparse
import os
import sys

import duckdb
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

BUCKET = os.environ.get("HACKATHON_S3_BUCKET")
PREFIX = os.environ.get("HACKATHON_S3_PREFIX", "data/")
DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data")

SUPPORTED_TABLES = ["transactions", "customers", "products", "daily_exchange_rates"]


def get_connection() -> duckdb.DuckDBPyConnection:
    con = duckdb.connect()
    con.execute("INSTALL httpfs; LOAD httpfs;")
    # DuckDB's aws extension lee las credenciales del entorno (mismo boto3
    # credential chain) si se le pide explícitamente con CREATE SECRET, o
    # via las variables de entorno estándar AWS_* que ya exporta el .env --
    # no se pasa ninguna clave literal en este archivo.
    con.execute("INSTALL aws; LOAD aws;")
    con.execute("CREATE OR REPLACE SECRET (TYPE s3, PROVIDER credential_chain);")
    return con


def list_objects(table: str) -> None:
    if not BUCKET:
        sys.exit("HACKATHON_S3_BUCKET no está seteada en ml/.env -- ver ml/.env.example")
    con = get_connection()
    full = f"s3://{BUCKET}/{PREFIX}{table}/**"
    print(f"Listando {full} (SIN límite -- puede tardar si hay muchas particiones) ...")
    rows = con.execute(f"SELECT file FROM glob('{full}') ORDER BY file").fetchall()

    if len(rows) == 0:
        # Puede que la tabla NO esté particionada (ej. un solo CSV plano
        # como branches.csv) -- probar el patrón alternativo antes de
        # asumir que no existe.
        full = f"s3://{BUCKET}/{PREFIX}{table}.csv"
        print(f"Sin resultados como carpeta -- probando archivo plano: {full}")
        rows = con.execute(f"SELECT file FROM glob('{full}')").fetchall()

    os.makedirs(DATA_DIR, exist_ok=True)
    out_path = os.path.join(DATA_DIR, f"s3_listing_{table}.txt")
    with open(out_path, "w", encoding="utf-8") as f:
        for (path,) in rows:
            f.write(path + "\n")

    print(f"{len(rows)} objeto(s) listados para '{table}'.")
    print(f"Listado completo guardado en {out_path} (no tiene credenciales -- son solo paths, se puede compartir).")


def download(table: str, glob_pattern: str) -> None:
    if not BUCKET:
        sys.exit("HACKATHON_S3_BUCKET no está seteada en ml/.env -- ver ml/.env.example")
    con = get_connection()
    full_glob = f"s3://{BUCKET}/{glob_pattern}"
    out_path = os.path.join(DATA_DIR, f"{table}.parquet")
    print(f"Consultando {full_glob} ...")
    os.makedirs(DATA_DIR, exist_ok=True)
    con.execute(
        f"""
        COPY (
            SELECT * FROM read_csv_auto('{full_glob}', union_by_name=true, ignore_errors=true)
        ) TO '{out_path}' (FORMAT PARQUET)
        """
    )
    count = con.execute(f"SELECT count(*) FROM read_parquet('{out_path}')").fetchone()[0]
    print(f"Escrito {out_path} -- {count} filas.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--table", type=str, required=True, choices=SUPPORTED_TABLES, help="Tabla a listar/descargar.")
    parser.add_argument("--list", action="store_true", help="Solo listar objetos de la tabla, sin descargar.")
    parser.add_argument("--glob", type=str, default=None, help="Patrón glob (relativo al bucket) de los archivos a descargar.")
    args = parser.parse_args()

    if args.list:
        list_objects(args.table)
    elif args.glob:
        download(args.table, args.glob)
    else:
        parser.print_help()
