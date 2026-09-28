# PLAN.md

> Regenerado con `/plan` a medida que avanza el proyecto. Ver docs/STATUS.md para
> el detalle de tareas y `E2E-documentacion-tecnica/` para el blueprint de
> arquitectura AWS/Terraform que estamos siguiendo (no un mock desechable).

## Contexto de la decisión

- Flujo: **credit-product info & eligibility**.
- Arquitectura target: **AWS real con Terraform**, adaptando el blueprint de
  `E2E-Implementacion-AWS-Terraform-Databricks.md` (orden de implementación §9
  de ese documento) a nuestro caso — sin el canal WhatsApp/Insider (nuestro
  canal es el chat UI de `frontend-dev`), pero conservando: case/session store
  en DynamoDB, agente por Lambda + Bedrock, cola de turnos, contrato de
  publish/escalation estructurado, e idempotencia en acciones.
- Duración: 10 días. Meta: producto completo, con limitaciones documentadas al
  cierre (no una demo de superficie).
- Los datos bancarios/de crédito siguen siendo simulados — la infraestructura
  es real, el "banco" detrás es un mock.

## Fases (adaptado de la sección 9 del blueprint AWS)

1. **Días 1-2 — Infra base (devops):** Terraform edge (API Gateway) + data
   plane (DynamoDB case/session, S3 si aplica) + secrets (SSM/Secrets Manager).
   Deploy de scaffold vacío (checkpoint 0).
2. **Días 2-3 — Understand + Decide:** conversation-agent (router/intención,
   detección ES/PT, context manager sobre DynamoDB) + policy-agent
   (policies.yaml con reglas AUTO/CLARIFY/ESCALATE para elegibilidad crediticia).
3. **Días 3-5 — Act:** retrieval-agent (catálogo de productos + FAQs) y la
   pieza de cálculo de elegibilidad (regla determinística con idempotency key,
   Lambda). Integración con Bedrock si aplica generación de respuesta.
4. **Días 5-6 — Verify + Escalate:** verification-agent (no reportar éxito sin
   confirmar) y escalation-agent (resumen estructurado, contrato tipo Publish
   Response).
5. **Días 6-7 — Frontend: COMPLETADA.** Chat UI funcional (`apps/web`)
   consumiendo el contrato de conversation-agent/policy-agent, indicador de
   idioma, estado de escalación visible — ver "Decisiones y limitaciones
   registradas — Días 6-7 (Frontend)" más abajo y `docs/STATUS.md` P0 para el
   detalle completo (incluye CORS de devops como precondición y QA
   independiente del reviewer, 5/5 puntos PASS).
6. **Días 7-8 — Integración end-to-end + i18n: COMPLETADA.** Pipeline
   conectado antes de esta fase (ver nota abajo); i18n validado y corregido
   — ver "Decisiones y limitaciones registradas — Días 7-8 (i18n)" y
   `docs/STATUS.md` P1.
7. **Días 8-9 — Observabilidad + reviewer: PARCIAL.** Logs correlacionados
   por `caseId`/`turnId` ya existían desde fases anteriores (ver
   `terraform/modules/observability/README.md`); checklist de reviewer
   completo — ver `docs/STATUS.md` P2. **No se hizo** el hardening de
   dashboards/alarmas de CloudWatch (documentado como limitación de
   Observability en el cierre, no bloqueante para la entrega).
8. **Día 9-10 — Cierre: COMPLETADA.** Sección de limitaciones conocidas,
   checklist de paridad funcional vs. blueprint, y los 4 pilares verificados
   — ver `docs/STATUS.md` P2 (contenido completo, no se duplica acá) y la
   sección final de este documento.

**Nota de secuencia real (no estrictamente estas fases en este orden):** el
pipeline end-to-end (Understand→Decide→Act sobre AWS real, incluyendo la
conexión completa vía Step Functions) se conectó antes de completar
verification-agent/escalation-agent/frontend (fases 4-6) — ver
"Decisiones y limitaciones registradas — Conexión del pipeline end-to-end
(AWS real)" más abajo y `docs/STATUS.md` P0 para el detalle de qué quedó
como placeholder explícito por esa razón.

## Decisiones y limitaciones registradas — Checkpoint 0 (infra base)

- Un solo ambiente `envs/dev` en vez de `envs/{uat,prod}` del blueprint
  completo (se puede duplicar reusando los mismos módulos cuando se
  necesite otro ambiente).
- GSI de DynamoDB renombrado: `gsi1pk = CUSTOMER#<customerId>` en vez de
  `FAN#<fromCustomerUserId>` del blueprint (no hay canal WhatsApp/fan; el
  actor cliente es el "customer" del chat UI).
- Sin WAF frente al API Gateway en este checkpoint (omisión documentada en
  `terraform/modules/edge/README.md` y `terraform/README.md`, pendiente
  antes de dar por cerrado el pilar Security de EVALUATION-CRITERIA.md).
- Sin autenticación/autorización en el API Gateway todavía (documentado,
  debe resolverse antes o al conectar el Lambda real de conversation-agent).
- Backend de Terraform state local (no S3+DynamoDB lock todavía); bloque
  `backend "s3"` dejado comentado en `terraform/envs/dev/backend.tf`, listo
  para activar cuando se decida.
- Sin tabla `processed_events` de idempotencia ni S3 de adjuntos en el
  módulo `data` (no aplican sin canal WhatsApp con adjuntos); se
  reevaluará idempotencia de escritura en la fase de transaction-agent.
- Sin rotación de secretos en `modules/secrets` (aceptado para el scope de
  10 días; queda como "deployment work" pendiente en limitaciones finales).
- Ruta `POST /chat` preparada en el módulo `edge` vía
  `var.chat_route_lambda_invoke_arn` (default `null`), sin conectar
  todavía al Lambda del conversation-agent (se conecta en fase 2+ sin
  refactor estructural del módulo).
- Módulos `messaging`, `orchestration`, `agent`, `observability` existen
  solo como carpetas con README "pendiente — fase X", sin recursos, no
  instanciados desde `envs/dev` en este checkpoint.
- Validación ejecutada: `terraform fmt`, `terraform init`, `terraform
  validate` (éxito, provider `hashicorp/aws` v5.100.0). `terraform
  plan`/`apply` no se pudieron correr por falta de credenciales AWS en
  este entorno de desarrollo — queda pendiente para el primer deploy real
  contra una cuenta AWS.

## Pendiente de decidir
- Proveedor/modelo LLM concreto sobre Bedrock (o alternativa) para el flujo de
  crédito. **SIGUE sin resolver** — ningún Lambda invoca Bedrock todavía (ver
  `terraform/README.md`, limitaciones).
- ~~Si se requiere Step Functions completo o basta con Lambda + colas simples
  dado el scope de 10 días (evaluar con devops al iniciar infra).~~
  **RESUELTO:** ver "Decisiones y limitaciones registradas — Conexión del
  pipeline end-to-end (AWS real)" al final de este documento.

## Decisiones y limitaciones registradas — Días 2-3 (Understand + Decide)

- Monorepo con npm workspaces creado en esta fase (no existía antes):
  `package.json` raíz (`workspaces: ["packages/*", "services/*", "apps/*"]`),
  `tsconfig.base.json`, `.gitignore` raíz. `terraform/` queda fuera de los
  workspaces (es Terraform, no Node).
