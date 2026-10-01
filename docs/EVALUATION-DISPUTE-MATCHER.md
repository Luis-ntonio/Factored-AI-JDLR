# Evaluación — matcher de transacciones disputadas (baseline vs. modelo con embeddings)

_Generado automáticamente por `services/transaction-agent/scripts/evaluate-transaction-matcher.ts` sobre `scripts/eval-fixtures/matcher-cases.json` (dataset sintético, seed determinístico vía `generate-matcher-fixtures.ts`). NO editar a mano — volver a correr el script tras cualquier cambio en `src/matching/`._

## Metodología

- **Baseline**: `baselineScore` — formaliza el filtro que `static-transaction-repository.ts` ya aplicaba (comercio substring + monto ±1%, señal de fecha NO discriminante) como un score sumable.
- **Modelo**: `modelScore` — similitud coseno de embeddings de Bedrock (comercio) + proximidad continua de monto + ventana de fecha REALMENTE resuelta (`resolve-relative-date.ts`).
- **Dataset**: 102 casos sintéticos held-out de 120 totales (excluyendo 18 marcados `designSet: true`, usados para fijar `DEFAULT_TAU=0.6`/`DEFAULT_MARGIN_TAU=0.15` por inspección). Split por cliente por construcción: cada cliente sintético (`SYN-CUST-*`) aporta exactamente 2 casos, ninguno compartido entre grupos.
- **Embeddings SÍ estuvieron disponibles durante esta corrida**.
- **Dos niveles de métrica**: 
  - _De ranking_ (Recall@1/Recall@3/MRR): ¿el ranker ordena bien? Ignora el umbral de confianza `tau`/`marginTau`.
  - _De decisión_ (lo que el sistema real haría vía `rankAndDecide`): entre los casos marcados "confiado", ¿qué fracción resolvió a la transacción correcta (precisión)? ¿En qué fracción del total el sistema está dispuesto a actuar sin escalar (cobertura)?

## Resultados agregados — ranking

| Métrica | Baseline | Modelo |
| --- | --- | --- |
| Recall@1 | 66.7% | 95.1% |
| Recall@3 | 100.0% | 100.0% |
| MRR | 0.828 | 0.972 |

## Resultados agregados — decisión (`rankAndDecide`, τ=0.6, marginTau=0.15)

| Métrica | Baseline | Modelo |
| --- | --- | --- |
| Cobertura (% casos marcados "confiado") | 33.3% (34/102) | 33.3% (34/102) |
| Precisión cuando confiado | 100.0% (34/34) | 100.0% (34/34) |
| Confiado pero incorrecto (falso positivo) | 0/102 | 0/102 |

_Nota: un falso positivo ("confiado pero incorrecto") es el peor caso real -- el sistema resolvería una disputa hacia la transacción equivocada sin pedir aclaración. Revisar esta fila antes de considerar bajar `marginTau`._

## Desglose: por idioma

| Grupo | Casos | Recall@1 baseline | Recall@1 modelo | Precisión-si-confiado baseline | Precisión-si-confiado modelo |
| --- | --- | --- | --- | --- | --- |
| es | 78 | 62.8% | 96.2% | 100.0% | 100.0% |
| pt | 24 | 79.2% | 91.7% | 100.0% | 100.0% |

## Desglose: por nivel de ambigüedad

| Grupo | Casos | Recall@1 baseline | Recall@1 modelo | Precisión-si-confiado baseline | Precisión-si-confiado modelo |
| --- | --- | --- | --- | --- | --- |
| 2-candidates | 68 | 63.2% | 98.5% | 100.0% | 100.0% |
| 3-plus-candidates | 34 | 73.5% | 88.2% | 100.0% | 100.0% |

## Desglose: por estilo de consulta (comercio exacto vs. frase genérica de rubro)

