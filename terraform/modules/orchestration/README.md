# Módulo `orchestration`

Step Function **Express** (síncrona, `StartSyncExecution`) que implementa el
pipeline Understand→Decide→Act→Verify→Escalate para el flujo `POST /chat`,
más el Lambda dispatcher que conecta API Gateway a esa Step Function.
Implementado en la fase de conexión del pipeline end-to-end sobre AWS real
(ver `docs/STATUS.md`, `docs/PLAN.md`); el paso Verify y el reemplazo del
placeholder de Escalate se agregaron en la fase "Días 5-6 — Verify +
Escalate".

## Por qué Step Functions Express (no Standard, no Lambda+colas)

Decisión confirmada del proyecto (no una alternativa evaluada por este
módulo): **Step Functions Express**, invocada vía `StartSyncExecution`, por
las mismas razones que la sección 11 del blueprint de referencia
(`E2E-Implementacion-AWS-Terraform-Databricks.md`) da para rutas cortas tipo
webhook: la respuesta al chat necesita ser síncrona (el usuario espera una
respuesta en la misma request HTTP, no un callback asíncrono), Express está
pensado exactamente para eso (alto volumen, ejecuciones cortas, sin retención
de historial por defecto — de ahí el logging explícito, ver abajo), y su
costo es por duración+invocaciones en vez de por transición de estado
(Standard), lo cual es más barato para este patrón. `start-execution`
(asíncrono) es para Standard y no aplica acá.

## Definición ASL (`asl/chat-orchestrator.asl.json.tftpl`)

Estados: `Understand` (invoca conversation-agent) → `Decide` (invoca
policy-agent) → `RouteByDecision` (Choice sobre `decision`) →
`RouteAutoIntent` (Choice sobre `intent`, solo si `AUTO`) → `ActRetrieval`
(`product_info`/`faq`) o `ActTransaction` (`eligibility_check`) → **`Verify`**
(invoca verification-agent con `{intent, result: $.actResult.data}`) →
`RouteByVerification` (Choice sobre `verifyResult.Payload.status`) →
`RespondAuto` (si `verified`) o `EscalateFromVerification` (si
`pending_confirmation`, Default de la Choice).

`CLARIFY` va directo a `RespondClarify`, reenviando el objeto
`policyDecision` COMPLETO (no `askField` suelto, porque es un campo opcional
de `PolicyDecisionResult` y Step Functions lanza error en runtime si se
referencia con `.$` un campo que puede no existir) -- CLARIFY nunca pasó por
escalation-agent: es un pedido de un dato faltante al propio usuario, no una
escalación a un humano.

`ESCALATE` (decisión de policy-agent en `stage: pre_action`) va a
`EscalateFromPolicy`, que invoca escalation-agent con
`{origin: "policy_decision", understand, policyDecision}`. Ambos caminos de
escalación (`EscalateFromPolicy`/`EscalateFromVerification`) confluyen en
`RespondEscalate`, que devuelve `escalation.$: "$.escalationResult.Payload"`
-- el `EscalationSummary` estructurado (`userRequestSummary`,
`knownEntities`, `maskedDocumentId`, `attemptedActions`, `unresolvedReason`,
`pendingQuestion`), **nunca** el `policyDecision`/`reason` crudo de
policy-agent que devolvía la versión anterior de este placeholder.

`Understand`/`ActRetrieval`/`ActTransaction` envuelven el payload como
`{body: States.JsonToString(...), isBase64Encoded: false}` para reusar
LITERALMENTE el contrato `APIGatewayProxyEventV2` que esos 3 handlers ya
tienen (cero cambios de código en `services/*`). `Decide`/`Verify`/
`EscalateFromPolicy`/`EscalateFromVerification` pasan JSON plano como
`Payload` porque policy-agent/verification-agent/escalation-agent esperan
JSON plano (no están, ni deben estar, nunca detrás de API Gateway -- mismo
criterio Task-a-Task para los 3).

**Limitación explícita, no silenciada:** el resultado de `ActTransaction`
(`EligibilityResult`) no vuelve a pasar por `evaluatePostAction` de
policy-agent dentro de esta Step Function -- solo pasa por verification-agent
(que recalcula `score_zone` de forma independiente y marca
`pending_confirmation` si no coincide con lo reportado por transaction-agent,
pero no aplica la regla de negocio completa de `post_action_rules` de
`policies.yaml`, ej. convertir un score `borderline` en un `ESCALATE`
explícito con su propio `reason` de política). Documentado en
`docs/STATUS.md`/`docs/PLAN.md` como riesgo pendiente de una fase futura, no
un descuido de esta conexión.

## Logging obligatorio (Reliability/Observability)

Express **no retiene historial de ejecución navegable** si no tenés
`logging_configuration` — a diferencia de Standard. Este módulo configura
`level = "ALL"`, `include_execution_data = true` hacia un log group
dedicado (`/aws/vendedlogs/states/<name_prefix>-chat-orchestrator`), y le da
al rol de ejecución de la state machine el set de permisos EXACTO que AWS
exige para esto (`logs:CreateLogDelivery`, `GetLogDelivery`,
`UpdateLogDelivery`, `DeleteLogDelivery`, `ListLogDeliveries`,
`PutResourcePolicy`, `DescribeResourcePolicies`, `DescribeLogGroups`, con
`Resource: "*"`). Esto **no** es un descuido de mínimo privilegio: es una
excepción documentada y requerida por el servicio de Step Functions para la
infraestructura de entrega de logs (log delivery), no acceso a datos de la
cuenta — AWS no expone un scoping más fino para esta operación.