- Runtime elegido para los Lambdas de lógica de negocio: **Node.js 20.x +
  TypeScript** (decisión de conversation-agent, sin precedente previo fijado
  en el proyecto) — razones y trade-offs en `docs/CONTRACTS.md` sección 3.
  policy-agent se alineó al mismo runtime para su evaluador de referencia. Si
  retrieval-agent/transaction-agent (fase 3) prefieren otro runtime (ej.
  Python), pierden la garantía de compilación cruzada de `packages/shared` y
  necesitan un JSON Schema/Pydantic espejo — no generado todavía (limitación
  explícita).
- Contrato de salida de Understand (`{intent, language, entities,
  missing_fields, context}`) definido con doble fuente: `packages/shared/src/
  contracts/understand-output.ts` (fuente de verdad canónica, código) +
  `docs/CONTRACTS.md` (explicación legible, ejemplos ES/PT, decisión de
  ubicación documentada). Se eligió código + doc en vez de solo doc para que
  futuros consumidores (policy-agent ya, retrieval/transaction-agent y
  frontend-dev después) puedan importar tipos reales en vez de copiar nombres
  a mano.
- Modelo de estado de conversación sobre la tabla DynamoDB ya desplegada
  (`banking-agent-dev-case-store`, checkpoint 0): dos tipos de item por
  `caseId` usando el mismo schema `pk`/`sk`/`gsi1pk` ya fijado por devops —
  `MSG#<messageId>` (log append-only, uno por turno) y `STATE#latest` (un
  solo item de estado de conversación, upserted cada turno en vez de uno por
  turno, para que la lectura de contexto sea un `GetItem` O(1) en el hot
  path). No requirió cambios en Terraform (usa el schema existente sin
  modificar el módulo `data`).
- `ttl` de ambos tipos de item fijado en `now + 30 días` como **placeholder
  explícito** (constante `DEFAULT_TTL_DAYS`) — la política de retención real
  queda pendiente de definir entre policy-agent y devops (el mecanismo ya
  está habilitado desde checkpoint 0, el valor todavía no es una decisión de
  negocio confirmada).
- `policies.yaml` ubicado en la raíz del repo (no `docs/`) — es config de
  runtime consumida por un evaluador de código, no documentación en prosa.
  Modelo de evaluación explícito: "most-conservative-match-wins" (se
  recolectan todas las reglas que matchean por stage, gana la de mayor
  severidad ESCALATE>CLARIFY>AUTO; fallback por defecto ESCALATE si ninguna
  regla matchea) — formaliza en código las dos reglas de desempate del diseño
  original en vez de dejarlas implícitas en un prompt.
- Reglas `post_action` de `policies.yaml` (ESCALATE si score de elegibilidad
  en zona límite) son una **propuesta no confirmada**: dependen de un
  contrato `EligibilityResult` (`caseId`, `productType`, `eligibility_score`,
  `score_zone`) que transaction-agent todavía no existe para producir.
  Preguntas abiertas documentadas directamente en `policies.yaml` (escala del
  score, quién calcula `score_zone`, correlación si el cálculo es async) — a
  confirmar/renegociar con transaction-agent en la fase "Días 3-5 — Act".
- QA independiente (reviewer) corrió `npm install`/build/test desde la raíz
  sobre las tres piezas nuevas (`packages/shared`, `services/conversation-
  agent`, `services/policy-agent`): build y tests en verde (5+24+15 = 44
  tests), sin discrepancias de nombres de campo entre `policies.yaml` y el
  contrato TS, fallback de Reliability de conversation-agent verificado línea
  por línea contra la documentación.

## Pendiente de decidir (actualizado — Días 2-3)

- Si `services/policy-agent` se despliega como Lambda separado o se fusiona
  con `services/conversation-agent` en un solo Lambda (devops.md deja la
  puerta abierta a "un solo Lambda al inicio") — **RESUELTO** en la conexión
  del pipeline end-to-end: se desplegaron como 4 Lambdas separados (uno por
  servicio), no fusionados, para mantener el aislamiento de IAM de mínimo
  privilegio (policy-agent sin ningún permiso de AWS más allá de logging,
  conversation-agent solo con acceso a `case_store`, etc. — ver
  `terraform/modules/agent/README.md`). Fusionarlos hubiera obligado a un rol
  de IAM único con la unión de todos los permisos, debilitando esa garantía.
- ~~Contrato `EligibilityResult` de transaction-agent (fase 3) — confirmar con
  quien implemente esa pieza contra la propuesta ya dejada en
  `policies.yaml`.~~ **RESUELTO (Días 3-5):** ver sección "Decisiones y
  limitaciones registradas — Días 3-5 (Act, transaction-agent)" y la
  confirmación aplicada por policy-agent más abajo.
- Política de retención real (valor de `ttl`) — coordinar policy-agent/devops
  antes del cierre del proyecto. **SIGUE sin resolver** — ver
  `terraform/modules/data/README.md`, sección "Política de data retention".

## Decisiones y limitaciones registradas — Días 3-5 (Act, retrieval-agent)

- **DynamoDB vs. S3 para el catálogo de productos/FAQs:** se eligió
  **DynamoDB** (no S3), mismo patrón `pk`/`sk` ya usado en
  `terraform/modules/data` para `banking-agent-dev-case-store`, por dos
  razones: (1) el acceso siempre es por clave exacta (`productType` o
  `faqId`), nunca por búsqueda de texto/rango, así que no hay ganancia de
  usar S3+Glue/Athena para este caso de uso; (2) reusar el mismo mecanismo
  de acceso (`GetItem`/`Scan` vía `@aws-sdk/lib-dynamodb`) que ya usa
  conversation-agent evita introducir un segundo patrón de infraestructura
  de datos solo para contenido de referencia estático. Tabla propuesta:
  `banking-agent-dev-product-catalog` (`pk = PRODUCT#<productType>` /
  `pk = FAQ#<faqId>`, `sk = INFO`, `PAY_PER_REQUEST`, sin GSI, sin `ttl`
  porque no es contenido de sesión con expiración). **Creada en Terraform**
  en la fase de conexión del pipeline end-to-end (ver sección final de este
  documento) — en el momento en que retrieval-agent escribió esta sección
  todavía no existía.
- Backend seleccionable vía `CATALOG_BACKEND` (`"static"` por defecto,
  respaldado por un seed versionado en el repo; `"dynamodb"` con código real
  pero solo probado con el cliente de AWS SDK mockeado, la tabla no existe
  todavía) — mismo criterio de "código real, Lambda-ready, sin conectar" que
  las piezas de la fase anterior.
- Se corrigió un bug preexistente en el script `build` de la raíz del
  monorepo: faltaba compilar `@banking-agent/policy-agent` en la cadena
  (`shared -> conversation-agent`, sin `policy-agent` en el medio), lo cual
  bloqueaba cualquier consumidor que necesitara el `dist/` de policy-agent
  (como el test de integración de retrieval-agent). Orden corregido:
  `shared -> policy-agent -> conversation-agent -> retrieval-agent`.
- Contrato `RetrievalResult` agregado a `packages/shared` (mismo criterio que
  `UnderstandOutput`: código TypeScript como fuente de verdad, no solo
  prosa) — reusa literalmente `ProductType`/`DocumentType`/
  `EmploymentStatus`/`LanguageCode` de `understand-output.ts` en vez de
  redefinirlos.

## Pendiente de decidir (actualizado — Días 3-5)