| Grupo | Casos | Recall@1 baseline | Recall@1 modelo | Precisión-si-confiado baseline | Precisión-si-confiado modelo |
| --- | --- | --- | --- | --- | --- |
| exact-merchant | 34 | 100.0% | 100.0% | 100.0% | 100.0% |
| generic-category | 68 | 50.0% | 92.6% | n/a | n/a |

## Desglose: por presencia de frase de fecha

| Grupo | Casos | Recall@1 baseline | Recall@1 modelo | Precisión-si-confiado baseline | Precisión-si-confiado modelo |
| --- | --- | --- | --- | --- | --- |
| con frase de fecha | 56 | 71.4% | 100.0% | 100.0% | 100.0% |
| sin frase de fecha | 46 | 60.9% | 89.1% | 100.0% | 100.0% |

## Desglose: cruce estilo de consulta × presencia de frase de fecha (celda real de punto ciego)

| Grupo | Casos | Recall@1 baseline | Recall@1 modelo | Precisión-si-confiado baseline | Precisión-si-confiado modelo |
| --- | --- | --- | --- | --- | --- |
| exact-merchant / con fecha | 28 | 100.0% | 100.0% | 100.0% | 100.0% |
| generic-category / sin fecha | 40 | 55.0% | 87.5% | n/a | n/a |
| generic-category / con fecha | 28 | 42.9% | 100.0% | n/a | n/a |
| exact-merchant / sin fecha | 6 | 100.0% | 100.0% | 100.0% | 100.0% |

## Desglose: cross-category vs. same-category (aporte real de merchant_category en modelScore)

| Grupo | Casos | Recall@1 baseline | Recall@1 modelo | Precisión-si-confiado baseline | Precisión-si-confiado modelo |
| --- | --- | --- | --- | --- | --- |
| same-category (candidatas del mismo rubro) | 68 | 73.5% | 94.1% | 100.0% | 100.0% |
| cross-category (candidatas de rubro distinto) | 34 | 52.9% | 97.1% | n/a | n/a |

## Determinismo de embeddings

Verificado en esta corrida: 2 invocaciones reales de `getEmbedding('Netflix')` contra Bedrock devolvieron vectores idénticos -- confirma (no solo asume) que no hace falta repetir corridas del arm modelo por variabilidad de embeddings.

## Limitaciones declaradas

- Dataset sintético (generado programáticamente, no transacciones/disputas reales de clientes) -- mide si el matcher hace lo que su diseño promete, no si ese diseño captura toda la variedad real de cómo la gente describe una disputa.
- Por construcción, `queryStyle: "generic-category"` sin frase de fecha (`hasDatePhrase: false`), dentro de los casos "same-category" (candidatas del MISMO `merchant_category`, casos A/B del generador), sigue siendo un caso donde NINGUNA señal discrimina entre candidatas para ninguno de los dos arms -- confirmado en la tabla de cruce arriba (Recall@1 ~nivel de azar para ambos arms en esa celda puntual). Esto es una limitación real y esperada del DATASET (las candidatas comparten rubro a propósito), no del matcher: agregar `merchant_category` como señal (ver tabla cross-category vs. same-category) no puede ayudar ahí porque todas las candidatas tienen la MISMA categoría -- no hay nada que la señal pueda rechazar. Donde la señal nueva SÍ aporta es en el caso "cross-category" (`crossCategory: true`, "Caso C" del generador): candidatas de rubro DISTINTO, mismo monto aproximado, sin fecha -- ver esa fila de la tabla para el aporte real medido.
- `DEFAULT_TAU`/`DEFAULT_MARGIN_TAU` se fijaron por inspección de los 18 casos `designSet: true`, no por una búsqueda de grilla sobre el set completo -- reevaluar si este reporte sugiere otro valor.
- No hay repetición de corridas -- embeddings de Bedrock son determinísticos para el mismo input, así que esto es menos crítico que en el harness de policy-agent (que sí depende de un LLM generativo), pero sigue siendo una sola corrida.
