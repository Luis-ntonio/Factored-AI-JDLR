# Evaluación — matcher de transacciones disputadas (baseline vs. modelo con embeddings)

_Generado automáticamente por `services/transaction-agent/scripts/evaluate-transaction-matcher.ts` sobre `scripts/eval-fixtures/matcher-cases.json` (dataset sintético, seed determinístico vía `generate-matcher-fixtures.ts`). NO editar a mano — volver a correr el script tras cualquier cambio en `src/matching/`._

## Metodología

- **Baseline**: `baselineScore` — formaliza el filtro que `static-transaction-repository.ts` ya aplicaba (comercio substring + monto ±1%, señal de fecha NO discriminante) como un score sumable.
- **Modelo**: `modelScore` — similitud coseno de embeddings de Bedrock (comercio) + proximidad continua de monto + ventana de fecha REALMENTE resuelta (`resolve-relative-date.ts`).
- **Dataset**: 68 casos sintéticos held-out de 80 totales (excluyendo 12 marcados `designSet: true`, usados para fijar `DEFAULT_TAU=0.6`/`DEFAULT_MARGIN_TAU=0.15` por inspección). Split por cliente por construcción: cada cliente sintético (`SYN-CUST-*`) aporta exactamente 2 casos, ninguno compartido entre grupos.
- **Embeddings SÍ estuvieron disponibles durante esta corrida**.
- **Dos niveles de métrica**: 
  - _De ranking_ (Recall@1/Recall@3/MRR): ¿el ranker ordena bien? Ignora el umbral de confianza `tau`/`marginTau`.
  - _De decisión_ (lo que el sistema real haría vía `rankAndDecide`): entre los casos marcados "confiado", ¿qué fracción resolvió a la transacción correcta (precisión)? ¿En qué fracción del total el sistema está dispuesto a actuar sin escalar (cobertura)?

## Resultados agregados — ranking

| Métrica | Baseline | Modelo |
| --- | --- | --- |
| Recall@1 | 66.2% | 92.6% |
| Recall@3 | 100.0% | 100.0% |
| MRR | 0.811 | 0.956 |

## Resultados agregados — decisión (`rankAndDecide`, τ=0.6, marginTau=0.15)

| Métrica | Baseline | Modelo |
| --- | --- | --- |
| Cobertura (% casos marcados "confiado") | 50.0% (34/68) | 57.4% (39/68) |
| Precisión cuando confiado | 100.0% (34/34) | 100.0% (39/39) |
| Confiado pero incorrecto (falso positivo) | 0/68 | 0/68 |

_Nota: un falso positivo ("confiado pero incorrecto") es el peor caso real -- el sistema resolvería una disputa hacia la transacción equivocada sin pedir aclaración. Revisar esta fila antes de considerar bajar `marginTau`._

## Desglose: por idioma

| Grupo | Casos | Recall@1 baseline | Recall@1 modelo | Precisión-si-confiado baseline | Precisión-si-confiado modelo |
| --- | --- | --- | --- | --- | --- |
| es | 52 | 67.3% | 96.2% | 100.0% | 100.0% |
| pt | 16 | 62.5% | 81.3% | 100.0% | 100.0% |

## Desglose: por nivel de ambigüedad

| Grupo | Casos | Recall@1 baseline | Recall@1 modelo | Precisión-si-confiado baseline | Precisión-si-confiado modelo |
| --- | --- | --- | --- | --- | --- |
| 2-candidates | 34 | 67.6% | 100.0% | 100.0% | 100.0% |
| 3-plus-candidates | 34 | 64.7% | 85.3% | 100.0% | 100.0% |

## Desglose: por estilo de consulta (comercio exacto vs. frase genérica de rubro)

| Grupo | Casos | Recall@1 baseline | Recall@1 modelo | Precisión-si-confiado baseline | Precisión-si-confiado modelo |
| --- | --- | --- | --- | --- | --- |
| exact-merchant | 34 | 100.0% | 100.0% | 100.0% | 100.0% |
| generic-category | 34 | 32.4% | 85.3% | n/a | 100.0% |

## Desglose: por presencia de frase de fecha

| Grupo | Casos | Recall@1 baseline | Recall@1 modelo | Precisión-si-confiado baseline | Precisión-si-confiado modelo |
| --- | --- | --- | --- | --- | --- |
| con frase de fecha | 56 | 67.9% | 100.0% | 100.0% | 100.0% |
| sin frase de fecha | 12 | 58.3% | 58.3% | 100.0% | 100.0% |

## Desglose: cruce estilo de consulta × presencia de frase de fecha (celda real de punto ciego)

| Grupo | Casos | Recall@1 baseline | Recall@1 modelo | Precisión-si-confiado baseline | Precisión-si-confiado modelo |
| --- | --- | --- | --- | --- | --- |
| exact-merchant / con fecha | 28 | 100.0% | 100.0% | 100.0% | 100.0% |
| generic-category / sin fecha | 6 | 16.7% | 16.7% | n/a | n/a |
| generic-category / con fecha | 28 | 35.7% | 100.0% | n/a | 100.0% |
| exact-merchant / sin fecha | 6 | 100.0% | 100.0% | 100.0% | 100.0% |

## Determinismo de embeddings

Verificado en esta corrida: 2 invocaciones reales de `getEmbedding('Netflix')` contra Bedrock devolvieron vectores idénticos -- confirma (no solo asume) que no hace falta repetir corridas del arm modelo por variabilidad de embeddings.

## Limitaciones declaradas

- Dataset sintético (generado programáticamente, no transacciones/disputas reales de clientes) -- mide si el matcher hace lo que su diseño promete, no si ese diseño captura toda la variedad real de cómo la gente describe una disputa.
- Por construcción, `queryStyle: "generic-category"` sin frase de fecha (`hasDatePhrase: false`) es un caso donde NINGUNA señal discrimina entre candidatas para ninguno de los dos arms -- confirmado en la tabla de cruce arriba (Recall@1 ~nivel de azar para ambos arms en esa celda puntual), limitación real y esperada del diseño actual, no un bug. Cerrarla de verdad requeriría una señal nueva de categoría/rubro (`Transaction.merchant_category`, no usada hoy por el matcher) o, más robusto, preguntarle al cliente cuál candidata es la correcta en vez de escalar directo (ver plan de CLARIFY post-Act, fuera del scope de este harness).
- `DEFAULT_TAU`/`DEFAULT_MARGIN_TAU` se fijaron por inspección de los 12 casos `designSet: true`, no por una búsqueda de grilla sobre el set completo -- reevaluar si este reporte sugiere otro valor.
- No hay repetición de corridas -- embeddings de Bedrock son determinísticos para el mismo input, así que esto es menos crítico que en el harness de policy-agent (que sí depende de un LLM generativo), pero sigue siendo una sola corrida.