- ~~Terraform para la tabla `banking-agent-dev-product-catalog` (módulo
  `data`) — coordinar con devops en una fase posterior; no bloquea el
  código de `retrieval-agent`, que ya está listo para apuntar a esa tabla
  vía `CATALOG_BACKEND=dynamodb` en cuanto exista.~~ **RESUELTO:** tabla
  creada y poblada automáticamente — ver sección final de este documento.

## Decisiones y limitaciones registradas — Días 3-5 (Act, transaction-agent)

- **Resolución de las 3 preguntas abiertas de `policies.yaml`** (dejadas
  explícitas en `post_action_contract_status: PROPOSAL_NOT_CONFIRMED`,
  justo antes de `post_action_rules`) — ya NO son preguntas abiertas, quien
  aplique la confirmación a `policies.yaml` (delegación separada a
  policy-agent) debe copiar esta resolución literalmente:
    1. **Escala de `eligibility_score`:** 0-100, confirmado (la escala ya
       asumida por `config.borderline_score_min`/`_max`).
    2. **Quién calcula `score_zone`:** transaction-agent, no policy-agent.
       Para no duplicar el umbral en dos lugares, transaction-agent lee
       `config.borderline_score_min`/`config.borderline_score_max`
       directamente de `policies.yaml` en runtime (mismo mecanismo `js-yaml`
       que ya usa el evaluador de policy-agent) en vez de hardcodearlos de
       nuevo — ver `services/transaction-agent/src/config/load-thresholds.ts`.
       Regla: `score < min` -> `declined`; `score > max` -> `approved`;
       `[min, max]` inclusive -> `borderline`. Consecuencia: las dos señales
       que `escalate-score-borderline` combina con `OR` siempre coinciden,
       porque nacen de la misma fuente de umbrales.
    3. **Correlación por `caseId` si el cálculo fuera async:** el cálculo es
       síncrono en este checkpoint (no hay Step Functions/cola de turnos
       todavía, ver "Pendiente de decidir" abajo — sigue sin resolver, no lo
       resuelve transaction-agent). El resultado se persiste en la MISMA
       tabla `banking-agent-dev-case-store`, MISMA partición
       `pk = CASE#<caseId>` que ya usa conversation-agent
       (`sk = RESULT#eligibility#<turnId>`) — un futuro consumidor puede
       reconstruir el caso completo con un `Query` sobre esa partición, sin
       mecanismo de correlación aparte; si el cálculo se vuelve async en el
       futuro, `caseId`+`turnId` sigue siendo la clave de correlación
       válida.
- **Contrato `EligibilityResult`** agregado a
  `packages/shared/src/contracts/eligibility-result.ts` (mismo criterio que
  `UnderstandOutput`/`RetrievalResult`: código TypeScript como fuente de
  verdad) — mismo shape LITERAL que `EligibilityResultProposal` de
  `services/policy-agent/src/evaluator.ts`, para que un resultado real se
  pueda pasar directamente a `evaluatePostAction` sin mapeo.
- **Proxy de deuda/ingreso, no deuda real:** el contrato `Entities` no tiene
  un campo de deuda existente del cliente (solo lo que conversation-agent
  efectivamente recolecta) — se usa el ratio `requested_amount/income` como
  aproximación de carga financiera relativa. Documentado como limitación
  conocida, no como un descuido.
- **Idempotencia:** `idempotencyKey = "${caseId}:${turnId}"`. Se decidió NO
  usar `ConditionExpression` atómica en el `PutCommand` de
  `DynamoDbEligibilityStore` en este checkpoint (limitación declarada, no
  bloqueante) — el cálculo es determinístico, así que dos escrituras
  concurrentes coincidirían en valor en la práctica, pero la atomicidad de
  infraestructura queda como siguiente paso de robustez.
- **Firma de `computeEligibility` ante fallo del backend simulado:** en vez
  de devolver un `EligibilityResult` fabricado (o cambiar la firma a un
  union type) cuando DynamoDB falla tras agotar los reintentos, se lanza un
  error tipado `EligibilityUnavailableError` (con `reason` explícito). El
  handler de Lambda lo atrapa y responde `{status: "unavailable"}`, nunca un
  5xx ni un score inventado — ver
  `services/transaction-agent/README.md`, sección "Decisiones propias",
  para la justificación completa de esta desviación respecto a la firma
  literal pedida originalmente.
- Build y tests verificados por el propio autor: `npm install`/`npm run
  build`/`npm test` desde la raíz, **106 tests en verde en total** (5
  `packages/shared` + 24 `conversation-agent` + 15 `policy-agent` + 28
  `retrieval-agent` + 34 `transaction-agent`).

## Pendiente de decidir (actualizado — Días 3-5, transaction-agent)

- ~~Si se requiere Step Functions completo o basta con Lambda + colas simples
  (ver "Pendiente de decidir" de Checkpoint 0) — SIGUE sin resolver;
  transaction-agent asume cálculo síncrono en este checkpoint pero no toma
  esa decisión de arquitectura por su cuenta.~~ **RESUELTO:** ver sección
  final de este documento — Step Functions Express, cálculo síncrono dentro
  de la ejecución (coincide con lo que transaction-agent ya asumía).
- `ConditionExpression` atómico para `DynamoDbEligibilityStore.putResult`
  (robustecer idempotencia ante escrituras concurrentes) — no bloqueante,
  queda como hardening pendiente. **SIGUE sin resolver.**
- Confirmar en `policies.yaml` (delegación separada a policy-agent) la
  resolución de las 3 preguntas abiertas ya documentada arriba —
  `post_action_contract_status` debe pasar de `PROPOSAL_NOT_CONFIRMED` a
  confirmado una vez que policy-agent aplique el cambio. **RESUELTO** (ver
  sección siguiente).

## Decisiones y limitaciones registradas — Días 3-5 (policy-agent, confirmación del contrato)

- policy-agent aplicó la confirmación descrita arriba: `policies.yaml`
  pasó `post_action_contract_status` de `PROPOSAL_NOT_CONFIRMED` a
  `CONFIRMED`, reemplazó el bloque de comentarios "PROPUESTA, a validar" /
  "preguntas abiertas" de la sección `post_action_rules` por la resolución
  confirmada (documentada en las tres preguntas ya resueltas arriba) y
  agregó una referencia explícita a
  `packages/shared/src/contracts/eligibility-result.ts` como fuente de
  verdad de nombres de campo para `stage: post_action` (mismo patrón que
  `understand-output.ts` para `stage: pre_action`). La lógica de las
  reglas `escalate-score-borderline`/`auto-score-approved`/
  `auto-score-declined` NO cambió (seguían bien diseñadas con `OR` entre
  `score_zone` y `eligibility_score` para no depender de una sola señal);
  solo se actualizaron los comentarios que quedaron obsoletos.
  `services/policy-agent/src/evaluator.ts` reemplazó la interfaz local
  `EligibilityResultProposal` por `import type { EligibilityResult } from
  "@banking-agent/shared"` en la firma de `evaluatePostAction` (mismo
  shape, sin mapeo necesario); `evaluator.test.ts` se actualizó para
  importar `EligibilityResult` en vez de construir objetos sin tipo
  explícito. **NOTA DE HONESTIDAD:** en esta sesión de policy-agent no
  hubo acceso a una herramienta de shell/Bash para correr `npm install`/
  `npm run build`/`npm test` desde la raíz — el cambio de tipo es
  mecánico (mismo shape literal, solo cambia el origen del import) y no
  se tocó ninguna regla de `policies.yaml` ni la lógica de
  `evaluateStage`/`evalCondition`, pero el reviewer debe correr esos tres
  comandos y confirmar que los 106 tests conocidos (5 `packages/shared` +
  24 `conversation-agent` + 15 `policy-agent` + 28 `retrieval-agent` + 34
  `transaction-agent`) siguen en verde antes de dar este cambio por
  validado, y en particular que `retrieval-agent`/`transaction-agent` (que
  dependen del `dist/` compilado de `@banking-agent/policy-agent` para sus
  tests de integración) no se rompieron.

