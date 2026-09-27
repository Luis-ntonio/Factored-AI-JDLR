# transaction-agent

Parte **transaccional** de la capa "Act" del pipeline (credit-product info &
eligibility): cálculo determinístico de elegibilidad crediticia para el
intent `eligibility_check`, invocado únicamente después de que `policy-agent`
autorizó `decision === "AUTO"` en `stage: pre_action` (`policies.yaml`, regla
`auto-eligibility-complete`, sin que ninguna regla ESCALATE/CLARIFY de
excepción haya ganado). **Nunca reporta éxito directamente al usuario** — el
resultado pasa obligatoriamente por `policy-agent` (`stage: post_action`) y
luego por `verification-agent` (fase posterior, no implementado acá).

Runtime: Node.js 20.x + TypeScript (CommonJS), mismo criterio que
`conversation-agent`/`policy-agent`/`retrieval-agent`.

Corre como Lambda real sobre la infra que provisiona devops (ver
`E2E-documentacion-tecnica/E2E-Implementacion-AWS-Terraform-Databricks.md`,
secciones 4.2 y 4.5) — no es un mock desechable. Lo que sigue siendo
simulado es el **backend bancario**: los datos de crédito/cliente viven en
la tabla real `banking-agent-dev-case-store` poblada con datos sintéticos
(no hay banco real detrás), y la regla de elegibilidad es una fórmula
determinística (ingreso, proxy de deuda/ingreso, historial laboral, monto
solicitado), **no** un modelo de ML entrenado.

## Estructura

```
src/
  scoring/
    compute-score.ts     # computeEligibilityScore(entities) -- función pura
    score-zone.ts         # deriveScoreZone(score, thresholds)
  config/
    load-thresholds.ts    # lee config.borderline_score_min/_max de policies.yaml
  store/
    types.ts                        # interfaz EligibilityStore + result types
    eligibility-store.ts            # DynamoDbEligibilityStore (real, probado con mock)
    in-memory-eligibility-store.ts  # test double, NUNCA usado en producción
    index.ts
  compute-eligibility.ts  # orquestación pura: idempotencia + scoring + persistencia
  index.ts                 # handler de Lambda (no conectado a API Gateway)
test/                       # vitest — scoring, config, store, integración real con policy-agent
```

## Resolución de las 3 preguntas abiertas de `policies.yaml`

`policies.yaml` deja explícitas 3 preguntas abiertas justo antes de
`post_action_rules` (`post_action_contract_status: PROPOSAL_NOT_CONFIRMED`).
Este servicio las resuelve así (ver también
`packages/shared/src/contracts/eligibility-result.ts` para el detalle
completo en código):

1. **Escala de `eligibility_score`:** **0-100, confirmado**. Es la escala ya
   asumida por policy-agent (`config.borderline_score_min`/`_max` ya están en
   esa escala) — se mantiene sin ambigüedad.
2. **Quién calcula `score_zone`:** **transaction-agent la calcula**, no
   policy-agent. Para que el umbral no quede duplicado en dos lugares,
   transaction-agent lee `config.borderline_score_min`/`config.borderline_score_max`
   **directamente de `policies.yaml`** en tiempo de ejecución (`js-yaml`,
   mismo mecanismo que `services/policy-agent/src/evaluator.ts`, ver
   `src/config/load-thresholds.ts`). Regla: `score < min` → `"declined"`;
   `score > max` → `"approved"`; `[min, max]` inclusive → `"borderline"`. Con
   esta implementación, las dos señales que `escalate-score-borderline`
   combina con `OR` (score_zone explícito y el score numérico contra el
   umbral) **siempre coinciden**, porque nacen de la misma fuente.
3. **Correlación por `caseId` si el cálculo fuera async:** el cálculo es
   **síncrono** en este checkpoint (no hay Step Functions/cola de turnos
   todavía, ver `docs/PLAN.md`, "Pendiente de decidir" — esa decisión de
   arquitectura sigue abierta). El resultado se persiste en la MISMA tabla
   `banking-agent-dev-case-store`, MISMA partición `pk = CASE#<caseId>` que ya
   usa conversation-agent (`sk = RESULT#eligibility#<turnId>`) — cualquier
   consumidor futuro puede reconstruir el caso completo con un `Query` sobre
   `pk = CASE#<caseId>`, sin mecanismo de correlación aparte. Si el cálculo
   se vuelve async en el futuro, `caseId`+`turnId` sigue siendo la clave de
   correlación válida.

## Fórmula de scoring (determinística, auditable sin ejecutar código)

Ver `src/scoring/compute-score.ts` para el JSDoc completo. Resumen:

- **Base:** 50 puntos.
- **`employment_status`:** `employed` +20, `self_employed` +10, `retired`
  +10, `student` -10, `unemployed` -100 (defensivo — en el pipeline real la
  regla `escalate-eligibility-unemployed` de `policies.yaml` ya saca este
  caso del camino AUTO antes de llegar acá, pero transaction-agent nunca
  asume que un valor "imposible" no puede llegar), `null`/`"unknown"` → 0
  (decisión propia, ver limitaciones).
- **Ratio `requested_amount / income`** (proxy de deuda/ingreso, ver
  limitación abajo): `income <= 0` o cualquiera de los dos campos `null` →
  mismo tramo que ratio `> 6` (-30, tratado como el caso de mayor riesgo, sin
  dividir nunca por cero); `ratio <= 2` → +20; `ratio <= 4` → +10;
  `ratio <= 6` → 0; `ratio > 6` → -30.
- **`existing_customer === true`** → +10; `false`/`null` → 0.
- **`requested_amount > 30000`** → -10; si no, 0 (rango que `policies.yaml`
  todavía deja pasar a AUTO, ya que `> 50000` escala en `pre_action` antes de
  llegar acá).
- **Clamp final:** `[0, 100]`.

## Idempotencia (pilar Reliability, requisito no negociable de este checkpoint)

`idempotencyKey = "${caseId}:${turnId}"` (mismo `turnId` que
`UnderstandOutput.context.turnId`). Antes de calcular, `computeEligibility`
(`src/compute-eligibility.ts`) siempre hace un `getResult` sobre
`EligibilityStore`:

- Si ya existe un `EligibilityResult` persistido para esa clave → se
  devuelve tal cual, **sin recalcular** (ver
  `test/eligibility-store.test.ts`, que cuenta invocaciones de
  `GetCommand`/`PutCommand` sobre un cliente DynamoDB mockeado para probar
  esto explícitamente: 2 `GetCommand`, pero solo 1 `PutCommand`, para dos
  invocaciones con la misma clave).
- Si no existe, se calcula, se persiste (`putResult`) y se devuelve.

`DynamoDbEligibilityStore` usa `PutCommand` **sin** `ConditionExpression` de
"no existe todavía" — limitación declarada, no bloqueante para este
checkpoint (ver siguiente sección).

## Reliability (docs/EVALUATION-CRITERIA.md)

- **Reintentos acotados con backoff corto** (2 reintentos por defecto,
  ~75ms/~150ms), replicando el mismo patrón que
  `services/conversation-agent/src/context/state-store.ts` y
  `services/retrieval-agent/src/repository/dynamodb-catalog-repository.ts` —
  nunca reintento infinito.
- **Fallback seguro, nunca un resultado inventado:** si DynamoDB falla tras
  agotar los reintentos (lectura de idempotencia o escritura), `EligibilityStore`
  devuelve `{ status: "unavailable" }` y `computeEligibility` lanza
  `EligibilityUnavailableError` (con `reason: "dynamodb_read_failed" |
  "dynamodb_write_failed"`) en vez de devolver un `EligibilityResult`
  fabricado. El handler de Lambda (`src/index.ts`) atrapa ese error
  explícitamente y responde `{ status: "unavailable", reason }` — nunca un
  5xx, nunca un score inventado.
- **Logging estructurado** correlacionado por `caseId`/`turnId` en cada paso
  (`idempotency_check_start`, `idempotency_hit_no_recompute`,
  `computing_score`, `persist_failed`, `computed_and_persisted` — ver
  `src/compute-eligibility.ts`), para que verification-agent/escalation-agent
  tengan trazabilidad completa. Nunca se loguean `entities` crudas (evita
  fuga de PII vía `document_id`, aunque el módulo de scoring ni siquiera
  recibe ese campo en su lógica).
- El handler de Lambda **nunca devuelve un 5xx**: cualquier excepción se
  atrapa y responde igual con un envelope `{ status, ... }` válido,
  `statusCode: 200` — mismo patrón que conversation-agent/retrieval-agent.

## Decisiones propias distintas de lo pedido (con su razón)

- **Firma de `computeEligibility` sobre fallo de DynamoDB:** la tarea
  original pide la firma literal
  `Promise<EligibilityResult>` para `computeEligibility`, pero también exige
  "nunca inventar un resultado" si Dynamo falla tras agotar reintentos —
  ambos requisitos son incompatibles con un simple `return` en el camino de
  error. Se resolvió lanzando `EligibilityUnavailableError` (clase tipada,
  con `.reason` explícito) en vez de devolver un `EligibilityResult`
  fabricado o cambiar la firma a un union type. Esto preserva la firma
  literal para el camino feliz, y el caller (handler Lambda, o un futuro
  orquestador) debe capturar explícitamente ese error tipado — es la forma
  más simple de "propagar un estado de error explícito" sin violar ninguno
  de los dos requisitos.
