# Evaluación — matcher de transacciones disputadas (baseline vs. modelo con embeddings)

_Generado automáticamente por `services/transaction-agent/scripts/evaluate-transaction-matcher.ts` sobre `scripts/eval-fixtures/matcher-cases.json` (dataset sintético, seed determinístico vía `generate-matcher-fixtures.ts`). NO editar a mano — volver a correr el script tras cualquier cambio en `src/matching/`._

## Metodología

- **Baseline**: `baselineScore` — formaliza el filtro que `static-transaction-repository.ts` ya aplicaba (comercio substring + monto ±1%, señal de fecha NO discriminante) como un score sumable.
- **Modelo**: `modelScore` — similitud coseno de embeddings de Bedrock (comercio) + proximidad continua de monto + ventana de fecha REALMENTE resuelta (`resolve-relative-date.ts`).
- **Dataset**: 40 casos sintéticos held-out de 48 totales (excluyendo 8 marcados `designSet: true`, usados para fijar `DEFAULT_TAU=0.6`/`DEFAULT_MARGIN_TAU=0.15` por inspección). Split por cliente por construcción: cada cliente sintético (`SYN-CUST-*`) aporta exactamente 2 casos, ninguno compartido entre grupos.
- **Embeddings NO estuvieron disponibles durante esta corrida** — el arm 'modelo' se evaluó SOLO con señales de monto/fecha (sin el término de comercio); correr con `AWS_PROFILE=banking-agent-dev` y `EMBEDDING_MODEL_ID_PARAM_NAME`/`EMBEDDING_REGION` seteadas para un reporte con embeddings reales.
- **Dos niveles de métrica**: 
  - _De ranking_ (Recall@1/Recall@3/MRR): ¿el ranker ordena bien? Ignora el umbral de confianza `tau`/`marginTau`.
  - _De decisión_ (lo que el sistema real haría vía `rankAndDecide`): entre los casos marcados "confiado", ¿qué fracción resolvió a la transacción correcta (precisión)? ¿En qué fracción del total el sistema está dispuesto a actuar sin escalar (cobertura)?

## Resultados agregados — ranking

| Métrica | Baseline | Modelo |
| --- | --- | --- |
| Recall@1 | 72.5% | 90.0% |
| Recall@3 | 100.0% | 100.0% |
| MRR | 0.842 | 0.942 |

## Resultados agregados — decisión (`rankAndDecide`, τ=0.6, marginTau=0.15)

| Métrica | Baseline | Modelo |
| --- | --- | --- |
| Cobertura (% casos marcados "confiado") | 50.0% (20/40) | 85.0% (34/40) |
| Precisión cuando confiado | 100.0% (20/20) | 100.0% (34/34) |
| Confiado pero incorrecto (falso positivo) | 0/40 | 0/40 |

_Nota: un falso positivo ("confiado pero incorrecto") es el peor caso real -- el sistema resolvería una disputa hacia la transacción equivocada sin pedir aclaración. Revisar esta fila antes de considerar bajar `marginTau`._

## Desglose: por idioma

| Grupo | Casos | Recall@1 baseline | Recall@1 modelo | Precisión-si-confiado baseline | Precisión-si-confiado modelo |
| --- | --- | --- | --- | --- | --- |
| pt | 10 | 50.0% | 90.0% | 100.0% | 100.0% |
| es | 30 | 80.0% | 90.0% | 100.0% | 100.0% |

## Desglose: por nivel de ambigüedad

| Grupo | Casos | Recall@1 baseline | Recall@1 modelo | Precisión-si-confiado baseline | Precisión-si-confiado modelo |
| --- | --- | --- | --- | --- | --- |
| 2-candidates | 20 | 85.0% | 100.0% | 100.0% | 100.0% |
| 3-plus-candidates | 20 | 60.0% | 80.0% | 100.0% | 100.0% |

## Desglose: por estilo de consulta (comercio exacto vs. frase genérica de rubro)

| Grupo | Casos | Recall@1 baseline | Recall@1 modelo | Precisión-si-confiado baseline | Precisión-si-confiado modelo |
| --- | --- | --- | --- | --- | --- |
| exact-merchant | 20 | 100.0% | 90.0% | 100.0% | 100.0% |
| generic-category | 20 | 45.0% | 90.0% | n/a | 100.0% |

## Desglose: por presencia de frase de fecha

| Grupo | Casos | Recall@1 baseline | Recall@1 modelo | Precisión-si-confiado baseline | Precisión-si-confiado modelo |
| --- | --- | --- | --- | --- | --- |
| con frase de fecha | 34 | 73.5% | 100.0% | 100.0% | 100.0% |
| sin frase de fecha | 6 | 66.7% | 33.3% | 100.0% | n/a |

## Limitaciones declaradas

- Dataset sintético (generado programáticamente, no transacciones/disputas reales de clientes) -- mide si el matcher hace lo que su diseño promete, no si ese diseño captura toda la variedad real de cómo la gente describe una disputa.
- Por construcción, `queryStyle: "generic-category"` sin frase de fecha (`hasDatePhrase: false`) es un caso donde NINGUNA señal discrimina entre candidatas para ninguno de los dos arms -- una precisión baja ahí es la limitación real y esperada del diseño actual, no un bug.
- `DEFAULT_TAU`/`DEFAULT_MARGIN_TAU` se fijaron por inspección de los 8 casos `designSet: true`, no por una búsqueda de grilla sobre el set completo -- reevaluar si este reporte sugiere otro valor.
- No hay repetición de corridas -- embeddings de Bedrock son determinísticos para el mismo input, así que esto es menos crítico que en el harness de policy-agent (que sí depende de un LLM generativo), pero sigue siendo una sola corrida.