## Decisiones y limitaciones registradas — Conexión del pipeline end-to-end (AWS real)

Fase ejecutada por devops para cerrar los 3 gaps que quedaban entre "los 4
servicios de lógica de negocio compilan y tienen tests en verde" y "el
pipeline corre de punta a punta sobre AWS real": (1) tabla de catálogo no
desplegada, (2) Lambdas no empaquetados/desplegados, (3) sin orquestador real
conectado. Detalle técnico completo en `terraform/README.md`,
`terraform/modules/agent/README.md`, `terraform/modules/orchestration/README.md`
y `docs/EVALUATION-CRITERIA.md` (pilar Security) — acá solo el resumen de
decisiones para que quede en el historial de `/plan`.

- **Pregunta abierta "Step Functions completo o Lambda + colas simples"
  (arrastrada desde checkpoint 0): RESUELTA — Step Functions Express.**
  Invocada síncronamente vía `StartSyncExecution` desde un Lambda dispatcher
  detrás de `POST /chat`. Razón (sección 11 del blueprint de referencia): el
  chat necesita una respuesta síncrona en la misma request HTTP; Express está
  pensado para exactamente ese patrón (alto volumen, ejecuciones cortas,
  costo por duración+invocaciones en vez de por transición de estado como
  Standard). No se creó ninguna cola SQS de turnos (`modules/messaging` queda
  sin recursos por esta misma razón, no por estar pendiente de implementar) —
  Step Functions Express ya resuelve la ejecución síncrona del pipeline sin
  necesidad de desacoplar ingesta de procesamiento para este volumen de
  tráfico. `start-execution` (asíncrono) es para Standard y no aplica.
- **Empaquetado de Lambdas: esbuild** (bundling a un único archivo CJS por
  servicio), no zip de `dist/`+`node_modules` tal cual — evita el riesgo real
  de symlinks rotos de npm workspaces (`@banking-agent/shared`) en el Lambda
  desplegado. Ver `terraform/modules/agent/README.md`.
- **4 Lambdas separados** (no fusionados en uno), para preservar IAM de
  mínimo privilegio por servicio — ver "Pendiente de decidir (actualizado —
  Días 2-3)" arriba.
- **IAM de invocación restringida**: ningún Lambda de negocio tiene
  `lambda:InvokeFunction` hacia otro — solo la Step Function puede invocarlos,
  scoped a los 4 ARNs exactos. Limitación documentada: el usuario admin del
  proyecto puede bypassear esto igual (ver `docs/EVALUATION-CRITERIA.md`).
- **Placeholder explícito y documentado (no descuido):**
  verification-agent/escalation-agent (fase 4, todavía no implementados) no
  están en la cadena real — `CLARIFY`/`ESCALATE` responden directo el
  `policyDecision` de policy-agent, y el resultado de transaction-agent no
  vuelve a pasar por `evaluatePostAction`. Ver `docs/STATUS.md` P0 para el
  detalle y el `Comment` de la definición ASL en
  `terraform/modules/orchestration/asl/chat-orchestrator.asl.json.tftpl`.
- Verificado contra AWS real (no solo tests locales): `terraform apply` (39
  recursos agregados, 0 destruidos), seed del catálogo (20 items), invocación
  directa de la Step Function para los 4 caminos de decisión, y `curl` contra
  el endpoint HTTP real de punta a punta. Detalle completo en
  `docs/STATUS.md` P0/P1.

## Decisiones y limitaciones registradas — Días 5-6 (Verify + Escalate)

Fase ejecutada para cerrar el placeholder explícito que dejó la conexión del
pipeline end-to-end (`RespondAuto`/`RespondEscalate` respondiendo directo
sin una capa de verificación/resumen estructurado). Detalle técnico completo
en `docs/STATUS.md` P0 (bullets `verification-agent`/`escalation-agent`) —
acá el resumen de decisiones para el historial de `/plan`.

- **verification-agent** (`services/verification-agent`): produce el
  contrato `VerificationResult` y se conecta como el Task `Verify` de la
  Step Function real, inmediatamente después de `ActRetrieval`/
  `ActTransaction` en el camino AUTO. Es una verificación INDEPENDIENTE, no
  un passthrough: recalcula `score_zone` desde `policies.yaml` para
  `EligibilityResult` y la compara contra lo ya calculado por
  transaction-agent, y valida que `RetrievalResult` tenga `source` explícito
  cuando `found: true`. Fallback seguro deliberado: cualquier fallo interno
  se reporta como `pending_confirmation`, nunca como `verified` por
  default — la pieza nunca "asume éxito", ni siquiera ante su propio error
  interno (ese es justamente el requisito original que motivó esta fase).
  IAM mínimo: solo `AWSLambdaBasicExecutionRole`.
- **escalation-agent** (`services/escalation-agent`): produce el contrato
  `EscalationSummary` y reemplaza el placeholder `RespondEscalate`.
  **Decisión de arquitectura tomada en esta fase, no algo que ya viniera
  pedido literalmente así:** se decidió invocar escalation-agent desde DOS
  orígenes distintos — (1) `policy_decision`, el reemplazo directo del
  placeholder cuando policy-agent decide `ESCALATE` en `pre_action`, y (2)
  `verification_failed`, cuando verification-agent marca un resultado AUTO
  como `pending_confirmation`. La razón de agregar el segundo origen: sin
  él, un resultado `pending_confirmation` de verification-agent hubiera
  quedado como un tercer formato de respuesta ad-hoc (ni el contrato AUTO
  normal, ni un `EscalationSummary`, ni el `policyDecision` crudo de
  CLARIFY/ESCALATE) sin ningún resumen humano de "qué se intentó
  automáticamente y por qué no se pudo resolver" — que es exactamente el
  problema que `EscalationSummary` ya resuelve para el camino de
  policy-agent. Tratar ambos orígenes con el mismo contrato evita esa
  tercera forma de respuesta y reusa una sola pieza ya probada (28 tests,
  incluye seguridad de PII). El camino `RespondClarify` (CLARIFY) queda
  fuera de este alcance a propósito: modela una repregunta al propio
  usuario, no un hand-off a un humano.
- **Resolución de `sec-masked-identifier-for-escalation` de
  `policies.yaml`** (coordinación que quedaba pendiente desde la fase de
  policy-agent, ver "Pendiente de decidir" de Días 2-3): implementada en
  `EscalationSummary.maskedDocumentId` (últimos 4 caracteres visibles,
  resto enmascarado) + una pasada de redacción recursiva de defensa en
  profundidad sobre todo el objeto de salida, más la exclusión directa de
  `document_id` de `knownEntities` (nunca aparece ahí, ni enmascarado).
  Regla actualizada en `policies.yaml` con estado `RESUELTO` (ver ese
  archivo, sección `security`).
