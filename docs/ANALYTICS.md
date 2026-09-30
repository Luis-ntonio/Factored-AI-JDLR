# Data Analytics — demanda, costo-por-resolución e insights de la solución

> Este documento existe porque el criterio de evaluación del hackathon
> trata "Data Analytics" como su propio entregable (ver `hacka-info/`):
> fila **Data Analysis** en "No Single Skill Is Mandatory" ("Demand
> patterns, and cost-per-resolution ROI") y bloque **Data Analytics** en
> "Evaluation Criteria" ("Data Quality and Providing relevant insights
> from the solution"). El trabajo real detrás de esto YA existía —
> disperso entre el EDA de decisión de producto y los harnesses de
> evaluación de ML — pero nunca se lo presentó como su propia narrativa de
> negocio. Este documento conecta esas piezas; no mide nada nuevo.
>
> Complementa `docs/USAGE-ANALYTICS.md` (insights reales sobre la
> actividad efectiva de esta cuenta, generados de logs reales — ver ese
> documento para la "Opción B": análisis directo sobre datos operativos,
> no solo síntesis de lo ya medido).

## 1. Patrones de demanda (por qué este workflow, no otro)

El PDF del hackathon pedía elegir UN flujo bancario focalizado de 4
opciones (Account/Payment Inquiries, Card Support, Transaction Disputes,
Credit-Product Info & Eligibility). Esa elección no fue arbitraria — se
basó en un EDA real sobre el dataset completo del hackathon (19M filas),
documentado en `hacka-info/EDA_LATAM_Bank_resumen.md` y resumido en
`docs/EVALUATION-CRITERIA.md` §1:

- **FCR (First Contact Resolution) 43.6% en quejas vs. 91.5% en
  transaccional** — las quejas (que incluyen disputas) tardan casi el
  doble en resolverse en el primer contacto que una consulta
  transaccional simple. Esa brecha es la señal de demanda real que
  justifica priorizar un flujo de disputa: es donde el costo humano
  actual es más alto.
- **Disputas = 36% de las quejas** — dentro de "quejas", la categoría más
  grande y medible.
- **Hallazgo crítico de calidad de datos**: 0 de 44,570 registros de
  `complaints` tenían ownership verificable contra el cliente real que
  reclamaba. Esto no es un detalle técnico menor — es la razón de diseño
  completa de `transaction-agent`: nunca confiar en `complaints` como
  fuente de verdad, verificar SIEMPRE contra `transactions`/`products`
  reales (ver `services/transaction-agent/src/compute-dispute.ts`).

**Conclusión de negocio**: el foco en `dispute_unrecognized_charge` no es
una preferencia técnica — es la categoría con peor resolución actual, el
subconjunto más grande y medible de quejas, y la que tiene el riesgo de
integridad de datos más severo si se automatiza mal. Automatizar bien acá
tiene el mayor retorno esperado de las 4 opciones disponibles.

## 2. Costo-por-resolución (lo que sí se midió, y lo que falta para un ROI real)

Lo que existe hoy es costo/latencia REAL de Bedrock por invocación, medido
contra la cuenta real del proyecto (`docs/EVALUATION-DECIDE-STAGE.md`):

| Métrica | Valor real medido |
| --- | --- |
| Latencia Bedrock (guardrail de policy-agent) | p50 = 2392ms, p95 = 4900ms (n=17 invocaciones reales) |
| Tokens reales | 31,973 entrada + 2,420 salida |
| Costo estimado | $0.1322 total, ~$0.007778 por caso evaluado |
| Safe Automated Resolution rate (held-out, 17 casos) | 6/17 (35.3%) resueltos correctamente en AUTO |

Esto responde "¿cuánto cuesta que el modelo proponga una decisión?" — una
pieza real del costo marginal de automatizar. Lo que **todavía no se
puede calcular honestamente** es un ROI completo, porque faltan 2 datos
que este proyecto no tiene ni puede inventar:

1. **Costo real de un agente humano resolviendo el mismo caso** — sin un
   benchmark de negocio real (tiempo promedio + costo/hora de un agente
   de soporte), cualquier cifra de "ahorro" sería una suposición, no una
   medición. No se inventa un número acá.
2. **Volumen de producción real** — el 35.3% de Safe Automated Resolution
   y el costo de $0.0078/caso son sobre un set de evaluación CHICO (17
   casos curados), no sobre tráfico real. Multiplicar ese costo por un
   volumen mensual supuesto sería honesto solo si el volumen viniera de
   algún lado real — no existe ese dato en este proyecto.

**Lo que SÍ se puede decir con evidencia real**: el costo marginal de
Bedrock por turno (~$0.008) es bajo comparado con cualquier estimación
razonable de minutos de un agente humano — incluso sin un benchmark
exacto, el orden de magnitud (fracciones de centavo vs. minutos de tiempo
humano) sostiene la tesis de que automatizar el camino AUTO es rentable
en principio. Formalizar esa comparación con números reales de negocio
queda fuera del alcance de este proyecto.

## 3. Calidad del "learned component" (Recall del matcher de disputas ambiguas)

Métrica de calidad real, no de costo — pero forma parte de la misma
historia de ROI: un matcher que resuelve bien una disputa ambigua SIN
intervención humana es automatización real, medida y evaluada
(`docs/EVALUATION-DISPUTE-MATCHER.md`, dataset sintético de 68 casos
held-out):

| Métrica | Baseline (reglas) | Modelo (embeddings Bedrock) |
| --- | --- | --- |
| Recall@1 | 66.2% | 92.6% |
| Recall@3 | 100.0% | 100.0% |
| MRR | 0.811 | 0.956 |

El modelo resuelve correctamente 92.6% de las disputas ambiguas en su
primer intento (vs. 66.2% del baseline determinístico) — cada punto de
esa diferencia es un caso que antes escalaba siempre a un humano
(`escalate-dispute-transaction-not-found`) y ahora se resuelve solo o se
le pregunta al cliente (`clarify-dispute-ambiguous-candidates`, ver
`docs/STATUS.md`, fase del CLARIFY post-Act).

## 4. Insights reales de la solución desplegada

Ver `docs/USAGE-ANALYTICS.md` — generado directamente de logs reales de
CloudWatch de esta cuenta (mismo lector que alimenta el dashboard de
`/admin`, `services/admin-agent/scripts/generate-usage-report.ts`), no de
datasets sintéticos ni de evaluación. Cubre demanda real por intent,
resultado final por turno (AUTO/CLARIFY/ESCALATE), y costo/latencia real
agregados sobre TODA la actividad de esta cuenta.

## Qué no sabemos todavía (honestidad explícita)

- **Costo de un agente humano real** para comparar — no existe ese dato,
  no se inventa.
- **Volumen de producción real** — todo lo medido es sobre datasets de
  evaluación (sintéticos o curados a mano) o actividad de desarrollo/demo
  (ver limitación declarada en `docs/USAGE-ANALYTICS.md`), nunca tráfico
  de clientes reales.
- **Costo total de infraestructura** (Lambda + DynamoDB + API Gateway +
  CloudWatch) — marginal al volumen actual, pero no se midió ni se
  proyectó a un volumen real.
- Estos 3 puntos son los que convertirían esta sección en un ROI de
  negocio completo y defendible — hoy es evidencia real pero parcial,
  presentada como tal.
