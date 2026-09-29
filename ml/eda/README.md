# ml/eda/ — Análisis exploratorio del dataset (profiling + EDA)

Scripts y salidas del EDA que fundamenta la elección del flujo. El reporte
narrado, con el razonamiento del equipo, está en
[`docs/EDA-LATAM-BANK.md`](../../docs/EDA-LATAM-BANK.md).

## Archivos

| Archivo | Qué hace |
| --- | --- |
| `profile_data.py` | Profiling de las 13 tablas: nulos, cardinalidad, duplicados, FKs huérfanas, consistencia temporal. Genera `profile_report.md`. |
| `01_disputas_vs_tarjetas.py` | EDA 01: métricas de servicio por motivo de contacto y por subcategoría de queja; integridad de los cruces. |
| `02_hipotesis_tarjetas.py` | EDA 02: 10 hipótesis sobre demanda de atención ligada a tarjetas/disputas. |
| `02b_robustez.py` | EDA 02b: McNemar pareado sin bordes + placebos; comprobación de robustez. |
| `*.out.md` | Salidas ya generadas de cada script. |
| `profile_report.md` | Reporte de profiling completo. |

## Cómo correrlos

Estos scripts fueron escritos durante la fase de descubrimiento y asumen un
directorio local `data_parquet/` con una copia en Parquet de las tablas
(una por archivo: `data_parquet/<tabla>.parquet`). En este repo la descarga
oficial del dataset se hace con
[`ml/scripts/download_tables.py`](../scripts/download_tables.py), que escribe
en `ml/data/` (gitignoreado). Para reproducir el EDA, ajustar la constante
`ROOT`/rutas de cada script a la ubicación local de los Parquet, o copiar las
tablas necesarias a `data_parquet/`.

Requisitos: `duckdb` (ver `ml/requirements.txt`). Límite recomendado de
DuckDB: 4 GB de RAM y 4 hilos (sin él, `digital_events` puede agotar la
memoria de la máquina).

Ningún script contiene credenciales: leen Parquet local, no acceden a S3.