- **Terraform:** 6 Lambdas de negocio en total ahora (antes 4). ASL
  actualizada con los estados `Verify`/`RouteByVerification`/
  `EscalateFromPolicy`/`EscalateFromVerification`
  (`terraform/modules/orchestration/asl/chat-orchestrator.asl.json.tftpl`).
  `terraform apply` limpio: 11 recursos agregados, 5 modificados, 1
  destruido — este último es SOLO el `null_resource.build_lambdas` local de
  trigger de build, ningún recurso real de AWS de checkpoints anteriores se
  destruyó. `terraform plan` posterior sin drift. Verificado con 3 casos
  reales contra AWS real (AUTO `faq`, AUTO `eligibility_check` aprobado,
  ESCALATE) + 1 caso de regresión (CLARIFY, sin cambios de comportamiento).
- **Gap que sigue abierto (repetido brevemente acá, detalle completo en
  `docs/STATUS.md` P0):** el resultado de `ActTransaction` pasa por
  `Verify` pero nunca vuelve a pasar por `evaluatePostAction` de
  policy-agent dentro de la Step Function real — un score `borderline`
  internamente consistente termina en `status: "ok"` en vez de `ESCALATE`,
  porque `escalate-score-borderline` (`post_action_rules`) nunca se evalúa
  en el pipeline real hoy. Solución propuesta: Task `PostActionDecide`
  entre `Verify` y `RespondAuto`.

## Pendiente de decidir (actualizado — conexión del pipeline end-to-end)

- Proveedor/modelo LLM concreto sobre Bedrock — SIGUE sin resolver, ningún
  Lambda lo invoca todavía.
- Reemplazar `AdministratorAccess` del usuario `banking-agent-dev` por una
  policy acotada por servicio — SIGUE sin resolver, documentado como
  limitación de Security en `terraform/README.md` y
  `docs/EVALUATION-CRITERIA.md`.
- ~~Cuándo/cómo implementar verification-agent/escalation-agent y conectarlos
  a la Step Function real (reemplazando los placeholders `RespondClarify`/
  `RespondEscalate`/`RespondAuto` actuales) — fase 4 de este documento,
  todavía no iniciada.~~ **RESUELTO (Días 5-6):** ver la sección
  "Decisiones y limitaciones registradas — Días 5-6 (Verify + Escalate)"
  de arriba. `RespondClarify` sigue sin pasar por escalation-agent (por
  diseño, ver esa misma sección).
- ~~Segunda vuelta de `evaluatePostAction` de policy-agent (`stage:
  post_action`) dentro de la Step Function real para `eligibility_check`~~
  **RESUELTO:** ver la sección "Decisiones y limitaciones registradas —
  Cierre del gap post_action (PostActionDecide)" al final de este documento
  y `docs/STATUS.md` P0 para el detalle completo (3 estados nuevos en la
  ASL, `terraform apply` real, y QA independiente con 189 tests en verde y
  `terraform plan` sin drift confirmado por el reviewer).
- Política de retención real de `ttl` en `case_store` — SIGUE sin resolver
  (coordinación policy-agent/devops pendiente).

## Decisiones y limitaciones registradas — Cierre del gap post_action (PostActionDecide)

Fase ejecutada para cerrar el riesgo conocido documentado en `docs/STATUS.md`
P0 (`evaluatePostAction` de policy-agent nunca se invocaba dentro de la Step
Function real, por lo que un score de elegibilidad en zona "borderline"
respondía `status: "ok"` en vez de escalar). Detalle técnico completo en
`docs/STATUS.md` P0 — acá el resumen de decisiones para el historial de
`/plan`.

- **`services/policy-agent/src/handler.ts`**: el mismo Lambda ahora acepta
  un segundo modo de invocación, discriminado por un campo `stage:
  "post_action"` a nivel raíz del Payload (ausente -> comportamiento
  `pre_action` de siempre, sin cambios). Decisión de diseño: un solo Lambda
  con discriminador de `stage`, en vez de un handler/Lambda separado, para
  no duplicar la carga de `policies.yaml` ni el rol IAM (que ya es
  "ninguno" más allá de logging).
- **`services/escalation-agent`**: tercer origen `"post_action_decision"`
  agregado a `EscalationOrigin`/`EscalationInput` (`packages/shared` +
  `services/escalation-agent/src`), semánticamente distinto de
  `"policy_decision"` (acá SÍ se completó y verificó una acción antes de
  escalar) y de `"verification_failed"` (acá `Verify` SÍ confirmó
  consistencia; la escalada es una decisión de negocio posterior, no una
  falla de verificación). Reutiliza el mismo `PolicyDecisionResultLike` ya
  definido, sin necesidad de un tipo nuevo.
- **Terraform/ASL**: 3 estados nuevos en
  `terraform/modules/orchestration/asl/chat-orchestrator.asl.json.tftpl`
  entre `Verify` y `RespondAuto` — `PostActionDecide` (Task, invoca
  `policy_agent_lambda_arn`), `RouteByPostAction` (Choice), y
  `EscalateFromPostAction` (Task, invoca `escalation_agent_lambda_arn`,
  termina en el `RespondEscalate` ya existente). `RouteByVerification` usa
  un `And` de dos condiciones (`verified` + `intent == eligibility_check`)
  para rutear a `PostActionDecide` SOLO en el camino de elegibilidad;
  `product_info`/`faq` (`ActRetrieval`) siguen yendo directo de `Verify` a
  `RespondAuto`, sin pasar por esta segunda decisión de negocio (no aplica:
  esos intents no tienen un `EligibilityResult` que reevaluar).
- **IAM: sin cambios.** Los 2 Tasks nuevos invocan Lambdas ya cubiertos por
  `aws_iam_role_policy.sfn_invoke_lambdas` (los 6 ARNs completos) y por los
  `aws_lambda_permission` de recurso ya existentes — no hizo falta ningún
  recurso IAM nuevo, verificado explícitamente antes de aplicar.
- `terraform apply` real: 1 recurso agregado + 3 modificados + 1 destruido
  (`null_resource.build_lambdas` reemplazado por el cambio de código fuente
  de policy-agent/escalation-agent, más la definición de
  `aws_sfn_state_machine.chat_orchestrator` actualizada). `terraform plan`
  posterior sin drift, confirmado DOS VECES de forma independiente (devops
  al aplicar, y el reviewer por separado en su QA).
- Verificado end-to-end contra AWS real con 4 casos reales en total (2 de
  devops + 2 propios del reviewer, en ambos idiomas ES/PT), con evidencia de
  `CloudWatch Logs` confirmando la secuencia real de estados ejecutados en
  cada caso (no solo el resultado JSON final). Ver `docs/STATUS.md` P0 para
  el detalle completo de cada caso.
- QA independiente (reviewer): **189 tests en verde** (183 previos + 6 en
  `policy-agent` + 4 en `escalation-agent`), consistencia de contrato entre
  las 3 piezas verificada leyendo código real, `terraform plan` sin drift
  corrido de forma independiente.

## Pendiente de decidir (actualizado — cierre del gap post_action)

- Ningún ítem nuevo abierto por esta fase. Los pendientes que ya estaban
  documentados en las secciones anteriores de este archivo (proveedor
  Bedrock, `AdministratorAccess` del usuario del proyecto, TTL de
  retención) siguen sin resolver, sin relación con este cierre puntual.

