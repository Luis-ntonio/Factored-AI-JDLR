# ml/ — Clasificador de fraude entrenado (evidencia de "learned component")

Pipeline offline (Python, fuera de los workspaces npm) que entrena y evalúa
un clasificador de fraude sobre el dataset real del hackathon
(`transactions`/`customers`/`products`/`daily_exchange_rates`), para
cumplir el requisito del PDF del hackathon de "evaluate at least one
learned component against an appropriate baseline" — ver `docs/PLAN.md`,
sección "Fase Dispute B", para el razonamiento completo (por qué este es
el único challenge donde entrenar un modelo está justificado, por qué NO
se entrena nada para eligibility/intent).

## Estado actual (2026-09-28) — completo, con un resultado negativo honesto

- ✅ Dataset real descargado (bucket S3 del hackathon): `transactions`
  (4,425,008 filas, 4,316 fraude real, 0.098%), `customers` (150,000),
  `products` (400,000), `daily_exchange_rates` (13,164).
- ✅ Pipeline completo corrido de punta a punta contra datos reales:
  features point-in-time (sin leakage), split temporal, entrenamiento,
  evaluación con 2 baselines. `ml/REPORT.md` (versionado) tiene el reporte
  completo.
- ⚠️ **Resultado real: el modelo entrenado NO supera al baseline.** Se
  probaron 2 familias de modelo (regresión logística, después gradient
  boosting) — ambas con PR-AUC prácticamente igual al base rate (~0.001),
  incluso IN-SAMPLE (sobre datos que el modelo vio al entrenar, ver
  diagnóstico en `REPORT.md`) — evidencia de que no es un bug de pipeline
  ni de generalización, sino que las features de transacción/cliente/
  producto disponibles no predicen `is_fraud` mejor que el azar en este
  dataset. El baseline (threshold sobre la columna `fraud_score` ya
  provista en el dataset) sí funciona bien: Precision 1.0, Recall 0.57,
  F1 0.72.
- ⛔ **Integración en vivo NO se hizo** (decisión del usuario, 2026-09-28):
  dado que el modelo entrenado no tiene poder predictivo real, wirearlo en
  `compute-dispute.ts` empeoraría el sistema en vez de mejorarlo.
  `fraudSuspected` en `compute-dispute.ts` sigue leyendo `is_fraud`
  directamente, sin cambios. El resultado queda documentado como evidencia
  de rigor ("Include failures in the results", PDF del hackathon, pág. 4)
  en vez de forzarse a producción.

## Qué se aprendió (para retomar esto después, si el equipo decide seguir)

- El baseline `fraud_score` es fuerte y probablemente la señal real usada
  para generar `is_fraud` en este dataset sintético (o algo muy
  correlacionado) — cualquier intento futuro debería asumir que superarlo
  con features "honestas" (sin leakage) es un desafío real, no trivial.
  Ver el diagnóstico in-sample en `REPORT.md` antes de reintentar con otro
  modelo — confirma que el problema no es de tuning/threshold.
- Si el equipo quiere retomar esto: candidatos no probados todavía son (a)
  features de texto/embeddings si aparece señal en otra tabla no
  explorada, (b) un modelo que sí use `fraud_score` como feature pero
  reportando explícitamente que eso es casi tautológico, o (c) aceptar el
  resultado negativo y usar directamente el threshold sobre `fraud_score`
  como "el modelo" (más simple, auditable, y ya gana).

## Cómo reproducir

```
cd ml
python -m venv venv
./venv/Scripts/pip install -r requirements.txt   # Windows; en mac/linux: venv/bin/pip
cp .env.example .env    # completar con credenciales reales del hackathon, nunca commitear

# Descarga (ver scripts/download_tables.py para el flujo de 2 pasos list -> glob por tabla)
./venv/Scripts/python scripts/download_tables.py --table transactions --glob "data/transactions/**"
./venv/Scripts/python scripts/download_tables.py --table customers --glob "data/customers.csv"
./venv/Scripts/python scripts/download_tables.py --table products --glob "data/products.csv"
./venv/Scripts/python scripts/download_tables.py --table daily_exchange_rates --glob "data/daily_exchange_rates.csv"

./venv/Scripts/python -m src.train      # entrena, guarda ml/models/fraud_model.pkl + ml/data/test_split.parquet + ml/data/train_diagnostic.json
./venv/Scripts/python -m src.evaluate   # evalúa held-out vs. 2 baselines, escribe ml/REPORT.md
```

## Metodología (resumen — detalle en el docstring de cada archivo)

- **Features** (`src/features.py`): point-in-time correctas (agregados de
  cliente calculados SOLO con transacciones estrictamente anteriores),
  joins con `customers`/`products` limitados a atributos estáticos
  (fecha de nacimiento, fecha de alta/apertura, tipo de producto, límite
  de crédito -- nunca `current_balance`/`credit_score`/`segment`, que
  pueden reflejar comportamiento posterior a la transacción evaluada),
  normalización de moneda vía `daily_exchange_rates`. `fraud_score`/
  `complaints` explícitamente excluidos como insumo del modelo (`fraud_score`
  se usa solo como baseline; `complaints` está descartada por integridad
  referencial rota según el EDA real del equipo).
- **Split** (`src/split.py`): corte temporal (train = pasado, test =
  futuro), con el % de overlap de clientes reportado como métrica de
  transparencia, no oculto.
- **Modelo** (`src/train.py`): regresión logística primero (falló, ver
  `docs/STATUS.md`), después `HistGradientBoostingClassifier` (mismo
  resultado real) — con threshold de decisión elegido por F1 sobre una
  validación interna de train, nunca sobre el held-out final.
- **Evaluación** (`src/evaluate.py`): precision/recall/F1/PR-AUC (nunca
  accuracy sola), contra 2 baselines (threshold sobre `fraud_score`
  existente, y clase mayoritaria), con análisis de falsos negativos y un
  diagnóstico in-sample que distingue "sin señal real" de "bug de
  pipeline".

## Por qué Python y no TypeScript acá

Consistente con la herramienta que ya usó el equipo para su EDA (DuckDB +
pandas/scikit-learn) — mejor ecosistema para entrenamiento/evaluación
tabular que el monorepo Node. Como el modelo no llegó a producción, esto
quedó siendo puramente un artefacto de evaluación offline (`REPORT.md`),
no algo que necesite exportarse a TypeScript/ONNX por ahora.
