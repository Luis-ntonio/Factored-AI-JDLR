# ml/ — Clasificador de fraude entrenado (evidencia de "learned component")

Pipeline offline (Python, fuera de los workspaces npm) que entrena y evalúa
un clasificador de fraude sobre la tabla `transactions` real del dataset del
hackathon, para reemplazar el lookup directo `fraudSuspected = tx.is_fraud`
de `services/transaction-agent/src/compute-dispute.ts` por un score
predicho en tiempo de consulta — ver `docs/PLAN.md`, sección "Fase Dispute
B", para el razonamiento completo (por qué este es el único challenge donde
entrenar un modelo está justificado, por qué NO se entrena nada para
eligibility/intent).

## Estado actual

- ✅ Código completo y probado mecánicamente con datos sintéticos
  (`features.py`/`split.py`/`train.py`/`evaluate.py` corren de punta a
  punta sin errores, producen `REPORT.md` con métricas coherentes).
- ⛔ **Bloqueado en la descarga del dataset real** — necesita las
  credenciales temporales de S3 del hackathon (`hacka-info/
  LATAM_Bank_Complete_Data_Dictionary.pdf`, pág. 2), que el sistema de
  permisos de este entorno bloqueó extraer automáticamente (clasificador de
  "Credential Materialization" — correctamente: nunca deben pasar por mi
  contexto). Ver "Cómo desbloquear" abajo.
- ⬜ Pendiente (una vez que exista `ml/data/transactions.parquet` real):
  correr `train.py`/`evaluate.py` de verdad, exportar el modelo ganador a
  `services/transaction-agent/src/scoring/fraud-risk-score.ts` (auditable
  si es regresión logística/árbol chico, o ONNX si gana algo más complejo),
  e integrarlo en `compute-dispute.ts` vía `ComputeDisputeDeps.fraudScorer`.

## Cómo desbloquear la descarga (necesito esto de tu parte)

Elegí UNA de estas dos opciones — en ninguna necesito que me pegues las
credenciales en el chat:

1. **Vos corrés la descarga.** Copiá `ml/.env.example` a `ml/.env`,
   completalo con las credenciales de la pág. 2 del PDF (nunca se commitea,
   está en `.gitignore`), y corré:
   ```
   cd ml && ./venv/Scripts/pip install -r requirements.txt
   ./venv/Scripts/python scripts/download_transactions.py --list
   ```
   Pegame acá la lista de paths que imprime (son nombres de archivo, no
   datos sensibles) para confirmar el glob correcto, y después:
   ```
   ./venv/Scripts/python scripts/download_transactions.py --glob "<glob confirmado>"
   ```
   Avisame cuando `ml/data/transactions.parquet` exista y sigo yo con
   `train.py`/`evaluate.py`/la integración en TypeScript.

2. **Me das un rule de permisos explícito** para leer esa página del PDF
   (o me pegás vos el bucket/prefix — sin las claves secretas, esas sí las
   necesito solo en `ml/.env` local) y lo intento de nuevo yo.

## Setup

```
cd ml
python -m venv venv
./venv/Scripts/pip install -r requirements.txt   # Windows; en mac/linux: venv/bin/pip
cp .env.example .env    # completar con credenciales reales, nunca commitear
```

## Pipeline (una vez que `ml/data/transactions.parquet` existe)

```
./venv/Scripts/python -m src.train      # entrena, guarda ml/models/fraud_model.pkl + ml/data/test_split.parquet
./venv/Scripts/python -m src.evaluate   # evalúa held-out vs. 2 baselines, escribe ml/REPORT.md
```

## Metodología (resumen — detalle en el docstring de cada archivo)

- **Features** (`src/features.py`): point-in-time correctas (solo miran el
  pasado de cada cliente), `fraud_score`/`complaints` explícitamente
  excluidos como insumo (ver docstring — `fraud_score` se usa como
  baseline, `complaints` está descartada por integridad rota según el EDA
  real del equipo).
- **Split** (`src/split.py`): corte temporal (train = pasado, test =
  futuro), con el % de overlap de clientes reportado como métrica de
  transparencia, no oculto.
- **Modelo** (`src/train.py`): regresión logística con `class_weight=
  "balanced"` (el fraude es raro) — se escala a algo más complejo solo si
  no supera al baseline `fraud_score` con margen real.
- **Evaluación** (`src/evaluate.py`): precision/recall/F1/PR-AUC (nunca
  accuracy sola), contra 2 baselines (threshold sobre `fraud_score`
  existente, y clase mayoritaria), con análisis de falsos negativos
  (fraude no detectado — el fallo caro para un banco).

## Por qué Python y no TypeScript acá

Consistente con la herramienta que ya usó el equipo para su EDA (DuckDB +
pandas/scikit-learn) — mejor ecosistema para entrenamiento/evaluación
tabular que el monorepo Node. El resultado SÍ vuelve a TypeScript (paso de
integración pendiente arriba) para que el Lambda de producción no dependa
de un runtime Python.