## Decisiones y limitaciones registradas — Días 6-7 (Frontend)

Fase con TRES piezas separadas: una precondición de devops (CORS), el build
de la chat UI y una QA independiente sobre esa entrega. Detalle técnico
completo (incluye los 3 casos reales probados por el reviewer y las
limitaciones explícitas) en `docs/STATUS.md` P0 — acá el resumen de
decisiones para el historial de `/plan`.

- **Precondición de devops — CORS:** antes de que el frontend pudiera
  consumir `POST /chat` desde un navegador, devops agregó
  `cors_configuration` nativo de `aws_apigatewayv2_api` en
  `terraform/modules/edge/main.tf` (`allow_origins` configurable vía la
  variable nueva `cors_allow_origins`, default `["*"]`; `allow_methods:
  POST, OPTIONS`; `allow_headers: content-type`; `max_age: 300`).
  `terraform apply` real (`0 to add, 1 to change, 0 to destroy`, solo
  `module.edge.aws_apigatewayv2_api.this`), sin drift posterior, verificado
  con `curl -X OPTIONS`/`curl -X POST` reales. **Limitación heredada de esa
  fase:** `allow_origins = ["*"]` sumado a la falta de auth/WAF ya conocida
  (Checkpoint 0) significa que cualquier origin puede invocar `POST /chat`
  hoy — a endurecer seteando `cors_allow_origins` a un dominio fijo cuando
  exista uno real para el frontend desplegado.
- **Decisión de stack:** Vite 5 + React 18 + TypeScript para
  `apps/web` (workspace `@banking-agent/web`), sobre el patrón `apps/*` ya
  reservado en los workspaces del monorepo desde el checkpoint 0 pero sin
  contenido real hasta esta fase. Dev server en el puerto 5173.
- **Decisión de reusar tipos en vez de redefinirlos:** el envelope
  `ChatResponse` de `src/types.ts` se construye importando directamente
  `RetrievalResult`, `EligibilityResult`, `EscalationSummary`, `LanguageCode`
  e `Intent` de `@banking-agent/shared` — mismo criterio ya aplicado por
  policy-agent/retrieval-agent/transaction-agent en fases anteriores (código
  como fuente de verdad compartida, no prosa/nombres copiados a mano). Único
  mirror local necesario: `PolicyDecisionLike` (`reason`/`askField`), porque
  `PolicyDecisionResult` no se exporta desde `@banking-agent/shared` — no es
  una redefinición completa del contrato, solo el subconjunto de campos que
  el frontend necesita renderizar.
- **Decisión de `caseId` en `localStorage`:** se genera una única vez por
  navegador/dispositivo con `crypto.randomUUID()`, se persiste en
  `localStorage` y se reusa durante toda la sesión (`turnId` sí es nuevo en
  cada turno). Es una decisión de diseño dentro del contrato existente, no
  un bug — pero implica una limitación explícita: el caso se pierde si el
  usuario borra el storage del navegador o cambia de navegador/dispositivo,
  sin mecanismo de recuperación de `caseId` desde el backend.
