# Uso real del sistema -- generado de logs reales de CloudWatch

_Generado automáticamente por `services/admin-agent/scripts/generate-usage-report.ts`, reusando el mismo código que alimenta el dashboard de `/admin` (`list-conversations.ts`/`get-trace.ts`), corrido DIRECTO contra AWS real. NO editar a mano -- volver a correr el script para refrescar._

**Limitación honesta, declarada explícitamente**: esta es actividad de DESARROLLO/DEMO acumulada durante esta sesión de trabajo (curl/browser de verificación de cada fase, no tráfico de clientes reales). Los números de abajo describen qué tan activamente se probó el sistema, no un patrón de demanda de producción -- útil como evidencia de que el pipeline completo (Understand→Decide→Act→Verify→Escalate) corrió de punta a punta muchas veces reales, no como proyección de volumen real.

## Resumen

- **Conversaciones (casos) registradas**: 79
- **Turnos reales reconstruidos de los logs**: 98

## Demanda por intent (último intent de cada conversación)

| Intent | Conversaciones |
| --- | --- |
| eligibility_check | 26 |
| dispute_unrecognized_charge | 14 |
| escalation_request | 12 |
| faq | 10 |
| unknown | 9 |
| product_info | 8 |

## Resultado final por turno

| Status | Turnos |
| --- | --- |
| clarify | 41 |
| ok | 30 |
| escalate | 27 |

## Costo y latencia reales (Bedrock, todos los turnos con al menos una invocación)

- Tokens reales: 109829 entrada + 8448 salida. Costo estimado total: $0.4562, ~$0.004655 por turno (pricing publicado Claude Sonnet, familia usada en este proyecto -- aproximación documentada, no una tarifa medida en la factura real de la cuenta).
- Latencia total del pipeline por turno (suma de la duración real de cada paso de la Step Function): p50 = 2165ms, p95 = 10226ms.

## Limitaciones declaradas

- Volumen bajo y no representativo de producción real -- son las pruebas/demos acumuladas de esta sesión de desarrollo, no tráfico de clientes.
- `byIntent` refleja el ÚLTIMO intent de cada conversación (`ConversationStateItem.lastIntent`), no todos los intents que pasaron por esa conversación si hubo cambios de tema.
- El costo de Bedrock es SOLO el costo del modelo -- no incluye Lambda/DynamoDB/API Gateway/CloudWatch (marginal a este volumen, pero no cero en un escenario real de producción).