## IAM de invocación restringida (gap 3, Security — `docs/EVALUATION-CRITERIA.md`)

1. El rol de ejecución de la Step Function tiene `lambda:InvokeFunction`
   **solo** sobre los 6 ARNs exactos que invoca (nunca `Resource: "*"`).
2. `aws_lambda_permission` (resource-based policy) en los 6 Lambdas
   (mínimo exigido: retrieval-agent y transaction-agent; replicado también
   en conversation-agent/policy-agent/verification-agent/escalation-agent
   por defensa en profundidad) con `principal = "states.amazonaws.com"` y
   `source_arn` scoped a **esta** state machine — restringe la invocación
   vía el servicio Step Functions a esta Step Function específica, no a
   cualquiera de la cuenta.
3. Ningún rol de ejecución de los 6 Lambdas de negocio (`module.agent`) tiene
   `lambda:InvokeFunction` hacia nadie — ver `terraform/modules/agent/README.md`.
   Esa ausencia es la garantía real (forzada por IAM) de que conversation-agent/
   policy-agent no pueden invocar retrieval-agent/transaction-agent
   saltándose esta Step Function, y de que verification-agent/escalation-agent
   no pueden invocar a nadie tampoco.

**Limitación real, documentada (no escondida):** el usuario IAM del proyecto
(`banking-agent-dev`) tiene `AdministratorAccess` (decisión de checkpoint 0)
— nada de este hardening impide que ESE usuario invoque
retrieval-agent/transaction-agent directamente (`aws lambda invoke`). Las
resource-based policies del punto 2 son un permiso ADICIONAL para
principals sin permiso propio (cross-account/service principals como
`states.amazonaws.com`), no un firewall contra un principal que ya tiene
`lambda:InvokeFunction` vía política de identidad admin. Lo que este diseño
SÍ garantiza: ningún rol de ejecución que no sea el de esta Step Function
puede invocar retrieval-agent/transaction-agent.

## Lambda dispatcher (`lambda-src/chat-dispatcher/index.js`)

Puente síncrono entre `POST /chat` (API Gateway HTTP API v2, integración
`AWS_PROXY`) y `StartSyncExecution` de esta Step Function — API Gateway HTTP
API no tiene integración nativa con Step Functions (a diferencia de REST API
vía VTL). Es puro glue/infra, JS plano sin dependencias propias
(`@aws-sdk/client-sfn` viene preinstalado en el runtime Node.js 20.x de
Lambda, no se bundlea). Nunca devuelve un 5xx (mismo criterio de
Reliability que el resto del pipeline). Timeout configurado en
`var.dispatcher_lambda_timeout` (default 28s) — por debajo del límite duro
de 29s de API Gateway HTTP API, que no se puede aumentar. El paso `Verify`
adicional (una invocación de Lambda más por turno AUTO) sigue estando muy
por debajo de ese presupuesto en la práctica (verification-agent no toca
AWS, solo lee un archivo local y compara números).

IAM del dispatcher: `states:StartSyncExecution` scoped exactamente al ARN de
esta state machine (nada de `*`).

## Conexión con `edge`

Este módulo NO se conecta directamente a `modules/edge` — `envs/dev/main.tf`
pasa `module.orchestration.dispatcher_lambda_invoke_arn` a
`module.edge.chat_route_lambda_invoke_arn`, y agrega el
`aws_lambda_permission` que le da a `apigateway.amazonaws.com` permiso de
invocar el dispatcher (scoped a `module.edge.api_execution_arn`). Se
resuelve en el root module (no acá ni en `edge`) porque es el único lugar
que tiene ambos outputs sin crear una dependencia circular entre módulos.

## Verificación real (post-conexión de Verify/Escalate)

Casos probados end-to-end contra la Step Function real
(`aws stepfunctions start-sync-execution`/SDK equivalente) y contra el
endpoint HTTP completo (`POST /chat`):

- **AUTO / `faq`** (`"cual es el horario de atencion"`): `status: "ok"`,
  `result` = el `RetrievalResult` desenvuelto de `verifyResult.Payload.data`
  (pasó por `ActRetrieval` → `Verify` → `RespondAuto`, `verified: true`
  porque cada FAQ trae `source` no vacío).
- **AUTO / `eligibility_check`** (score claramente `approved`, no
  `borderline`): `status: "ok"`, `result` = el `EligibilityResult`
  desenvuelto (pasó por `ActTransaction` → `Verify` → `RespondAuto`,
  `verified: true` porque `score_zone` recalculado por verification-agent
  coincide con el reportado por transaction-agent).
- **ESCALATE** (`"quiero hablar con un asesor"` → policy-agent decide
  `ESCALATE` en `pre_action`): `status: "escalate"`, `escalation` = el
  `EscalationSummary` estructurado (`attemptedActions: []`, `origin:
  "policy_decision"`) -- ya NO se reenvía `policyDecision` crudo.
- **CLARIFY** (sin cambios de comportamiento, no pasa por
  verification-agent/escalation-agent): sigue devolviendo
  `policyDecision` completo, como antes de esta fase.

## Outputs

`state_machine_arn`/`state_machine_name`/`state_machine_log_group_name`,
`dispatcher_lambda_function_name`/`arn`/`invoke_arn`.