- **Decisión de NO simular streaming:** cada respuesta se renderiza completa
  apenas llega del backend, sin efecto de tipeo/typewriter. Razón: no hay
  ningún LLM/Bedrock conectado todavía en el pipeline (ver "Pendiente de
  decidir" — proveedor Bedrock sigue sin resolver), así que no existe una
  fuente de tokens incrementales real que streamear; simular un streaming
  falso sobre una respuesta que ya llegó completa hubiera sido puramente
  cosmético y potencialmente engañoso sobre el estado real del sistema.
  Verificado por el reviewer en su QA: sin `setTimeout`/`setInterval`/lógica
  de "typing" en `apps/web/src/`.
- **QA independiente (reviewer):** 5/5 puntos PASS (build, ausencia de
  streaming falso, ausencia de JSON crudo de `escalation`, 3 casos reales
  contra el endpoint AWS real con UUIDs propios del reviewer, manejo de
  error de red replicado en script aparte) — sin problemas bloqueantes ni
  cosméticos encontrados. Ver `docs/STATUS.md` P0 para el detalle completo
  de cada punto y de las limitaciones conocidas explícitas de esta entrega.

## Pendiente de decidir (actualizado — Días 6-7, Frontend)

- Ningún ítem de "Pendiente de decidir" existente se resuelve con esta fase.
  El proveedor/modelo LLM sobre Bedrock, el reemplazo de
  `AdministratorAccess` del usuario del proyecto y la política de retención
  de `ttl` siguen sin resolver, sin relación con el frontend.

## Decisiones y limitaciones registradas — Días 7-8 (i18n)

- La fase se interrumpió a mitad de camino por un rate-limit de sesión (no
  un error de lógica) y quedó parcialmente aplicada en disco. El coordinador
  auditó el estado real (no confió en el reporte parcial) antes de seguir —
  ver `docs/STATUS.md` P1 para el detalle completo de qué ya estaba hecho
  por los agentes vs. qué corrigió el coordinador al retomar (bug de wiring
  en `build-summary.ts` que hubiera roto el build, `pending-question.ts` sin
  bifurcar por idioma, y el hallazgo de prueba visual real: la UI de
  `App.tsx` tenía las constantes bilingües definidas pero nunca conectadas
  al JSX).
- Decisión: `attemptedActions`/`unresolvedReason` de `EscalationSummary` NO
  se tradujeron — son campos de auditoría interna, no cliente-facing (ver
  fix de la fase Verify+Escalate que ya los sacó del render al cliente). Se
  revisará su idioma solo si en el futuro existe una vista interna real para
  el humano que recibe la escalación.
- Verificación: 193 tests totales (191 + 4 nuevos, uno reemplazado por una
  aserción mejor diseñada tras un falso positivo propio del coordinador —
  "manualmente"/"solicitante" son cognados válidos ES/PT, no sirven para
  detectar mezcla de idiomas), `terraform apply` real (redeploy de
  `escalation-agent` y el resto de Lambdas que empaquetan
  `@banking-agent/shared` por el campo `language` nuevo), `terraform plan`
  sin drift, caso ESCALATE en portugués verificado contra AWS real y en
  browser real (Claude in Chrome) — banner, placeholder y tarjeta de
  escalación completa sin mezcla ES/PT.

## Decisiones y limitaciones registradas — Día 9-10 (Cierre)

Contenido completo (limitaciones, paridad funcional, 4 pilares) en
`docs/STATUS.md` P2 — acá solo el resumen de decisiones para el historial.

- **`README.md` de la raíz creado** — no existía hasta este cierre; era el
  gap más visible del pilar Reproducibility (nadie sin contexto previo tenía
  un punto de entrada al repo). Apunta a cada doc relevante y da un
  quickstart real (tests sin AWS, deploy con Terraform, frontend).
- **`terraform/README.md` actualizado** — había quedado desactualizado
  (describía 4 Lambdas sin verification-agent/escalation-agent, sin mención
  del frontend ni de los estados de Verify/PostActionDecide de la ASL). Se
  corrigió el diagrama de arquitectura, la tabla de módulos, la lista de
  limitaciones (removiendo las ya resueltas, agregando CORS abierto) y se
  agregó la sección de cómo correr el frontend.
- **Verificación del cierre hecha directamente por el coordinador**, no
  delegada a otro ciclo de orchestrator/reviewer — dado que la fase i18n ya
  había mostrado el riesgo de un reporte parcial por rate-limit de sesión,
  y el coordinador ya tenía el contexto completo de las ~10 fases previas
  acumulado en la conversación, escribir el cierre directamente evitó tanto
  ese riesgo como el costo de que un agente nuevo tuviera que re-leer todo
  el historial desde cero.
- Ningún pilar de `docs/EVALUATION-CRITERIA.md` se declaró "resuelto" sin
  evidencia concreta (comando real corrido, no una afirmación) — Security en
  particular se dejó explícitamente como "gap-heavy", no se infló su estado
  para que el cierre se viera mejor de lo que es.

## Decisiones y limitaciones registradas — Fase 2 (infra adicional: Bedrock real, frontend, analytics)

Primera tarea de la fase 2 (extiende el proyecto más allá del cierre P2), ejecutada por devops con QA independiente del reviewer. Alcance acotado a infraestructura — no se tocó `services/*` ni la ASL de la Step Function (confirmado por el reviewer). Detalle técnico completo en `docs/STATUS.md` (nueva sección "Fase 2 — infra adicional") y en los README de `terraform/modules/frontend/`, `terraform/modules/analytics/`, `terraform/modules/agent/`, `terraform/modules/secrets/` — acá el resumen de decisiones para el historial.

- **Modelo Bedrock resuelto:** `us.anthropic.claude-sonnet-5`, un inference profile (no model ID directo) — confirmado empíricamente contra la cuenta real que toda la familia Anthropic disponible ahí requiere `INFERENCE_PROFILE`, no invocación on-demand directa. Esto resuelve la pregunta "Pendiente de decidir" arrastrada desde checkpoint 0 ("Proveedor/modelo LLM concreto sobre Bedrock") — el modelo YA está decidido y el parámetro SSM tiene el valor real, pero la cuenta todavía no tiene el "model access" habilitado (bloqueador de consola, ver `docs/STATUS.md` sección Bloqueadores), así que ningún Lambda puede invocarlo todavía aunque quisiera.
- **Decisión de IAM de Bedrock: diferir a fase C/D, no agregar ahora.** El coordinador recomendó explícitamente mantener el principio ya declarado ("no otorgar un permiso sin código que lo use") en vez de adelantar el IAM para ahorrar un ciclo de `terraform apply` futuro — devops siguió esa recomendación. Razón adicional encontrada por devops: aunque el IAM existiera hoy, el bloqueador de "model access" lo dejaría inútil de todos modos. Documentado en `terraform/modules/agent/README.md`.
- **Módulo `frontend` nuevo, aplicado real:** S3 privado + CloudFront con OAC (no OAI) + bucket policy scoped al ARN de la distribución — mismo nivel de rigor de Security que el resto del proyecto (nunca acceso público directo al bucket). Cierra la limitación "CORS abierto" (`["*"]`) documentada en el cierre P2: `cors_allow_origins` de `module.edge` ahora resuelve al dominio real de CloudFront. Efecto secundario documentado: desarrollo local en `localhost:5173` necesita overridear `cors_allow_origins` temporalmente ahora que el default ya no es `"*"`.
- **Bug real de Terraform/HCL encontrado y corregido:** comparar un `list(string)` contra un literal `["*"]` con `==` da siempre `false` (tipos `tolist` vs `tuple`, sin coacción) — fix con `join(",", ...) == "*"`. Nota técnica dejada en el código para que no se repita.
- **Módulo `analytics` nuevo, código completo pero NO aplicado:** DynamoDB Streams (`case_store`) → Lambda transformer → Kinesis Firehose → S3, particionado por fecha, formato de datos documentado explícitamente para una futura integración de analítica (Databricks u otra, sigue fuera de scope por decisión del usuario). Bloqueado porque **Kinesis Firehose no está disponible en cuentas AWS freemium/free-tier** (confirmado por el usuario, es la cuenta real de este proyecto) — no es falta de suscripción resoluble con un click, requeriría una cuenta de pago. Gateado por `enable_analytics_pipeline = false`, listo para aplicarse sin cambios de código el día que exista una cuenta con Firehose disponible.
- **QA independiente (reviewer):** 5/5 puntos PASS con comandos propios (no repitió los de devops) — `terraform plan` sin drift, invocación real propia a Bedrock (mismo `AccessDeniedException`, confirma que el bloqueador sigue vigente), lectura de código de OAC/bucket policy/IAM scoped, `grep` de 0 permisos Bedrock en `modules/agent`, y confirmación de que `services/*`/ASL no fueron tocados (por timestamps, ya que el repo no tiene commits git todavía — hallazgo adicional del reviewer, recomienda un commit inicial pronto).

## Pendiente de decidir (actualizado — Fase 2, infra adicional)

- ~~Proveedor/modelo LLM concreto sobre Bedrock — SIGUE sin resolver~~
  **RESUELTO por completo, incluido el bloqueador de "model access":** el
  usuario habilitó acceso a Bedrock en la consola, pero el modelo
  originalmente elegido (`us.anthropic.claude-sonnet-5`) seguía dando
  `AccessDeniedException` por una limitación de CUOTA específica de esa
  familia (no de IAM ni de "model access" general). Se cambió a
  **`us.anthropic.claude-sonnet-4-6`**, verificado con una invocación
  `ConverseCommand` real exitosa. `terraform.tfvars`/SSM actualizados y
  aplicados, `terraform plan` sin drift. Detalle completo en
  `docs/STATUS.md`, sección "RESUELTO — acceso a Bedrock habilitado".
- Nuevo bloqueador: Kinesis Firehose no está disponible en la cuenta AWS freemium/free-tier del proyecto — bloquea aplicar `terraform/modules/analytics`. No resoluble sin upgradear a una cuenta de pago. Ver `docs/STATUS.md`, sección Bloqueadores.
- Reemplazar `AdministratorAccess` del usuario `banking-agent-dev` por una policy acotada — SIGUE sin resolver (sin relación con esta fase).
- Política de retención real de `ttl` en `case_store` — SIGUE sin resolver, y ahora con una dimensión nueva: el futuro pipeline de analytics tampoco propaga TTL (documentado en `docs/STATUS.md`).
- Nuevo (encontrado por el reviewer, fuera del alcance original de esta tarea): el repositorio no tiene ningún commit git todavía — recomendado hacer un commit inicial pronto para que las próximas fases sean auditables por diff real.

## Decisiones y limitaciones registradas — Fase C/D (Bedrock real: Understand + Decide)

Segunda tarea de la fase 2. Conecta Bedrock de verdad (invocado por código,
no solo habilitado en infra) en `conversation-agent`/`policy-agent`.
Detalle técnico completo en `docs/STATUS.md`, sección "Fase 2 — Bedrock
real conectado" — acá el resumen de decisiones.

- **Arquitectura confirmada por el usuario, implementada tal cual:** el
  modelo propone (patrón "Jev" — salida tipada + confianza, tool use
  forzado vía Converse API), el evaluador determinístico de `policies.yaml`
  (sin cambios de código) decide de verdad — se reutiliza el mecanismo
  "most-conservative-match-wins" ya existente para combinar reglas entre sí,
  ahora también entre modelo y reglas.
- **Fallback en cascada por diseño, no un parche:** Bedrock no disponible o
  confianza baja → heurística/reglas puras (comportamiento idéntico al de
  antes de esta fase). Un fallo de Bedrock nunca degrada seguridad ni
  pierde el turno — mismo criterio de Reliability de todo el proyecto.
- **IAM de Bedrock agregado ahora** (ya no diferido, como se decidió en la
  fase A) — scoped a conversation-agent/policy-agent únicamente, al ARN del
  inference profile real. Hallazgo real: el inference profile cross-region
  necesitó los ARNs de `foundation-model` en 3 regiones, no solo el del
  inference profile.
- **Segunda interrupción por rate-limit de sesión en este proyecto**
  (la primera fue en la fase i18n). Mismo protocolo: el coordinador auditó
  el estado real en disco/AWS antes de seguir en vez de confiar en el
  reporte parcial — resultó que ya estaba todo funcionando correctamente
  (227 tests, `terraform plan` sin drift, invocación real a Bedrock
  confirmada por CloudWatch Logs), solo faltaba la documentación central y
  los commits.
- **Costo/latencia aumentan** con cada turno (1-2 llamadas a Bedrock) — no
  medido contra tráfico real, nueva limitación explícita de "Capacity
  limits" para el cierre.

## Decisiones y limitaciones registradas — Fase 3 (Pivot: transaction-dispute intake)

Pivot de prioridad basado en el EDA real del dataset del hackathon (`hacka-info/EDA_LATAM_Bank_resumen.md`, contexto local no versionado): el flujo con mejor evidencia de negocio es **transaction-dispute intake** (disputas de cargo no reconocido/cobro indebido), no `credit-product info & eligibility` (que NO se retira, sigue intacto, solo deja de ser el foco). Detalle técnico completo en `docs/STATUS.md`, sección "Fase 3 — Pivot de prioridad" — acá el resumen de decisiones para el historial.

- **Decisión de arquitectura (idea del usuario, validada por el coordinador):** se extendió el pipeline Understand→Decide existente (mismo `Intent`/`Entities` de `packages/shared`, mismo `policies.yaml`) en vez de crear un router/servicios nuevos duplicados. El único componente genuinamente nuevo (el "Act" de disputa) queda para la fase siguiente.
- **Datos:** mock chico (4 clientes, 6 productos, 24 transacciones) con columnas calcadas del data dictionary real del hackathon (`hacka-info/LATAM_Bank_Complete_Data_Dictionary.pdf`, páginas 4/5/8) — nunca se tocó la página 2 de ese PDF (credenciales AWS reales del hackathon). `complaints` deliberadamente no se usa (el EDA mostró que no sirve como fuente de verdad).
- **Contrato:** `Intent` +1 (`dispute_unrecognized_charge`), `Entities` +4 (`disputed_amount`, `merchant`, `transaction_date`, `dispute_reason`). La validación "al menos uno de los tres" es OR y no cabe en `REQUIRED_ENTITIES_BY_INTENT` (semántica AND) — quedó como regla adicional en policy-agent, mismo patrón que `document_type` en eligibility.
- **Umbral de riesgo separado:** `dispute_high_risk_amount_threshold: 15000`, distinto de `high_risk_amount_threshold: 50000` de eligibility — un cargo ya disputado es una señal de alarma distinta a un préstamo solicitado.
- **`is_repeat_complainer` descartado por esta fase:** no hay dato de historial cross-case disponible hoy (`UnderstandContext.historyTurns` es solo del case actual) — requeriría una query nueva de infra, fuera de scope.
- **QA en dos rondas:** 275 tests (ronda 1) → 279 tests (ronda 2, tras cerrar un gap real de cobertura de test en las reglas nuevas de policy-agent que encontró el reviewer). Sin regresión en el flujo viejo.
- **Incidente de concurrencia entre agentes:** un `git stash`/`reset` repo-wide durante el trabajo en paralelo de dos agentes, resuelto por ambos de forma independiente y verificado por el reviewer sin pérdida de datos. Stash dejado sin dropear como red de seguridad hasta confirmar el commit de esta fase.

## Fase Dispute 2 — Act/Verify/Escalate + infra real + 2 bugs encontrados y arreglados (2026-09-28)

Cierra todos los pendientes que dejó Fase 3. Detalle técnico completo (causa raíz, fix, verificación) en `docs/STATUS.md`, sección "Fase Dispute 2" — acá el resumen para el historial.

- **Act de disputa** (`computeDisputeVerification`, `transaction-agent`), `verification-agent`/`escalation-agent` extendidos, `post_action_rules` de disputa CONFIRMADAS en `policies.yaml`, y ASL/Terraform desplegados a AWS real — los 4 pendientes que dejó Fase 3 ya no aplican.
- **Bug crítico encontrado y arreglado:** el guardrail de Bedrock de policy-agent escalaba TODA disputa a ciegas — el prompt de sistema (`model-decider.ts`) describía únicamente la forma de `EligibilityResult`, sin ningún conocimiento del shape de `DisputeVerificationResult` ni del intent `dispute_unrecognized_charge`. Fix verificado con 53 tests + 5/5 casos reales contra Amazon Bedrock (`us.anthropic.claude-sonnet-4-6`) coincidiendo con la política de negocio. Desplegado.
- **Segundo bug encontrado y arreglado** (durante la verificación E2E real del primero): `conversation-agent` perdía el intent de disputa activo al responder una pregunta CLARIFY — `lastIntent` se persistía pero nunca se leía de vuelta. Fix (`resolveEffectiveIntent`) verificado con 6 tests + conversación real de 2 turnos completada end-to-end contra la API desplegada. Desplegado.
- **331 tests** en verde (sin regresión), pipeline de disputa completo corriendo end-to-end contra AWS real, confirmado con `curl` real, no solo localmente.
- `is_repeat_complainer`/`dispute_status_check` siguen fuera de scope, mismas razones que Fase 3.
- Los pendientes ya existentes de fases anteriores (política de retención de `ttl`, `AdministratorAccess` del usuario del proyecto, hardening de Security) siguen sin resolver, sin relación con este pivot.
- Limpieza del `git stash` dejado como red de seguridad durante el incidente de concurrencia de Fase 3 — corresponde al usuario confirmarlo y limpiarlo.

## Fase ML — evaluación del "learned component" (2026-09-28)

Detalle técnico completo en `docs/STATUS.md`, sección "Fase ML" — acá el resumen para el historial.

- **Harness de evaluación del guardrail de Bedrock** (`services/policy-agent/scripts/evaluate-decide-stage.ts`): baseline (reglas solas) vs. sistema propuesto (+ Bedrock), 17 casos held-out, 16/17 correctos contra Bedrock real. `docs/EVALUATION-DECIDE-STAGE.md`.
- **Clasificador de fraude entrenado** (`ml/`, Python): dataset real completo descargado (4.4M transacciones + customers/products/daily_exchange_rates). Resultado: **el modelo entrenado NO supera al baseline `fraud_score`** — probado con 2 familias de modelo, PR-AUC ~= base rate incluso in-sample. Decisión del usuario: dejarlo documentado como hallazgo negativo honesto (`ml/REPORT.md`), sin integrar en vivo — `compute-dispute.ts` sigue sin tocarse.
- Ambos bloques cumplen el requisito del PDF del hackathon (pág. 4: "evaluate at least one learned component against an appropriate baseline") — uno con resultado positivo (Bedrock), uno con resultado negativo honesto (fraude entrenado), ambos con leakage prevention y held-out evaluation documentados.
