"""
Descarga SOLO la tabla `transactions` del bucket S3 real del hackathon a un
Parquet local (`ml/data/transactions.parquet`), usando DuckDB con la
extensión `httpfs` -- mismo método que ya usó el equipo para su EDA
(`hacka-info/EDA_LATAM_Bank_resumen.md`: "convertidos a Parquet con DuckDB",
"DuckDB consulta el Parquet directo desde disco... corre en segundos").

NUNCA se corre con credenciales hardcodeadas acá -- todo viene de
`ml/.env` (gitignoreado, ver `ml/.env.example`), vía variables de entorno
estándar de AWS (`AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY`/
`AWS_SESSION_TOKEN`) que boto3/DuckDB leen automáticamente.

Este script se corre en DOS pasos deliberadamente separados:

1. `python download_transactions.py --list` -- SOLO lista los objetos bajo
   HACKATHON_S3_BUCKET/HACKATHON_S3_PREFIX (sin descargar nada), para
   confirmar/ajustar el patrón real de paths antes de bajar 5M filas. La
   estructura exacta de particionado no está codificada acá a ciegas --
   confirmarla primero evita adivinar mal y descargar la tabla equivocada.

2. `python download_transactions.py --glob "<patrón confirmado>"` -- baja
   SOLO los archivos que matcheen ese glob (típicamente algo bajo
   `.../transactions/...`), los consulta con DuckDB directo desde S3, y
   materializa `ml/data/transactions.parquet` local.

Nunca descarga las otras 12 tablas del dataset (customers/products/
complaints/etc.) -- no hacen falta para este entrenamiento (ver
docs/PLAN.md, Fase B: `complaints` ya fue descartada por integridad
referencial rota, y el resto no aporta señal de fraude directa).
"""

import argparse
import os
import sys

import duckdb
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

BUCKET = os.environ.get("HACKATHON_S3_BUCKET")
PREFIX = os.environ.get("HACKATHON_S3_PREFIX", "data/")
OUT_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "transactions.parquet")


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


def list_objects() -> None:
    if not BUCKET:
        sys.exit("HACKATHON_S3_BUCKET no está seteada en ml/.env -- ver ml/.env.example")
    con = get_connection()
    print(f"Listando s3://{BUCKET}/{PREFIX}** (primeros 200 objetos) ...")
    rows = con.execute(
        f"SELECT file FROM glob('s3://{BUCKET}/{PREFIX}**') LIMIT 200"
    ).fetchall()
    for (f,) in rows:
        print(f)
    print(f"\n{len(rows)} objeto(s) listados. Confirmá el path real de `transactions` acá antes de correr --glob.")


def download(glob_pattern: str) -> None:
    if not BUCKET:
        sys.exit("HACKATHON_S3_BUCKET no está seteada en ml/.env -- ver ml/.env.example")
    con = get_connection()
    full_glob = f"s3://{BUCKET}/{glob_pattern}"
    print(f"Consultando {full_glob} ...")
    con.execute(
        f"""
        COPY (
            SELECT * FROM read_csv_auto('{full_glob}', union_by_name=true, ignore_errors=true)
        ) TO '{OUT_PATH}' (FORMAT PARQUET)
        """
    )
    count = con.execute(f"SELECT count(*) FROM read_parquet('{OUT_PATH}')").fetchone()[0]
    print(f"Escrito {OUT_PATH} -- {count} filas.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--list", action="store_true", help="Solo listar objetos bajo el prefix, sin descargar.")
    parser.add_argument("--glob", type=str, default=None, help="Patrón glob (relativo al bucket) de los archivos de transactions a descargar.")
    args = parser.parse_args()

    if args.list:
        list_objects()
    elif args.glob:
        download(args.glob)
    else:
        parser.print_help()
