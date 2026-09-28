# Evaluación Decide stage — baseline (solo reglas) vs. sistema propuesto (reglas + Bedrock)

_Generado automáticamente por `services/policy-agent/scripts/evaluate-decide-stage.ts`. NO editar a mano — volver a correr el script tras cualquier cambio en `policies.yaml` o en los prompts de `bedrock/model-decider.ts`._

## Metodología

- **Baseline**: `evaluatePreAction`/`evaluatePostAction` solos (reglas determinísticas de `policies.yaml`, sin Bedrock) — es lo que corre en producción si Bedrock no está disponible.
- **Sistema propuesto**: baseline + guardrail de Bedrock (`applyModelGuardrail`, "más conservador gana") — es lo que corre en producción hoy.
- **Held-out set**: 17 casos (`services/policy-agent/scripts/eval-fixtures/decide-stage-cases.json`). Labels derivados de la especificación de negocio de `policies.yaml` (umbrales/zonas reales), no inventados a mano sin criterio.
- **Bedrock SÍ estuvo disponible durante esta corrida**.

## Resultados agregados

| Métrica | Baseline (solo reglas) | Sistema propuesto (reglas + Bedrock) |
| --- | --- | --- |
| Safe Automated Resolution rate | 6/17 correctos en AUTO (35.3%), intentado en 6/17 | 6/17 correctos en AUTO (35.3%), intentado en 6/17 |
| Unsafe outcomes (AUTO cuando no debía) | 0/17 | 0/17 |
| Escalaciones perdidas (debía ESCALATE, no lo hizo) | 0/17 | 0/17 |
| Escalaciones innecesarias (ESCALATE de más) | 0/17 | 0/17 |
| Decisión correcta (total) | 17/17 | 17/17 |

_Nota: 0 unsafe outcomes observados en este set chico NO establece riesgo cero — ver "Limitaciones" abajo._

## Costo y latencia (solo aplica al arm propuesto, que es el que invoca Bedrock)

- Latencia Bedrock: p50 = 2392ms, p95 = 4900ms (n=17 invocaciones reales).
- Tokens reales reportados por Bedrock: 31973 entrada + 2420 salida. Costo estimado: $0.1322 total, ~$0.007778 por caso evaluado (pricing publicado Claude Sonnet 4.5 en Bedrock: $3/M tokens entrada, $15/M tokens salida — aproximación documentada, no una tarifa medida en la cuenta real).

## Desglose por idioma

| Idioma | Casos | Baseline correcto | Propuesto correcto |
| --- | --- | --- | --- |
| es | 15 | 15/15 | 15/15 |
| pt | 2 | 2/2 | 2/2 |

_Limitación de muestra: 2 caso(s) en portugués — insuficiente para conclusiones estadísticas robustas por idioma, señalado explícitamente en vez de ocultado._

## Casos donde el modelo cambió la decisión final respecto al baseline (0)

_Ninguno en este set — el modelo nunca fue estrictamente más conservador que las reglas en estos casos._

## Limitaciones declaradas

- Muestra chica (17 casos) — 0 unsafe outcomes observados no implica 0 riesgo real.
- Los labels "esperados" fueron derivados directamente de los umbrales/zonas de `policies.yaml` (no de un juicio humano independiente) — miden si el sistema es *consistente con su propia especificación*, no si esa especificación es correcta en sí misma.
- No hay repetición de corridas (`repeated-run variability`) — Bedrock puede variar entre invocaciones con el mismo input; este reporte es una sola corrida, no un promedio de N corridas.
- Costo estimado con pricing publicado de la familia Sonnet, no confirmado contra la factura real de la cuenta AWS del proyecto.