- **Archivo adicional `src/store/in-memory-eligibility-store.ts`:** no listado
  explícitamente en la tarea original (que solo pedía
  `src/store/eligibility-store.ts`). Se agregó como test double en memoria
  para que `test/pipeline-integration.test.ts` pueda ejercitar
  `computeEligibility` (incluida la idempotencia) sin mockear
  `@aws-sdk/lib-dynamodb` en cada escenario — mismo espíritu que
  `StaticCatalogRepository` en retrieval-agent. Nunca se usa desde el handler
  de Lambda (`src/index.ts`), solo desde tests.
- **`employment_status: null`/`"unknown"` → ajuste 0:** no estaba
  explícitamente definido en la tarea original (que solo daba valores para
  `employed`/`self_employed`/`retired`/`student`/`unemployed`). Se decidió
  no premiar ni penalizar un dato ausente o no clasificado — en el flujo real
  este campo ya es requerido antes de llegar a AUTO (`missing_fields`), así
  que este caso es puramente defensivo, igual que `unemployed` inesperado.
- **`requested_amount > 30000` con `requested_amount === null`:** se decidió
  no aplicar la penalización de monto alto (0, no -10) porque no hay un
  monto que comparar — el riesgo de datos incompletos ya está cubierto por
  el tramo de mayor riesgo del factor de ratio deuda/ingreso.

## Limitaciones conocidas

- **Proxy de deuda/ingreso, no deuda real.** El contrato `Entities` de
  `@banking-agent/shared` (lo único que conversation-agent efectivamente
  recolecta) no tiene un campo de deuda existente del cliente. Se usa el
  ratio `requested_amount / income` como aproximación de carga financiera
  relativa — **no** es la deuda real del solicitante.
- **Sin `ConditionExpression` atómico en el `PutCommand` de
  `DynamoDbEligibilityStore`.** Dos invocaciones concurrentes (no
  secuenciales) con el mismo `caseId`+`turnId` podrían ambas pasar el
  `getResult` inicial en `not_found` y ambas calcular/escribir. El cálculo es
  determinístico (mismo input → mismo output), así que en la práctica ambos
  valores coincidirían, pero esto no está garantizado a nivel de
  infraestructura. Siguiente paso de robustez, no implementado acá:
  `ConditionExpression: "attribute_not_exists(pk)"`.
- **Sin orquestador real conectando los Lambdas todavía.** Este servicio
  asume que quien lo invoca ya obtuvo `decision === "AUTO"` de
  `evaluatePreAction` (`@banking-agent/policy-agent`) para
  `eligibility_check`. Hoy esa garantía es un contrato **probado por test**
  (`test/pipeline-integration.test.ts`), no forzado en runtime por
  infraestructura (Step Functions u otro orquestador, pendiente de decidir
  per `docs/PLAN.md`). El handler igual valida defensivamente
  `intent === "eligibility_check"` como última línea de defensa en código.
- **Cálculo síncrono, no async.** No hay Step Functions/cola de turnos en
  este checkpoint (ver "Pendiente de decidir" en `docs/PLAN.md`) — la
  correlación por `caseId`+`turnId` está pensada para sobrevivir a un
  eventual cambio a async, pero ese cambio en sí no se implementó acá.
- **No conectado a API Gateway/Terraform.** El handler está listo para
  Lambda `nodejs20.x` (exporta `handler` desde `src/index.ts`), pero no se
  conectó a ninguna ruta real — mismo criterio que las piezas anteriores.
- **Nunca reporta éxito directamente al usuario.** Este servicio produce un
  `EligibilityResult`, que debe pasar por `policy-agent`
  (`evaluatePostAction`) y luego por `verification-agent` (fase posterior,
  no implementado acá) antes de comunicarse. No implementa ninguna lógica de
  comunicación al usuario final.

## Comandos

```bash
npm install                                              # raíz del monorepo
npm run build --workspace=@banking-agent/shared          # compila el contrato primero
npm run build --workspace=@banking-agent/policy-agent    # el test de integración importa su dist
npm run build --workspace=@banking-agent/transaction-agent
npm test --workspace=@banking-agent/transaction-agent
```

O, desde la raíz, `npm run build && npm test` corre todo el monorepo en el
orden correcto (`package.json` raíz encadena
shared -> policy-agent -> conversation-agent -> retrieval-agent ->
transaction-agent).

Los tests de `computeEligibilityScore`/`deriveScoreZone`/`loadBorderlineThresholds`
no requieren AWS real. Los de `DynamoDbEligibilityStore` mockean
`@aws-sdk/lib-dynamodb` (incluida la prueba explícita de idempotencia vía
contador de `GetCommand`/`PutCommand`). El test de integración
(`test/pipeline-integration.test.ts`) carga `policies.yaml` real e importa el
paquete **compilado** `@banking-agent/policy-agent` (por eso requiere
`npm run build` previo de ese workspace).
