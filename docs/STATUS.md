## Decisión de alcance y arquitectura
- [x] Flujo elegido: **credit-product info & eligibility** (info de producto vía catálogo
      estático + elegibilidad vía regla de scoring determinística; no depende de
      dataset real de ML, ver docs/DATASETS.md si se documenta la investigación)
- [x] Target de arquitectura: **AWS real con Terraform**, siguiendo el blueprint en
      `E2E-documentacion-tecnica/E2E-Implementacion-AWS-Terraform-Databricks.md`
      (no un mock desechable) — API Gateway/ingress, Step Functions u orquestación
      equivalente, DynamoDB, Bedrock, EventBridge, Lambda por tool
- [ ] Duración del proyecto: **10 días**. Objetivo: producto completo, no solo demo
      de superficie. El entregable final debe incluir una sección explícita de
      **limitaciones conocidas** (lo que no se llegó a cubrir/hardening pendiente)
- Nota: la infraestructura (compute, orquestación, storage) es real AWS; los
  **datos bancarios siguen siendo simulados** (no hay acceso a un banco real) —
  eso no cambia con la decisión de arquitectura.

## P0 — pipeline end-to-end (sobre AWS real)
- [x] Terraform base: edge (API Gateway HTTP scaffold) + data (DynamoDB
      case/session/conversation store) + secrets (SSM/Secrets Manager) — ver
      devops.md. Módulos `messaging`, `orchestration`, `agent`,
      `observability` quedan como placeholders (carpeta + README "pendiente —
      fase X") sin recursos reales, a implementar en fases siguientes de
      docs/PLAN.md. Validado con `terraform fmt`/`init`/`validate` (éxito);
      decisiones y limitaciones registradas en docs/PLAN.md.
- [x] conversation-agent: router de intención + detección de idioma ES/PT (por
      mensaje, no por sesión) + context manager con estado persistido en la
      tabla DynamoDB real `banking-agent-dev-case-store` (dos tipos de item
      por caseId: `MSG#<messageId>` log append-only y `STATE#latest` upserted,
      ver `docs/CONTRACTS.md` sección 7). Contrato de salida
      `{intent, language, entities, missing_fields, context}` documentado en
      `docs/CONTRACTS.md`, con fuente de verdad en código en
      `packages/shared/src/contracts/understand-output.ts`. Runtime: Node.js
      20.x + TypeScript, handler listo para Lambda en
      `services/conversation-agent/` (aún no conectado a la ruta `POST /chat`
      de `terraform/modules/edge` — pendiente de devops). Reliability:
      reintentos acotados (2) + fallback seguro documentado si DynamoDB falla
      (`context.degraded`/`degradedReason`, nunca inventa datos ni pierde el
      turno; nunca repregunta lo ya guardado cuando la lectura funciona).
      Build y tests verificados en verde por reviewer (QA independiente,
      `npm install`/build/test desde raíz: 24 tests en
      `services/conversation-agent` + 5 en `packages/shared`). Limitaciones:
      detección de idioma/extracción de entities es heurística
      (regex/keywords, sin NLP/LLM), sin resolución de moneda/país, cobertura
      parcial de formatos de documento LATAM, sin JSON Schema formal, sin auth
      en `/chat` (pendiente devops) — detalle completo en `docs/CONTRACTS.md`
      sección 8.

      **Actualización (bug de detección de idioma encontrado por QA contra
      AWS real):** el reviewer (QA independiente, con acceso real a la Step
      Function) probó los 3 casos de referencia traducidos a portugués contra
      el pipeline desplegado y encontró que `detectLanguage` clasificaba
      incorrectamente como `"es"` frases naturales en PT que usan "quero"
      como única señal fuerte (`"quero falar com um atendente"`, `"quero
      falar com uma pessoa"`, `"quero saber os requisitos"`). Causa raíz en
      `countMatches()` (`services/conversation-agent/src/router/
      language-detector.ts`): el chequeo tenía un fallback
      `|| normalized.includes(word)` de substring crudo sin límite de
      palabra, agregado para capturar una keyword pegada a puntuación final
      (ej. `"que?"`) — pero ese mismo fallback hacía que la palabra española
      `"que"` (en `ES_STRONG_WORDS`) matcheara como substring dentro de
      `"quero"`, sumando 1 a `esScore` en cada mensaje con "quero" y
      empatando con `ptScore` (ya que `"quero"` completo también está en
      `PT_STRONG_WORDS`); el empate caía al default documentado `"es"`. Fix
      aplicado: se eliminó el fallback de substring crudo y, en su lugar, se
      quita la puntuación del texto (`stripPunctuation()`, regex Unicode
      `/[^\p{L}\p{N}\s]/gu` que preserva acentos/ñ/ã/õ/ç) antes de armar el
      texto normalizado, de forma que una palabra pegada a un signo quede
      igual delimitada por espacios — se preserva la intención original del
      fallback (capturar puntuación) sin el efecto secundario de matchear
      substrings dentro de otra palabra. El chequeo queda únicamente sobre
      `` normalized.includes(` ${word} `) ``, por lo que cualquier colisión
      de substring futura entre `ES_STRONG_WORDS`/`PT_STRONG_WORDS` queda
      eliminada por diseño (matching solo de palabra completa), sin
      necesidad de excepciones ad-hoc por palabra. Tests de regresión
      agregados en `services/conversation-agent/test/
      language-detector.test.ts` (los 3 casos reportados por QA + un caso de
      puntuación final para confirmar que no se rompió la intención
      original del fallback) y 2 tests de integración nuevos en
      `test/intent-router.test.ts` que encadenan `detectLanguage` real (no
      un parámetro `language` fijo) con `routeIntent` para el caso
      `"quero falar com..."` → `escalation_request`/`pt`. Build y tests
      verificados por el propio autor: `npm run build && npm test` en
      `services/conversation-agent` (31 tests en verde) y desde la raíz del
      monorepo (121 tests en verde en total, sobre los 114 previos — sin
      regresiones en `retrieval-agent`/`transaction-agent`/`policy-agent`).
      Limitación conocida que sigue sin resolverse: el resto de los tests
      de `intent-router.test.ts` sigue pasando `language` como parámetro
      fijo en vez de derivarlo de `detectLanguage` real — se agregaron 2
      tests de integración puntuales para el caso reportado, pero no se
      migró la suite completa a integración real en este checkpoint.
- [x] policy-agent: `policies.yaml` (raíz del repo) con reglas AUTO/CLARIFY/
      ESCALATE explícitas y auditables (no lógica en prompt) para
      credit-product info & eligibility, referenciando literalmente los
      campos del contrato de conversation-agent (sin discrepancias, verificado
      por reviewer). Modelo de evaluación "most-conservative-match-wins"
      (severidad ESCALATE > CLARIFY > AUTO; se consideran todas las reglas que
      matchean, no solo la primera) con fallback por defecto ESCALATE si
      ninguna regla matchea (nunca AUTO por default). Incluye 10 reglas
      `pre_action` (operativas ya) y 3 reglas `post_action`. **Actualización
      (Días 3-5):** el contrato `EligibilityResult` de las reglas
      `post_action` quedó **CONFIRMADO** (`post_action_contract_status:
      CONFIRMED` en `policies.yaml`) una vez que transaction-agent lo
      implementó en `packages/shared/src/contracts/eligibility-result.ts`
      y resolvió las 3 preguntas abiertas (escala 0-100, `score_zone`
      calculado por transaction-agent leyendo `config.borderline_score_min/
      _max` de este mismo `policies.yaml` en runtime, correlación por
      `caseId`+`turnId`); `services/policy-agent/src/evaluator.ts` fue
      actualizado para usar `EligibilityResult` de `@banking-agent/shared`
      en vez de la interfaz local `EligibilityResultProposal` (mismo shape,
      sin cambios de lógica en las reglas). Evaluador de referencia en
      TypeScript en `services/policy-agent/` (build y 15 tests verificados
      en verde por reviewer antes de esta confirmación de contrato).
      NOTA DE HONESTIDAD: esta confirmación de contrato en `evaluator.ts`
      no fue recompilada/re-testeada por el propio autor en esta sesión
      (sin acceso a shell) — el reviewer debe correr `npm install`/`npm run
      build`/`npm test` desde la raíz y confirmar que los 106 tests
      conocidos siguen en verde. Sección `security` explícita: PII
      (`entities.document_id`) nunca en `reason`/logs, identificador
      enmascarado para escalation-agent (coordinación pendiente, fase 4).
      Limitaciones: sin validación cruzada YAML↔TS automática (consistencia
      mantenida a mano), umbral de monto (`high_risk_amount_threshold`) sin
      resolución de moneda; las reglas `post_action` ya son ejecutables
      (contrato confirmado) pero todavía no están conectadas a un
      orquestador end-to-end desplegado en AWS.

      **Actualización (conexión del pipeline sobre AWS real):** policy-agent
      SÍ está conectado a un orquestador real desplegado en AWS —
      `terraform/modules/orchestration` (Step Function Express) lo invoca
      como el paso "Decide", usando un handler nuevo
      (`services/policy-agent/src/handler.ts`, JSON plano sin envoltura de
      API Gateway porque este Lambda nunca se expone públicamente) que solo
      conecta `evaluatePreAction` (`stage: pre_action`). `evaluatePostAction`
      (`stage: post_action`, score de elegibilidad) sigue sin conectarse a un
      orquestador real — transaction-agent calcula el score pero nada invoca
      todavía `evaluatePostAction` con ese resultado en producción (ver
      limitación de transaction-agent más abajo).
- [x] retrieval-agent: parte informativa de la capa Act — catálogo de
      productos de crédito (tasas, requisitos, plazos, montos para los 4
      `ProductType` reales) + 8 FAQs del flujo de crédito, redactadas a mano
      en español y portugués (no traducción automática literal), para los
      intents `product_info`/`faq` ya autorizados por policy-agent
      (`decision === "AUTO"`). Cada dato retornado lleva su propio campo
      `source` explícito (`"internal_catalog_v1"` para el seed de este
      checkpoint) — nunca se inventa/extrapola una tasa o condición fuera de
      la fuente; si el producto/idioma pedido no está catalogado, o si la
      fuente no responde, la respuesta es `found: false` con una nota
      explícita (nunca una alucinación ni una excepción sin manejar). Runtime:
      Node.js 20.x + TypeScript, handler listo para Lambda en
      `services/retrieval-agent/` (no conectado a API Gateway todavía).
      Contrato de salida `RetrievalResult` agregado a
      `packages/shared/src/contracts/retrieval-result.ts` (mismo estilo que
      `understand-output.ts`). Reliability: `CatalogRepository` distingue
      `found`/`not_found`/`unavailable`; `DynamoDbCatalogRepository` replica
      el patrón de reintentos acotados (2, backoff corto) + fallback seguro
      de `conversation-agent/state-store.ts`, probado solo con el cliente de
      DynamoDB mockeado. Decisión de infra: catálogo modelado en **DynamoDB**
      (no S3), mismo patrón `pk`/`sk` que `banking-agent-dev-case-store`
      (`pk = PRODUCT#<productType>`/`FAQ#<faqId>`, `sk = INFO` para producto,
      `sk = INFO#<language>` para FAQ, `PAY_PER_REQUEST`, sin GSI, sin TTL).
      **Actualización (coordinación con devops):** tabla
      `banking-agent-dev-product-catalog` ya creada por devops en Terraform;
      el Lambda real pasa a `CATALOG_BACKEND=dynamodb` +
      `CATALOG_TABLE_NAME=banking-agent-dev-product-catalog` vía variables de
      entorno del Lambda (sin cambiar el default en código, que sigue siendo
      `"static"` para tests/local). Poblado de la tabla vía
      `services/retrieval-agent/scripts/seed-catalog.ts` (nuevo), invocado
      por devops una vez por `terraform apply` (`null_resource` +
      `local-exec`); `PutCommand` es idempotente para `pk`/`sk` + contenido
      determinístico, así que re-correr el seed en cada apply mantiene la
      tabla sincronizada con `src/data/catalog.ts` (única fuente de verdad,
      nunca duplicada en HCL). Corrección de schema aplicada como decisión
      (no bug oculto): el `sk` de FAQ es `INFO#<language>` y no `INFO`
      literal, porque cada `id` de `FAQS` tiene una variante `es` y una `pt`
      -con `sk = "INFO"` fijo la segunda escritura pisaría a la primera-. El
      seed escribe el campo `faqId` (no `id`) en el item, para alinear con
      lo que `itemToFaq()` de `dynamodb-catalog-repository.ts` lee.
      Reliability del script de seed: criterio deliberadamente opuesto al de
      los handlers de Lambda -falla ruidosamente (`process.exit(1)`) si una
      escritura falla, en vez de degradar a un fallback seguro, para que
      `terraform apply` nunca deje la tabla parcialmente poblada en
      silencio-. Backend por defecto de este checkpoint en código:
      `CATALOG_BACKEND=static` (seed versionado en `src/data/catalog.ts`),
      seleccionable vía variable de entorno.
      Test de integración real agregado
      (`test/pipeline-integration.test.ts`): carga `policies.yaml` real,
      llama `evaluatePreAction` del paquete compilado
      `@banking-agent/policy-agent` y encadena con `handleRetrieval` para
      `product_info`/`faq` (AUTO) y documenta por test el caso CLARIFY (sin
      invocar retrieval-agent). Corregido bug preexistente en el script
      `build` de la raíz (faltaba compilar `policy-agent` en la cadena).
      Build y tests verificados por el propio autor (no solo por reviewer
      posterior): `npm install`/`npm run build`/`npm test` desde la raíz,
      **72 tests en verde en total** (5 `packages/shared` + 24
      `conversation-agent` + 15 `policy-agent` + 28 `retrieval-agent`).
      Limitaciones: catálogo es un seed estático simulado, no un feed real
      de tasas; `Scan` sin GSI para listar FAQs por idioma (aceptable para
      el tamaño de esta tabla); sin i18n-agent review formal del contenido
      ES/PT todavía.
      **Actualización (coordinación con devops — tabla DynamoDB real +
      seeding):** la limitación "tabla DynamoDB propuesta no desplegada" de
      este checkpoint quedó resuelta: devops creó
      `banking-agent-dev-product-catalog` en Terraform y el Lambda real usa
      `CATALOG_BACKEND=dynamodb` vía variables de entorno (ver detalle en el
      párrafo de arriba y en `services/retrieval-agent/README.md`). Se
      agregó `services/retrieval-agent/scripts/seed-catalog.ts` (con la
      función pura `buildCatalogItems()` testeada en
      `test/seed-catalog.test.ts`, 4 tests nuevos) para poblar la tabla
      desde `src/data/catalog.ts`, y se corrigió el docstring de
      `dynamodb-catalog-repository.ts` para reflejar el schema real de FAQ
      (`sk = INFO#<language>`, no `INFO` literal). Build y **32 tests en
      verde en `retrieval-agent`** (28 previos + 4 del seed) verificados por
      el propio autor con `npm run build`/`npm test` en este workspace y
      desde la raíz del monorepo (sin regresiones en los demás workspaces).

      **Actualización (conexión del pipeline sobre AWS real):** el Lambda
      real de retrieval-agent está desplegado (`banking-agent-dev-retrieval-agent`)
      y conectado como el paso `ActRetrieval` de la Step Function
      (`terraform/modules/orchestration`), invocado SOLO cuando
      `RouteByDecision: AUTO` + `intent` en `{product_info, faq}` — la
      garantía "solo AUTO invoca retrieval-agent" pasó de ser un contrato
      probado por test a estar forzada por IAM (ningún otro rol de ejecución
      tiene `lambda:InvokeFunction` hacia este Lambda salvo la Step Function,
      con `source_arn` scoped a ella; ver `docs/EVALUATION-CRITERIA.md`,
      pilar Security). Verificado con `DynamoDbCatalogRepository` real contra
      la tabla real (antes solo se había probado con el cliente de DynamoDB
      mockeado) mediante `aws stepfunctions start-sync-execution` y `curl`
      contra el endpoint HTTP real — ver `terraform/README.md`.
- [x] transaction-agent equivalente: cálculo de elegibilidad (regla
      determinística, Lambda con idempotency key) para `intent:
      eligibility_check` ya autorizado por policy-agent
      (`decision === "AUTO"` en `stage: pre_action`). Fórmula determinística
      con 4 factores (base 50, clamp [0,100]): `employment_status`
      (`employed` +20, `self_employed`/`retired` +10, `student` -10,
      `unemployed` -100 defensivo), ratio `requested_amount/income` como
      PROXY de deuda/ingreso (no hay campo de deuda real en `Entities`;
      `<=2` +20, `<=4` +10, `<=6` 0, `>6` o datos incompletos/`income<=0`
      -30), `existing_customer` (+10 si true), y `requested_amount > 30000`
      (-10). Contrato `EligibilityResult` agregado a
      `packages/shared/src/contracts/eligibility-result.ts` (mismo shape
      literal que `EligibilityResultProposal` de
      `services/policy-agent/src/evaluator.ts`), resolviendo las 3
      preguntas abiertas que `policies.yaml` dejaba explícitas antes de
      `post_action_rules`: (1) escala 0-100 confirmada; (2) `score_zone` la
      calcula transaction-agent leyendo
      `config.borderline_score_min`/`_max` directamente de `policies.yaml`
      en runtime (nunca hardcodeado, evita desincronización con
      policy-agent); (3) correlación por `caseId`+`turnId` vía un item
      adicional en la MISMA partición `pk = CASE#<caseId>` de
      `banking-agent-dev-case-store` (`sk = RESULT#eligibility#<turnId>`),
      decisión que sobrevive a un eventual cambio a cálculo asíncrono.
      Idempotencia obligatoria: `idempotencyKey = "${caseId}:${turnId}"`,
      `computeEligibility` siempre hace `getResult` antes de calcular y
      nunca recalcula si ya existe un resultado persistido (probado
      explícitamente contando invocaciones de `GetCommand`/`PutCommand`
      sobre un cliente DynamoDB mockeado). Reliability: reintentos acotados
      (2, backoff corto, mismo patrón que conversation-agent/retrieval-agent)
      y fallback seguro que NUNCA fabrica un resultado -- si DynamoDB falla
      tras agotar los reintentos (lectura o escritura), se lanza
      `EligibilityUnavailableError` tipado (con `reason` explícito) en vez
      de devolver un score inventado; el handler de Lambda lo atrapa y
      responde `{status: "unavailable"}`, nunca un 5xx. Logging estructurado
      correlacionado por `caseId`/`turnId` en cada paso. Runtime: Node.js
      20.x + TypeScript, handler listo para Lambda en
      `services/transaction-agent/` (no conectado a API Gateway todavía).
      Test de integración real agregado
      (`test/pipeline-integration.test.ts`): carga `policies.yaml` real,
      encadena `evaluatePreAction` (paquete compilado
      `@banking-agent/policy-agent`) -> `computeEligibility` ->
      `evaluatePostAction` para las 3 zonas de score (approved/
      borderline/declined, con el cálculo esperado documentado en
      comentario) y documenta por test el caso `unemployed` (ESCALATE en
      `pre_action`, transaction-agent nunca debería ser invocado). Build y
      tests verificados por el propio autor: `npm install`/`npm run
      build`/`npm test` desde la raíz, **106 tests en verde en total** (5
      `packages/shared` + 24 `conversation-agent` + 15 `policy-agent` + 28
      `retrieval-agent` + 34 `transaction-agent`). Limitaciones: ratio
      `requested_amount/income` es un PROXY de deuda/ingreso, no deuda real
      del cliente (el contrato `Entities` no tiene ese campo); `PutCommand`
      de `DynamoDbEligibilityStore` sin `ConditionExpression` atómica (dos
      invocaciones concurrentes, no secuenciales, podrían ambas calcular y
      escribir -- el cálculo es determinístico así que coincidirían en la
      práctica, pero no está garantizado a nivel de infraestructura).

      **Actualización (conexión del pipeline sobre AWS real):** el Lambda
      real de transaction-agent está desplegado
      (`banking-agent-dev-transaction-agent`) y conectado como el paso
      `ActTransaction` de la Step Function (`terraform/modules/orchestration`),
      invocado SOLO cuando `RouteByDecision: AUTO` + `intent ==
      eligibility_check` — misma garantía forzada por IAM que
      retrieval-agent (ver arriba). El cálculo sigue siendo síncrono dentro
      de la ejecución de la Step Function (Express, no Standard) — no hay
      cola de turnos separada (`modules/messaging` queda sin recursos por
      decisión confirmada, ver `terraform/modules/messaging/README.md`, no
      por estar pendiente). **Limitación que SIGUE sin resolverse:** el
      resultado de `computeEligibility` (`EligibilityResult`) no vuelve a
      pasar por `evaluatePostAction` de policy-agent dentro de la Step
      Function real — la ASL actual (`RespondAuto`) responde directo el
      resultado de `ActTransaction` sin una segunda vuelta de "Decide"
      (`stage: post_action`) que podría convertir un score en zona
      `borderline` en un `ESCALATE`. Esto es un placeholder explícito de la
      fase de conexión inicial (ver `Comment` de la definición ASL en
      `terraform/modules/orchestration/asl/chat-orchestrator.asl.json.tftpl`),
      no un descuido silenciado — a resolver junto con verification-agent/
      escalation-agent (ver bullets de abajo).
- [x] verification-agent: confirma resultado real antes de reportarlo (patrón
      `complete`/estado, no asumir éxito) — **implementado en
      `services/verification-agent` (34 tests)** y conectado como el Task
      `Verify` de la Step Function real
      (`terraform/modules/orchestration/asl/chat-orchestrator.asl.json.tftpl`),
      inmediatamente después de `ActRetrieval`/`ActTransaction` en el camino
      AUTO, antes de responder al usuario. Es una SEGUNDA verificación
      independiente, no un passthrough: recalcula `score_zone` desde
      `policies.yaml` (mismos `config.borderline_score_min`/`_max` que ya
      usa transaction-agent) para `EligibilityResult` y lo compara contra lo
      que ya calculó transaction-agent, y valida que `RetrievalResult` tenga
      `source` explícito cuando `found: true`. Fallback seguro: cualquier
      fallo interno de verification-agent se reporta como
      `pending_confirmation`, nunca como `verified` por default (nunca
      "asume éxito" ni siquiera ante su propio error). IAM mínimo: solo
      `AWSLambdaBasicExecutionRole` (sin acceso a DynamoDB, sin
      `lambda:InvokeFunction`). Verificado contra AWS real: caso `faq` AUTO
      y caso `eligibility_check` con score no-borderline, ambos terminan en
      `status: "ok"` después de pasar por `Verify` (ver `RouteByVerification`
      en la ASL).
- [x] escalation-agent: handoff estructurado (contrato tipo Publish Response:
      content/choices/clarifications, nunca transcript crudo) —
      **implementado en `services/escalation-agent` (28 tests, incluye un
      test de seguridad explícito de no-filtración de PII con defensa en
      profundidad: enmascarado + redacción recursiva de respaldo)**.
      Reemplaza el placeholder `RespondEscalate` — la Step Function ya no
      responde directo el `policyDecision` crudo en el camino ESCALATE.
      **Decisión de diseño del coordinador:** escalation-agent se invoca
      desde DOS orígenes distintos, no solo uno — (1) `policy_decision`
      (Task `EscalateFromPolicy`), cuando policy-agent decide `ESCALATE` en
      `pre_action` (el reemplazo directo del placeholder pedido
      originalmente), y (2) `verification_failed` (Task
      `EscalateFromVerification`), cuando verification-agent marca un
      resultado AUTO como `pending_confirmation` (extensión deliberada: en
      vez de dejar ese caso como un JSON crudo sin resumen humano, se lo
      trata también como una escalación con resumen estructurado — es
      exactamente el escenario que describe el propio requisito del
      resumen, "qué se intentó automáticamente y por qué no se pudo
      resolver"). Produce `EscalationSummary`
      (`packages/shared/src/contracts/escalation-summary.ts`): intención
      del usuario, datos conocidos (`knownEntities`, con `document_id`
      EXCLUIDO del todo — nunca ni enmascarado ahí), `maskedDocumentId`
      (últimos 4 caracteres visibles, resto enmascarado, con una segunda
      pasada de redacción recursiva por si algún `reason` ajeno llegara a
      incluir el valor crudo por error), `attemptedActions`,
      `unresolvedReason`, `pendingQuestion`. Cumple la regla
      `sec-masked-identifier-for-escalation` de `policies.yaml` (ver
      sección `security` de ese archivo, ahora marcada como RESUELTA).
      Nunca lanza — fallback de mejor esfuerzo ante input malformado, con
      `pendingQuestion` nunca nulo en ese camino. IAM mínimo: solo
      `AWSLambdaBasicExecutionRole`, sin variables de entorno. Verificado
      contra AWS real: `"quiero hablar con un asesor"` → `status:
      "escalate"` con `escalation` = `EscalationSummary` completo (ya no el
      `policyDecision` crudo). **Limitación que sigue sin resolverse:** el
      camino `CLARIFY` (`RespondClarify`) NO pasa por escalation-agent — se
      sigue respondiendo directo el `policyDecision` de policy-agent en ese
      camino, porque el resumen estructurado de escalation-agent modela un
      hand-off a un humano, no una repregunta al propio usuario; no se
      identificó necesidad de cambiar `RespondClarify` en esta fase.
- [x] frontend: chat UI básico funcional (apps/web) consumiendo el contrato —
      fase con TRES piezas separadas: (1) CORS habilitado por devops como
      precondición, (2) la chat UI construida en esta fase, (3) QA
      independiente del reviewer sobre la entrega.

      **(1) CORS (devops, precondición de esta fase):** se agregó
      `cors_configuration` nativo de `aws_apigatewayv2_api` en
      `terraform/modules/edge/main.tf` (`allow_origins = var.cors_allow_origins`
      con default `["*"]`, `allow_methods = ["POST", "OPTIONS"]`,
      `allow_headers = ["content-type"]`, `max_age = 300`), variable nueva
      `cors_allow_origins` agregada en `terraform/modules/edge/variables.tf` y
      con pass-through en `terraform/envs/dev/variables.tf`/`main.tf`.
      `terraform plan`: `0 to add, 1 to change, 0 to destroy` (solo
      `module.edge.aws_apigatewayv2_api.this`); `terraform apply` real
      aplicado con éxito contra la cuenta AWS del proyecto, `terraform plan`
      posterior sin drift. Verificado con `curl -X OPTIONS` (204, headers
      `access-control-allow-origin: *` / `access-control-allow-methods:
      OPTIONS,POST` / `access-control-allow-headers: content-type`) y con
      `curl -X POST` real (200, misma respuesta funcional de siempre, más el
      header CORS agregado, sin regresión). **Limitación documentada por
      devops en `terraform/modules/edge/README.md`:** `allow_origins = ["*"]`
      combinado con la falta de auth/WAF ya conocida (ver Checkpoint 0)
      significa que cualquier origin puede invocar `POST /chat`; a endurecer
      más adelante seteando `cors_allow_origins` a un dominio fijo cuando
      exista uno real.

      **(2) Frontend (`apps/web`):** workspace nuevo `@banking-agent/web`
      (React 18 + Vite 5 + TypeScript, puerto 5173 en dev), agregado a los
      workspaces del monorepo bajo el patrón `apps/*` ya declarado en el
      `package.json` raíz desde el checkpoint 0 (ahora con contenido real por
      primera vez). Archivos principales: `src/types.ts` (envelope
      `ChatResponse` construido sobre tipos reales importados de
      `@banking-agent/shared` — `RetrievalResult`, `EligibilityResult`,
      `EscalationSummary`, `LanguageCode`, `Intent` — sin redefinirlos; el
      único mirror local es `PolicyDecisionLike` con `reason`/`askField`,
      necesario porque `PolicyDecisionResult` no se exporta desde
      `@banking-agent/shared`), `src/api.ts` (`sendChatMessage`, que nunca
      lanza: siempre resuelve `{ok: true, data}` o `{ok: false, error}`, con
      try/catch separado para el `fetch` y para el `.json()`), `src/labels.ts`
      (mapeo de keys crudas a etiquetas legibles en español),
      `src/components/{LanguageBadge,BotResponse,EscalationCard,
      MessageBubble}.tsx`, y `src/App.tsx` (`caseId` generado una única vez
      con `crypto.randomUUID()` y persistido en `localStorage`, reusado
      durante toda la sesión; `turnId` nuevo en cada turno; historial
      cronológico completo visible; badge de idioma detectado tanto global
      como por mensaje; banner explícito cuando la conversación fue
      transferida a un humano — nunca ambiguo). **Desviación deliberada y
      documentada:** sin streaming falso — no hay LLM/Bedrock conectado
      todavía (ver "Pendiente de decidir" en `docs/PLAN.md`), así que cada
      respuesta se renderiza completa apenas llega, en vez de simular un
      efecto de tipeo. `EscalationCard` nunca hace `JSON.stringify` del
      objeto `escalation` (lo renderiza campo por campo con las etiquetas de
      `labels.ts`); `KnownEntitiesSummary` de `@banking-agent/shared` excluye
      `document_id` a nivel de TIPO (no solo por convención de código, igual
      que ya hace `EscalationSummary` del lado de escalation-agent). Build de
      producción exitoso: `tsc --noEmit && vite build` sin errores, genera
      `apps/web/dist/`.

      **(3) QA independiente (reviewer), 5 puntos, TODOS PASS:** (a) build —
      `npm run build --workspace=@banking-agent/web` compila sin errores TS y
      genera `dist/`; (b) sin streaming falso — grep de
      `setTimeout|setInterval|typewriter|typing` en `apps/web/src/` sin
      resultados, confirmado además por lectura de código; (c) sin JSON crudo
      en escalación — cero `JSON.stringify` de `escalation` en
      `apps/web/src` (el único uso de `JSON.stringify` en todo el frontend es
      el body saliente en `api.ts`), `document_id` excluido a nivel de tipo;
      (d) 3 casos reales probados por el reviewer CON SUS PROPIOS UUIDs
      (distintos a los usados durante el build, prueba independiente real)
      contra el endpoint AWS real
      `https://kr49s6ij26.execute-api.us-east-1.amazonaws.com/chat`: "Hola,
      quiero información sobre tarjetas de crédito" → `status: "ok"`,
      `intent: "product_info"`, `result.found: true`; "quiero saber si
      califico para un prestamo" → `status: "clarify"`,
      `policyDecision.askField: "income"`; "quiero hablar con un asesor" →
      `status: "escalate"`, `escalation.origin: "policy_decision"` (dev
      server levantado con `npm run dev --workspace=@banking-agent/web` en el
      puerto 5173, `curl` → 200, apagado correctamente al terminar); (e)
      manejo de error de red — el reviewer replicó el patrón exacto de
      `api.ts` en un script Node aparte apuntando a un host inexistente y
      confirmó que el `catch` resuelve `{ok: false, error: "No se pudo
      conectar..."}` sin lanzar excepción, consistente con el render del
      `error-card` en `MessageBubble.tsx`. Conclusión del reviewer: "los 5
      puntos pasan con evidencia concreta, no encontré problemas reales
      (bloqueantes ni cosméticos)".

      **Limitaciones conocidas explícitas de esta entrega (documentadas
      tanto por el autor del frontend como por el reviewer):** no se probó en
      un navegador gráfico real (no disponible en este entorno de
      desarrollo) — solo integración de red real verificada por `curl` (los
      3 casos de arriba más el build) y revisión manual componente por
      componente de la lógica de render contra los payloads reales
      recibidos; no hay tests automatizados (unit/component, ej. Vitest +
      Testing Library) para los componentes de React todavía; el caso
      `status: "unavailable"` no se pudo disparar contra AWS real (es un
      fallo interno del pipeline, no reproducible a demanda) — se validó
      solo por lectura de código más la prueba del path de error de red
      genérico; `caseId` vive solo en `localStorage` (decisión de diseño
      dentro del contrato, no un bug) — se pierde si el usuario borra el
      storage o cambia de navegador/dispositivo.

      **Fix post-entrega (encontrado recién en prueba visual real en browser,
      no detectable por los curls automatizados de arriba):** `ClarifyQuestion`
      y `EscalationCard` mostraban `policyDecision.reason`/
      `escalation.unresolvedReason` tal cual al cliente final — texto de
      auditoría interna pensado para un revisor humano (cita reglas y rutas
      de archivo de `policies.yaml`/`evaluator.ts`), no para el usuario del
      chat. Corregido: CLARIFY ahora solo muestra la pregunta ya humanizada;
      la sección "Por qué no se resolvió automáticamente" de la tarjeta de
      escalación muestra un mensaje genérico seguro en vez del `reason`
      crudo. Verificado de nuevo en browser real tras el fix (build +
      `tsc --noEmit` limpios). Limitación menor que queda: `pendingQuestion`
      sigue redactado como nota de caso interna (ej. "Revisar el caso
      manualmente y decidir cómo proceder...") — no filtra código/nombres de
      archivo, pero tampoco está escrito en segunda persona hacia el
      cliente; no se tocó, a decidir si se ajusta en una fase de i18n/copy.
- [x] deploy inicial en AWS (checkpoint 0) vía Terraform — `terraform apply`
      corrido con éxito con un usuario IAM dedicado (`banking-agent-dev`,
      `AdministratorAccess`, ver limitación de Security en `terraform/README.md`),
      8 recursos creados (DynamoDB, API Gateway, log group, Secrets Manager,
      2 parámetros SSM). No se tocó el perfil personal `amplifyDev`.
- [x] **Pipeline end-to-end conectado sobre AWS real** (checkpoint siguiente
      a la infra base): `terraform/modules/agent` (los 4 Lambdas de negocio,
      empaquetados con esbuild — ver "Estrategia de empaquetado" en
      `terraform/README.md`) + `terraform/modules/orchestration` (Step
      Function Express `banking-agent-dev-chat-orchestrator` + Lambda
      dispatcher `banking-agent-dev-chat-dispatcher`) + tabla
      `banking-agent-dev-product-catalog` (`terraform/modules/data`,
      poblada automáticamente vía `null_resource`+`local-exec`, 20 items: 4
      productos + 16 FAQs). `terraform apply` real contra la cuenta AWS del
      proyecto: **39 recursos agregados, 0 modificados, 0 destruidos**
      (ningún recurso de checkpoint 0 tocado). Verificado con:
      (1) `aws stepfunctions start-sync-execution` directo contra la Step
      Function para los 4 caminos de decisión (`faq`/`product_info` AUTO,
      `escalation_request` ESCALATE, `eligibility_check` con campos
      faltantes CLARIFY), y (2) `curl` contra el endpoint HTTP real de API
      Gateway (`POST /chat`) confirmando el path completo API Gateway →
      dispatcher → Step Function → Lambdas de negocio de punta a punta.
      IAM de mínimo privilegio por Lambda + invocación restringida de la
      Step Function verificada (ver `docs/EVALUATION-CRITERIA.md`, pilar
      Security). **Limitación explícita, no silenciada (checkpoint de esa
      fase):** verification-agent/escalation-agent NO están en la cadena
      real desplegada — son placeholders documentados en la propia
      definición ASL (ver bullets de arriba); la Step Function responde
      directo el `reason`/`policyDecision` de policy-agent en los caminos
      CLARIFY/ESCALATE, y el resultado de `ActTransaction` sin una segunda
      vuelta de `evaluatePostAction`.

      **Actualización (fase Verify + Escalate):** la limitación de arriba
      sobre verification-agent/escalation-agent quedó **RESUELTA** en esta
      fase — ver los bullets `[x] verification-agent`/`[x] escalation-agent`
      más arriba en esta misma sección P0 para el detalle completo.
      `terraform apply` corrido de nuevo contra la cuenta AWS real del
      proyecto para conectar ambos Lambdas + los 4 estados nuevos de la ASL
      (`Verify`, `RouteByVerification`, `EscalateFromPolicy`,
      `EscalateFromVerification`): **11 recursos agregados, 5 modificados, 1
      destruido** (el único recurso destruido es el `null_resource` local de
      trigger de build de Lambdas, ningún recurso real de AWS de checkpoints
      anteriores se destruyó). `terraform plan` posterior sin drift.
      Verificado con 3 casos reales contra la Step Function desplegada: AUTO
      `faq`, AUTO `eligibility_check` aprobado (score no-borderline), y
      ESCALATE (`"quiero hablar con un asesor"`) — más 1 caso de regresión
      (CLARIFY, sin cambios de comportamiento respecto al checkpoint
      anterior). Conteo total de tests del proyecto verificado por reviewer
      en esta fase: **183 tests en verde** (155 previos + 28 nuevos de
      `escalation-agent`, que a su vez ya incluían los 34 de
      `verification-agent` — implementado antes, pero cuyo conteo todavía no
      había sido registrado en este documento hasta este mismo checkpoint de
      documentación). La parte de la limitación original sobre
      `evaluatePostAction` de policy-agent NO quedó resuelta en esta fase —
      ver el nuevo ítem de riesgo conocido justo debajo.
- [x] **RESUELTO — `evaluatePostAction` de policy-agent ahora se invoca
      dentro de la Step Function real vía un Task `PostActionDecide`
      nuevo.** Se agregaron 3 estados a la ASL
      (`terraform/modules/orchestration/asl/chat-orchestrator.asl.json.tftpl`):
      `PostActionDecide` (Task, invoca `policy_agent_lambda_arn` con
      `stage: "post_action"` sobre el `EligibilityResult` ya verificado por
      `Verify`), `RouteByPostAction` (Choice) y `EscalateFromPostAction`
      (Task, invoca `escalation_agent_lambda_arn` con
      `origin: "post_action_decision"`, termina en el `RespondEscalate`
      ya existente). `RouteByVerification` ahora rutea a `PostActionDecide`
      SOLO cuando `verified` y `intent == eligibility_check`; `product_info`/
      `faq` siguen yendo directo de `Verify` a `RespondAuto` sin cambios de
      comportamiento. `services/policy-agent/src/handler.ts` acepta el modo
      `stage: "post_action"` a nivel raíz del Payload (si no está presente,
      comportamiento idéntico al de siempre); `services/escalation-agent`
      acepta el tercer origen `post_action_decision`
      (`{ origin, understand, policyDecision }`). IAM: sin cambios — los 2
      Tasks nuevos invocan los mismos 2 Lambdas (policy-agent,
      escalation-agent) ya cubiertos por
      `aws_iam_role_policy.sfn_invoke_lambdas` y por los
      `aws_lambda_permission` de recurso existentes en
      `terraform/modules/orchestration/main.tf`. `terraform apply` real
      contra la cuenta AWS del proyecto: 1 recurso agregado + 3 modificados +
      1 destruido (`null_resource.build_lambdas` reemplazado por el cambio
      de código fuente de policy-agent/escalation-agent, más la definición
      de `aws_sfn_state_machine.chat_orchestrator` actualizada); `terraform
      plan` posterior sin drift (`No changes`). Verificado end-to-end contra
      AWS real por DOS caminos — (1) `StartSyncExecutionCommand` directo
      contra la Step Function (bypass del API Gateway) y (2) `curl` contra
      el endpoint HTTP real `POST /chat` (API Gateway → dispatcher → Step
      Function) — con DOS casos: caso borderline (`employment_status:
      "self_employed"`, `income: 10000`, `requested_amount: 30000`,
      `existing_customer: false` → `eligibility_score: 70`, dentro de
      `[borderline_score_min=55, borderline_score_max=70]` de
      `policies.yaml`) → `status: "escalate"` con `escalation.origin:
      "post_action_decision"`, `attemptedActions` no vacío,
      `unresolvedReason` citando la regla `escalate-score-borderline`, y
      `pendingQuestion` no nulo (nunca `status: "ok"`); y caso de
      regresión no-borderline (`employment_status: "employed"`, ratio
      `requested_amount/income` = 0.5, `existing_customer: true` →
      `eligibility_score: 100`, zona `approved`) → sigue devolviendo
      `status: "ok"` sin escalar de más. Evidencia de ejecución real (no
      solo el resultado final): `FilterLogEventsCommand` sobre
      `/aws/vendedlogs/states/banking-agent-dev-chat-orchestrator`
      (logging `level: ALL`, `include_execution_data: true`) confirma que
      el caso borderline efectivamente atravesó la secuencia de estados
      `Understand → Decide → RouteByDecision → RouteAutoIntent →
      ActTransaction → Verify → RouteByVerification → PostActionDecide →
      RouteByPostAction → EscalateFromPostAction → RespondEscalate →
      ExecutionSucceeded` (42 eventos de ejecución, IDs 1-42, cadena
      `previous_event_id` consistente). Riesgo original documentado arriba
      queda cerrado.

      **QA independiente (reviewer) sobre este cierre:** build + test del
      monorepo completo en verde -- **189 tests en total** (5
      `packages/shared` + 31 `conversation-agent` + 21 `policy-agent` + 32
      `retrieval-agent` + 34 `transaction-agent` + 34 `verification-agent` +
      32 `escalation-agent`), contra los 183 previamente documentados.
      Delta: +6 en `policy-agent` (15->21, incluye los 2 tests nuevos de
      `stage: post_action` reportados arriba) y +4 en `escalation-agent`
      (28->32, tests nuevos del origen `post_action_decision` en
      `build-summary.test.ts`/`security.test.ts`). El reviewer verificó la
      consistencia de contrato entre las 3 piezas leyendo el código real
      (no los reportes de los subagentes): el Payload que arma el estado
      `PostActionDecide` de la ASL coincide campo a campo con lo que espera
      `isPostActionEvent` de `services/policy-agent/src/handler.ts`, y el
      Payload de `EscalateFromPostAction` coincide con lo que espera
      `EscalationInput` de `services/escalation-agent/src/types.ts`. El
      reviewer también corrió `terraform plan` por su cuenta (no reusó el
      resultado de devops) contra `terraform/envs/dev`, confirmando de forma
      independiente "No changes" (sin drift), y probó SUS PROPIOS casos
      contra AWS real (distintos a los de devops, para no solo replicar la
      misma prueba): un caso borderline en español (`employment_status:
      student`, ratio `requested_amount/income = 3`, `existing_customer:
      true` -> `eligibility_score: 60`) que confirmó `status: "escalate"`
      con `escalation.origin: "post_action_decision"`, y un caso de
      regresión en portugués (`employed`, ratio 0.2 -> `eligibility_score:
      90`, zona `approved`) que confirmó `status: "ok"` sin escalar de más
      -- ambos con evidencia de `CloudWatch Logs` de la secuencia real de
      estados de la Step Function ejecutada. Adicionalmente confirmó con
      casos propios en ambos idiomas que CLARIFY (pt) y FAQ AUTO (es) siguen
      sin pasar por `PostActionDecide`, sin regresión en el resto del
      pipeline.

## P1 — robustez y evaluación
- [x] Soporte ES + PT validado y corregido (fase i18n, "Días 7-8" de
      docs/PLAN.md). **Historial de la fase, relevante para entender el
      estado final:** el orquestador delegado y su subagente de fix de
      frontend se cortaron a mitad de camino por un rate-limit de sesión
      (no un error de lógica); al reanudar, el coordinador auditó el estado
      real en disco antes de seguir (no repitió trabajo ya hecho) y encontró
      que quedó **parcialmente aplicado**:
      - Ya hecho por los agentes antes del corte: `apps/web/src/labels.ts`
        (ENTITY_LABELS/PRODUCT_TYPE_LABELS/EMPLOYMENT_STATUS_LABELS/
        SCORE_ZONE_LABELS bilingües), `BotResponse.tsx`/`EscalationCard.tsx`
        (todo el contenido cliente-facing bifurcado por `language`),
        `EscalationSummary.language` agregado al contrato compartido,
        `services/escalation-agent/src/narrative.ts`
        (`buildUserRequestSummary` bilingüe).
      - **Bug real encontrado por el coordinador al retomar (hubiera roto el
        build):** `build-summary.ts` seguía llamando a
        `buildUserRequestSummary` con 2 argumentos después de que
        `narrative.ts` ya exigía 3 (`language`) — nunca se corrió `npm run
        build` antes del corte.
      - **Gap real encontrado y corregido por el coordinador:**
        `services/escalation-agent/src/pending-question.ts`
        (`buildPolicyPendingQuestion`/`buildVerificationPendingQuestion`,
        que alimentan `pendingQuestion` — SÍ es cliente-facing, sección "Qué
        sigue"/"Próximos passos" de `EscalationCard.tsx`) seguía devolviendo
        español fijo sin `language`. Corregido con el mismo patrón
        `Record<LanguageCode, ...>`, wiring actualizado en `build-summary.ts`.
      - **Bug real encontrado en prueba visual en browser real por el
        coordinador:** `apps/web/src/App.tsx` ya tenía definidas las
        constantes bilingües (`ESCALATED_BANNER_TEXT`, `EMPTY_STATE_TEXT`,
        `PROCESSING_TEXT`, `MESSAGE_PLACEHOLDER`, `MESSAGE_ARIA_LABEL`,
        `SEND_BUTTON_TEXT`) pero el JSX seguía usando los strings
        hardcodeados en español originales — las constantes nunca se habían
        conectado al render (banner de escalación y placeholder del input
        quedaban en español aunque toda la conversación fuera en portugués).
        Corregido: todo el chrome de la UI ahora sigue `lang` (idioma de la
        última respuesta real, default `es` antes del primer turno).
      - **Gap adicional cerrado por consistencia:** `apps/web/src/api.ts`
        (mensajes de error de red/parseo) y el fallback de `status:
        "unavailable"` en `BotResponse.tsx` (que no siempre trae `language`
        en el contrato) también bifurcados por idioma — usan el último
        idioma conocido de la conversación en vez de español fijo.
      - **Verificación real, no solo local:** 4 tests nuevos en
        `services/escalation-agent/test/build-summary.test.ts` (193 tests
        totales en el monorepo, todos en verde); `terraform apply` real
        para redesplegar `escalation-agent` (y el resto de Lambdas que
        empaquetan `@banking-agent/shared`, por el campo `language` nuevo
        del contrato) — `terraform plan` posterior sin drift; caso ESCALATE
        en portugués (`"quero falar com um atendente"`) probado contra el
        endpoint HTTP real (`language: "pt"`, `userRequestSummary` y
        `pendingQuestion` en portugués) y en el frontend en un browser real
        (banner, placeholder, tarjeta de escalación completa — sin mezcla
        ES/PT en ningún elemento visible).
      - Catálogo/FAQs de `services/retrieval-agent/src/data/catalog.ts`
        revisados: portugués natural (brasileño), sin artefactos de
        traducción mecánica.
      **Limitación que queda, documentada a propósito:**
      `attemptedActions`/`unresolvedReason` de `EscalationSummary` siguen en
      español fijo — son campos de auditoría interna (citan reglas/archivos
      de `policies.yaml`/código, pensados para quien revise el caso) que
      `EscalationCard.tsx` ya NO renderiza al cliente (ver fix de la fase
      anterior) — si en el futuro se construye una vista interna para el
      humano que recibe la escalación, esos campos necesitarían su propia
      revisión de idioma en ese momento, no antes.
- [x] Caso de prueba: CLARIFY funcionando — verificado end-to-end sobre AWS
      real (`aws stepfunctions start-sync-execution` con
      `"quiero saber si califico para un prestamo"` → `status: "clarify"`,
      `policyDecision.decision: "CLARIFY"`, `askField: "income"`).
- [x] Caso de prueba: ESCALATE funcionando — verificado end-to-end sobre AWS
      real (`"quiero hablar con un asesor"` → `status: "escalate"`,
      `policyDecision.decision: "ESCALATE"` en el checkpoint de conexión
      inicial del pipeline). **Actualización (fase Verify + Escalate):** el
      mismo caso real, re-verificado contra la Step Function ya actualizada,
      ahora devuelve el `EscalationSummary` estructurado (`status:
      "escalate"`, `escalation` = objeto `EscalationSummary` completo —
      intención, `knownEntities`, `maskedDocumentId`, `attemptedActions`,
      `unresolvedReason`, `pendingQuestion`) en vez del `policyDecision`
      crudo — ver bullet `[x] escalation-agent` en P0 para el detalle
      completo.
- [x] Observabilidad: logs correlacionados por caseId (parcial) — la Step
      Function registra el execution record completo de cada turno
      (`level: ALL`, `include_execution_data: true`,
      `/aws/vendedlogs/states/banking-agent-dev-chat-orchestrator`,
      verificado con `DescribeLogStreams`/`GetLogEvents` real), y cada
      Lambda de negocio loguea en JSON estructurado con `caseId`/`turnId`
      (código ya existente en `services/*`, sin cambios de devops). **Falta:**
      dashboards/alarmas dedicados y un join automático `requestId` (API
      Gateway) ↔ `caseId` (Step Function) — ver
      `terraform/modules/observability/README.md`.
- [x] Reviewer checklist pasado — ver P2 abajo: los 4 pilares de
      `docs/EVALUATION-CRITERIA.md` verificados con evidencia concreta
      (comandos reales, no declaraciones), no solo el checklist mínimo por
      tarea. Verificación final hecha directamente por el coordinador
      (`npm test`, `terraform plan`, `curl`/`aws stepfunctions
      start-sync-execution` contra AWS real, browser real vía Claude in
      Chrome), no delegada — para evitar el mismo riesgo de reporte parcial
      que ya ocurrió una vez en la fase i18n (rate-limit de sesión).

## P2 — cierre de entrega (día 9-10)

### Sección de limitaciones conocidas

**Capacity limits**
- Sin load/stress testing de ningún tipo — todo lo que sigue son límites
  teóricos de AWS por defecto, no medidos contra este sistema específico.
- DynamoDB en `PAY_PER_REQUEST` (auto-scaling de AWS), pero sin
  `ConditionExpression` atómica en la escritura de idempotencia de
  transaction-agent (condición de carrera teórica entre invocaciones
  concurrentes del mismo `caseId`+`turnId` — de bajo riesgo real porque el
  cálculo es determinístico, pero no garantizado a nivel de infraestructura).
- Lambdas sin concurrencia reservada — comparten el pool de concurrencia por
  defecto de la cuenta con cualquier otro uso de esa cuenta AWS.
- `FaqList` de retrieval-agent usa `Scan` (no GSI) para listar por idioma —
  aceptable para 16 items, no escalaría a un catálogo real grande.
- Step Functions Express tiene límites de cuenta por defecto de AWS
  (ej. ejecuciones concurrentes/por segundo) nunca verificados contra este
  volumen de tráfico real.
- Sin caching — cada turno pega contra DynamoDB/Lambda sin capa
  intermedia.

**Data limitations**
- Todos los datos bancarios/de crédito son simulados — no hay integración
  con un banco real, buró de crédito, ni modelo de ML entrenado. El scoring
  de elegibilidad es una fórmula determinística de 4 factores (ver
  `services/transaction-agent/src/scoring/compute-score.ts`), auditable a
  simple vista pero no un modelo de riesgo real.
- El factor "deuda/ingreso" es un PROXY (`requested_amount/income`) — el
  contrato `Entities` no tiene un campo de deuda real del cliente.
- Extracción de entities (income, employment_status, document_id, etc.) es
  heurística por regex/keywords (`services/conversation-agent/src/router/
  entity-extractor.ts`), no NLP/LLM — cobertura parcial de formatos
  reales de LATAM (ej. cédula colombiana de 6-10 dígitos se clasifica como
  `"other"` por ambigüedad con el patrón de DNI de 8 dígitos).
- Sin resolución de moneda/país — `income`/`requested_amount` son números
  crudos sin unidad, se asume una única moneda implícita.
- Catálogo de productos/FAQs es un seed estático versionado en código (4
  productos, 16 FAQs es/pt) — no un feed real de tasas/condiciones.

**Language coverage**
- ES y PT soportados de punta a punta, verificado con casos reales contra
  AWS y en un browser real — incluyó dos bugs reales encontrados y
  corregidos en el camino: un bug de detección de idioma (matching de
  substring sin límite de palabra, `"quero"` clasificaba como español) y un
  wiring incompleto de i18n en el frontend (constantes bilingües definidas
  pero nunca conectadas al render — ver `docs/STATUS.md` P1, fase i18n).
- Solo ES/PT — sin soporte de un tercer idioma (fuera de scope del
  challenge, que pedía explícitamente español y portugués).
- Contenido del catálogo/FAQs escrito a mano en ambos idiomas (no traducción
  automática), revisado por naturalidad por el coordinador — sin una
  revisión lingüística formal por un hablante nativo.
- Campos de auditoría interna (`attemptedActions`/`unresolvedReason` de
  `EscalationSummary`) quedan en español fijo por diseño — no son
  cliente-facing (decisión documentada en la fase i18n).
- Detección de tipo de documento tiene sesgo hacia formato hispanohablante
  (`DNI` de 8 dígitos); en portugués un número de 8 dígitos se clasifica
  como `"other"` en vez de `DNI` (correcto, porque `DNI` no es un formato
  brasileño, pero confirma que la heurística de documento no es simétrica
  entre idiomas).

**Deployment work** (qué faltaría para producción real)
- ~~Bedrock/LLM nunca conectado — es la simplificación más grande respecto
  al blueprint de referencia. El router de intención y la extracción de
  entities de conversation-agent son heurísticos (regex/keywords), no un
  LLM. `modules/secrets` crea el parámetro SSM del model ID como
  placeholder, pero ningún Lambda invoca `bedrock:InvokeModel`/`Converse`.~~
  **RESUELTO (Fase C/D, post-cierre P2):** Bedrock real conectado en
  Understand (conversation-agent) y Decide (policy-agent), modelo
  `us.anthropic.claude-sonnet-4-6`, patrón "el modelo propone, el código
  (`policies.yaml`) dispone" — ver sección "Fase 2 — Bedrock real conectado
  (Understand + Decide)" más abajo para el detalle completo con evidencia
  real de AWS. Esta entrada de P2 queda como snapshot histórico del cierre
  original (día 9-10), no se reescribe.
- Sin autenticación/autorización en `POST /chat` — el endpoint está abierto
  a cualquiera que tenga la URL.
- Sin WAF frente al API Gateway.
- CORS con `allow_origins = ["*"]` — cualquier origin puede invocar el
  endpoint desde un navegador.
- Usuario IAM del proyecto con `AdministratorAccess` en vez de una policy
  acotada por servicio (decisión deliberada de checkpoint 0 para moverse
  rápido en 10 días) — esto además significa que las resource-based
  policies que restringen la invocación entre Lambdas NO protegen contra
  ESE usuario específico si decide invocar algo directamente.
- Terraform state local (no remoto con lock S3+DynamoDB) — no es seguro
  para operación en equipo, solo para un operador a la vez.
- Un solo ambiente (`dev`) en vez de `envs/{uat,prod}` del blueprint
  completo.
- Sin rotación de secretos en `modules/secrets`.
- Sin CI/CD — los tests y el deploy se corrieron manualmente durante el
  desarrollo, no hay un pipeline (ej. GitHub Actions) que corra `npm test`/
  `terraform plan` automáticamente en cada cambio.
- Política de retención de datos (`ttl` de `case_store`, hoy 30 días) es un
  placeholder de código, no una decisión de negocio confirmada.
- Sin dashboards/alarmas de CloudWatch dedicados (ver pilar Observability
  abajo) — solo logging estructurado, sin alertar activamente ante fallos.
- Trigger de rebuild de Lambdas es un hash combinado de los 6 servicios (no
  por servicio individual) — un cambio en cualquiera fuerza a Terraform a
  re-evaluar los 6 `archive_file`, aunque el `apply` real termine siendo
  no-op para los que no cambiaron.

**Remaining risks**
- **Seguridad:** endpoint público sin auth + CORS abierto + sin WAF es la
  combinación de mayor riesgo real si esto se expusiera fuera de un entorno
  de evaluación — cualquiera puede invocar el pipeline completo (incluida la
  escritura en DynamoDB) sin restricción.
- **Cumplimiento normativo:** sin modelado de "adverse action notice" (aviso
  formal de motivo de rechazo crediticio) para la regla `auto-score-declined`
  de `policies.yaml` (limitación declarada explícitamente en ese archivo);
  sin verificación KYC/AML real (fuera de scope del challenge, pero
  relevante para un banco real).
- **Fiabilidad operativa:** sin dashboards/alarmas significa que un fallo en
  producción (ej. throttling de DynamoDB, Lambda cerca de su timeout,
  incremento de tasa de `status: unavailable`) no generaría ninguna alerta
  activa — solo sería visible revisando logs manualmente.
- **Retención de datos:** `entities.document_id` (PII) se persiste en
  DynamoDB con TTL de 30 días pero sin cifrado adicional a nivel de
  aplicación (solo el cifrado en reposo por defecto de DynamoDB) — la
  política de retención real de negocio sigue sin confirmar.
- **Capacidad no validada:** sin ningún tipo de prueba de carga, el
  comportamiento real bajo tráfico de producción es desconocido.

### Checklist de paridad funcional vs. blueprint (`E2E-Implementacion-AWS-Terraform-Databricks.md`)

**Implementado 1:1 o equivalente al blueprint:**
- [x] Orquestación con Step Functions — el blueprint proponía Step Functions
      para el camino síncrono del chat (sección 11); se implementó Express
      (no Standard), decisión confirmada y justificada en `docs/PLAN.md`.
- [x] Un Lambda por pieza de lógica de negocio ("una función por tool"),
      con IAM de mínimo privilegio por Lambda — mismo patrón que la sección
      4.5 del blueprint.
- [x] DynamoDB para case/session store con convención `pk`/`sk` — mismo
      patrón que la sección 4.2 del blueprint (adaptado: `gsi1pk =
      CUSTOMER#<customerId>` en vez de `FAN#<fromCustomerUserId>`, porque no
      hay canal WhatsApp).
- [x] Logging estructurado correlacionable por `caseId`/`turnId` — mismo
      criterio que la sección 4.8 del blueprint (Observability), aunque sin
      la capa de dashboards/alarmas que el blueprint también menciona (ver
      limitación arriba).
- [x] Empaquetado de Lambdas resolviendo el problema real de symlinks de npm
      workspaces (esbuild) — equivalente en espíritu a la preocupación de
      empaquetado del blueprint, aunque el blueprint no prescribe una
      herramienta específica.
- [x] Idempotencia en la acción transaccional (`idempotencyKey`) — mismo
      patrón que la sección 4.5 del blueprint, aunque sin
      `ConditionExpression` atómica (ver limitación).

**Simplificado respecto al blueprint (decisión documentada, no descuido) —
snapshot histórico del cierre P2, ver actualización debajo del checklist:**
- [x] **Bedrock/LLM** — ~~el blueprint asume un LLM real (Bedrock) para el
      loop de agente; este proyecto usa heurísticas (regex/keywords) para
      routing de intención y extracción de entities. Es la simplificación
      más grande del proyecto, documentada en cada fase relevante.~~
      **RESUELTO post-cierre (Fase C/D):** Bedrock real conectado en
      Understand + Decide. La heurística NO se eliminó — sigue siendo el
      fallback de Reliability si Bedrock falla o responde con baja
      confianza. Ver "Fase 2 — Bedrock real conectado" en `docs/STATUS.md`.
- [ ] **Cola de turnos (SQS, `modules/messaging`)** — el blueprint la
      propone para desacoplar ingesta de procesamiento; se decidió que Step
      Functions Express ya resuelve la ejecución síncrona necesaria para
      este volumen, sin necesidad de una cola separada (decisión
      confirmada, no pendiente).
- [ ] **EventBridge + patrón de publish/router multi-canal** — el blueprint
      lo usa porque el canal original es WhatsApp/Insider y necesita
      desacoplar el "qué responder" del "por dónde publicarlo"; este
      proyecto tiene un solo canal (HTTP chat), así que la Step Function
      responde directo sin necesidad de un bus de eventos intermedio.
- [ ] **WAF** — no implementado (ver limitación de Security).
- [ ] **Terraform state remoto (S3+DynamoDB lock)** — se usa backend local
      (ver limitación).
- [ ] **Múltiples ambientes (`uat`/`prod`)** — un solo ambiente `dev`.
- [ ] **Dashboards/alarmas de CloudWatch** — no implementados (logging sí,
      alertar activamente no).
- [ ] **Databricks / capa de analytics** — el blueprint ofrece un split
      híbrido AWS+Databricks para analytics de casos/teléfono; no aplica a
      este proyecto (no hay canal WhatsApp con datos de teléfono/país que
      analizar, y no hubo requisito de analytics/reporting en el challenge).
- [ ] **Rotación de secretos** — no implementada.

### Los 4 pilares de `docs/EVALUATION-CRITERIA.md` — verificados con evidencia

**Observability — PARCIAL (logging real, sin alertar activamente)**
- ✅ Execution records completos de cada turno en CloudWatch (Step Function,
  `level: ALL`, `include_execution_data: true`,
  `/aws/vendedlogs/states/banking-agent-dev-chat-orchestrator`) —
  verificado con `FilterLogEventsCommand` real mostrando la secuencia
  completa de estados de un caso borderline (42 eventos, IDs 1-42).
- ✅ Logs de aplicación estructurados en JSON con `caseId`/`turnId` en cada
  uno de los 6 Lambdas de negocio (código real en `services/*`, no agregado
  por infra).
- ✅ Access logs de API Gateway (`requestId`, status, latencia).
- ❌ Sin dashboards ni alarmas — un fallo real no generaría ninguna
  notificación activa.
- ❌ Sin join automático `requestId` (API Gateway) ↔ `caseId` (Step
  Function) — son consultables por separado, no en una sola vista.

**Reliability — FUERTE (verificado en código y en producción real)**
- ✅ Retries acotados (2, backoff corto) en conversation-agent/
  retrieval-agent/transaction-agent ante fallos de DynamoDB — código real,
  no solo declarado, con tests que simulan fallos reales (no solo happy
  path).
- ✅ Fallback seguro consistente en todo el pipeline: ningún componente
  inventa un resultado ante un fallo — conversation-agent degrada a "sin
  memoria de sesión" en vez de perder el turno; transaction-agent lanza un
  error tipado en vez de fabricar un score; verification-agent reporta
  `pending_confirmation` ante su propio fallo interno, nunca `verified` por
  default.
- ✅ Idempotencia real en la acción transaccional, probada contando
  invocaciones de `PutCommand`/`GetCommand` (no solo declarada).
- ✅ Verificación independiente (verification-agent) como segunda capa antes
  de reportar éxito — no un passthrough.
- ⚠️ `ConditionExpression` no atómica en la escritura de idempotencia (bajo
  riesgo real, documentado).
- ❌ Sin pruebas de carga/caos — la fiabilidad bajo estrés real es
  desconocida.

**Security — GAP-HEAVY (lo forzado por IAM es real; lo perimetral falta)**
- ✅ Invocación entre Lambdas del pipeline forzada por IAM real (no solo un
  contrato de código): verificado con `iam:SimulatePrincipalPolicy` real
  contra AWS — los roles de conversation-agent/policy-agent no pueden
  invocar retrieval-agent/transaction-agent aunque su propio código lo
  intentara; solo el rol de la Step Function puede, scoped a los 6 ARNs
  exactos.
- ✅ PII (`document_id`) nunca expuesta cruda al cliente — enmascarada con
  defensa en profundidad (probado con un test de seguridad adversarial
  explícito en `escalation-agent`).
- ❌ Sin autenticación en `POST /chat` — endpoint público abierto.
- ❌ Sin WAF.
- ❌ CORS `allow_origins: ["*"]`.
- ❌ Usuario IAM del proyecto con `AdministratorAccess` — puede bypassear
  las restricciones de invocación de arriba si un operador decide invocar
  un Lambda directamente (limitación explícitamente reconocida como
  inherente al diseño, no un descuido).
- ❌ Sin rotación de secretos, sin cifrado adicional de PII más allá del
  default de DynamoDB.

**Reproducibility — FUERTE (después del cierre de hoy)**
- ✅ `README.md` en la raíz (agregado en este cierre — no existía antes,
  era el gap más visible del pilar) con quickstart real, estructura del
  monorepo, y puntero a cada doc.
- ✅ `terraform/README.md` con instrucciones de setup completas
  (credenciales, `terraform init/plan/apply`, cómo correr el frontend),
  actualizado en este cierre para reflejar el estado real del pipeline
  (antes describía una versión desactualizada de 4 Lambdas sin
  verification-agent/escalation-agent).
- ✅ Versionado real: `.terraform.lock.hcl` versionado, dependencias de npm
  fijadas por `package-lock.json`.
- ✅ Evaluación repetible: 193 tests automatizados que no dependen de AWS
  real (`npm test` desde cero, verificado por el coordinador en esta misma
  sesión), más comandos documentados (`curl`, `aws stepfunctions
  start-sync-execution`) para verificar contra AWS real sin necesidad de
  contexto previo del proyecto.
- ⚠️ Terraform state local — reproducible por un solo operador, no
  team-safe (limitación ya declarada en Security/Deployment work).

## Fase 2 — infra adicional (post-cierre P2)

Primera tarea de una fase 2 que extiende el proyecto más allá del cierre P2 (ver arriba). Alcance: **solo infraestructura**, sin tocar `services/*` (lógica de negocio) ni la definición ASL de la Step Function — confirmado por QA independiente del reviewer por timestamps de archivo (el repo todavía no tiene ningún commit git, ver limitación nueva más abajo).

- [x] **Bedrock real habilitado (SSM + decisión de IAM), con bloqueador explícito de "model access" pendiente del usuario.** Modelo elegido: `us.anthropic.claude-sonnet-5`, un **inference profile** (no model ID directo) — confirmado empíricamente contra la cuenta real (`ListFoundationModelsCommand`/`ListInferenceProfilesCommand` vía `@aws-sdk/client-bedrock`, el AWS CLI no está instalado en esta máquina): toda la familia Anthropic disponible en esta cuenta/región tiene `inferenceTypesSupported: ["INFERENCE_PROFILE"]`, sin soporte de invocación on-demand directa por model ID. El parámetro SSM `bedrock_model_id` (`terraform/modules/secrets`) pasó de `PLACEHOLDER-bedrock-model-id` a ese valor real. **Decisión de IAM: se difiere `bedrock:InvokeModel`/`InvokeModelWithResponseStream` a la fase C/D** (cuando conversation-agent/policy-agent realmente invoquen Bedrock) en vez de agregarlo ahora — se mantiene el principio ya declarado en checkpoints anteriores ("no otorgar un permiso sin código que lo use"), documentado en detalle en `terraform/modules/agent/README.md` ("Bedrock IAM: decisión de diferir"). Verificado por QA independiente: `grep -i bedrock terraform/modules/agent/main.tf` → 0 resultados (ningún rol de Lambda tiene el permiso). **BLOQUEADOR real, no resoluble por un agente — ver "Bloqueadores" al final de este documento:** el "model access" de `us.anthropic.claude-sonnet-5` no está habilitado en la consola de Bedrock de esta cuenta; una invocación de prueba real (`ConverseCommand`) devuelve `AccessDeniedException: anthropic.claude-sonnet-5 is not available for this account` — confirmado DOS VECES de forma independiente (devops al elegir el modelo, y el reviewer en su QA, en momentos distintos, mismo resultado).
- [x] **Módulo `terraform/modules/frontend/` (S3 + CloudFront con OAC) — aplicado y desplegado en AWS real.** Bucket S3 privado (`banking-agent-dev-frontend`, `aws_s3_bucket_public_access_block` con los 4 flags relevantes, `BucketOwnerEnforced`, sin ACLs) + CloudFront con **Origin Access Control** (`aws_cloudfront_origin_access_control`, no el OAI deprecado) + bucket policy que permite `s3:GetObject` únicamente al principal de servicio `cloudfront.amazonaws.com` condicionado a `AWS:SourceArn` = ARN de ESA distribución específica (nunca acceso público abierto) — verificado leyendo el código por el reviewer, no solo declarado. Distribución real: `E1PAQCTTFEQF75`, dominio `d1vi5rhqqyd97a.cloudfront.net`. Infraestructura deliberadamente VACÍA en este checkpoint — el build de `apps/web` no se sube todavía (fase F futura). **Cierra la limitación de Security "CORS abierto"** documentada en P2: `cors_allow_origins` de `module.edge` (`terraform/envs/dev/main.tf`) ahora resuelve al dominio real de CloudFront (`https://d1vi5rhqqyd97a.cloudfront.net`) en vez de `["*"]`, con un mecanismo de sentinel (si el operador no overridea `var.cors_allow_origins`, se resuelve automáticamente al dominio de CloudFront). **Nota para desarrollo local:** con este cambio, `apps/web` corriendo en `localhost:5173` (ver P0/P1) queda bloqueado por CORS salvo que se overridee `cors_allow_origins` temporalmente — documentado en `terraform/README.md`. **Bug real de Terraform/HCL encontrado y corregido en el camino:** comparar un `list(string)` contra un literal `["*"]` con `==` da SIEMPRE `false` en HCL (son tipos distintos, `tolist` vs `tuple`, sin coacción automática) — confirmado con `terraform console`; el fix fue `join(",", var.cors_allow_origins) == "*"`. Dejado como nota técnica permanente en `terraform/envs/dev/main.tf` y `terraform/modules/edge/README.md` para que no se repita en otro lugar del proyecto.
- [~] **Módulo `terraform/modules/analytics/` (DynamoDB Streams → Lambda de transformación → Kinesis Firehose → S3) — código completo y validado, NO aplicado por un bloqueador de cuenta.** `case_store` (`terraform/modules/data`) tiene `stream_enabled = true`/`stream_view_type = "NEW_AND_OLD_IMAGES"` ya aplicado, con output nuevo `case_store_stream_arn`. El resto del pipeline (Lambda JS plano de transformación con event source mapping sobre el stream, IAM de mínimo privilegio scoped — verificado por el reviewer que no usa `"*"` en ningún recurso —, Firehose `DirectPut`/`extended_s3` con particionado nativo por timestamp de ingesta `year=.../month=.../day=...`, bucket S3 nuevo `banking-agent-dev-case-store-analytics`) está completo en `terraform/modules/analytics/` pero gateado por `var.enable_analytics_pipeline` (default `false`). Formato de datos documentado en `terraform/modules/analytics/README.md`: un objeto JSON por record de DynamoDB Streams sin aplanar (DynamoDB JSON con wrappers de tipo), NDJSON (newline-delimited), comprimido `.gz` — listo para que una futura integración de analítica (Databricks u otra, explícitamente fuera de scope) sepa qué esperar sin inspeccionar código. **BLOQUEADOR real, no resoluble por un agente — ver "Bloqueadores" al final de este documento:** la cuenta AWS de este proyecto no tiene Kinesis Firehose disponible (`SubscriptionRequiredException`), confirmado con DOS llamadas reales independientes (creación real del delivery stream Y una llamada de solo lectura `ListDeliveryStreamsCommand`, descartando que sea un problema de IAM). **Causa raíz confirmada por el usuario: es una cuenta AWS freemium/free-tier, y Kinesis Firehose directamente no está disponible en ese tier** — no es un servicio que falte "habilitar", requeriría una cuenta de pago. `terraform plan -var enable_analytics_pipeline=true` confirma que el código es válido (14 recursos a agregar, sin errores de sintaxis/lógica) — queda listo para aplicarse el día que exista una cuenta AWS de pago, sin cambios de código adicionales.
- **Limitaciones nuevas encontradas en el camino (no silenciadas):** (1) el TTL de 30 días de `case_store` no se propaga al futuro bucket de analytics — los eventos replicados en S3 persistirían indefinidamente sin una lifecycle policy ahí, pendiente de coordinación (misma limitación de retención ya abierta en P2); (2) el event source mapping de `modules/analytics` no tiene partial batch item failure reporting (un fallo reintenta TODO el batch) ni destino `on_failure` (records que agotan reintentos se descartan sin rastro, sin DLQ); (3) `modules/frontend` sin dominio custom/ACM, sin logging de acceso de CloudFront a S3, sin WAF, sin versionado/lifecycle en el bucket, sin SSE-KMS explícito (usa el SSE-S3 default).
- **QA independiente (reviewer), 5/5 puntos PASS, con comandos propios (no repitió ciegamente los de devops):** (1) `terraform plan` real desde `terraform/envs/dev` → "No changes", confirmado contra el state real (incluye `module.frontend.aws_cloudfront_distribution.frontend [id=E1PAQCTTFEQF75]` y `module.secrets.aws_ssm_parameter.bedrock_model_id`); (2) invocación de prueba real y propia a Bedrock (script Node con `@aws-sdk/client-bedrock-runtime`, el AWS CLI confirmado no instalado en esta máquina) → mismo `AccessDeniedException` que devops, confirmando que el bloqueador sigue vigente al momento del QA; (3) lectura de código confirmando OAC (no OAI) y bucket policy scoped; (4) `grep` confirmando 0 permisos de Bedrock en `modules/agent`; (5) `services/*` y la ASL no tocados (verificado por timestamps de archivo, ya que el repo no tiene ningún commit git todavía). **Hallazgo adicional del reviewer, fuera del alcance de esta tarea pero relevante:** el repositorio no tiene ningún commit (`git rev-list --all --count` = 0) — recomienda un commit inicial pronto para que futuras fases sean auditables por diff real en vez de por timestamps de archivo.

## Bloqueadores
- **Kinesis Firehose no disponible — causa raíz confirmada: cuenta AWS freemium/free-tier.** Bloquea aplicar `terraform/modules/analytics` (`enable_analytics_pipeline = true`). Confirmado con `SubscriptionRequiredException` en dos llamadas reales independientes (creación del delivery stream y una llamada de solo lectura), y confirmado por el usuario que la causa es el tier de la cuenta: Kinesis Firehose requiere una cuenta de pago, no está disponible en freemium. No es un simple toggle pendiente — requeriría upgradear la cuenta (o migrar el pipeline de analytics a otra cuenta AWS que sí lo tenga). El código Terraform ya está listo y validado (`terraform plan -var enable_analytics_pipeline=true` sin errores) — aplicar apenas exista una cuenta con Firehose disponible, sin cambios de código.

## RESUELTO — acceso a Bedrock habilitado (modelo cambiado de Sonnet 5 a Sonnet 4.6)

El bloqueador de "model access" de Bedrock quedó resuelto, pero **no con el
modelo originalmente elegido**: `us.anthropic.claude-sonnet-5` sigue dando
`AccessDeniedException` en esta cuenta (bloqueador de cuota específico de
esa familia de modelo, no de IAM ni de "model access" general — confirmado
por el usuario, que sí tiene acceso habilitado en la consola pero Sonnet 5
no está disponible por cuota). **Se cambió a `us.anthropic.claude-sonnet-4-6`**
(también requiere invocación vía inference profile, mismo mecanismo),
verificado con una llamada `ConverseCommand` real exitosa:
`{"message":{"role":"assistant","content":[{"text":"Ok"}]}}`.
`bedrock_model_id` en `terraform.tfvars` actualizado y aplicado
(`terraform apply` real, `terraform plan` posterior sin drift). El
parámetro SSM `/{project}-{env}/bedrock/model_id` ahora contiene el ID real
que sí funciona, no el placeholder original elegido.

IDs verificados en esta cuenta vía `ListFoundationModelsCommand`/
`ListInferenceProfilesCommand` reales (útil si en el futuro se necesita
cambiar de modelo de nuevo): `anthropic.claude-sonnet-4-20250514-v1:0`,
`anthropic.claude-sonnet-4-6`, `anthropic.claude-sonnet-4-5-20250929-v1:0`,
`anthropic.claude-sonnet-5` — los 4 figuran en el catálogo con
`inferenceTypesSupported: ["INFERENCE_PROFILE"]`, pero solo Sonnet 4.6 (de
los probados) respondió con éxito en esta cuenta.

## Fase 2 — Bedrock real conectado (Understand + Decide)

Fase C/D del plan de extensión post-cierre. Objetivo: conectar Bedrock de
verdad (no solo habilitado en infra, sino invocado por código real) en las
capas Understand (`conversation-agent`) y Decide (`policy-agent`).
Arquitectura confirmada por el usuario: **el modelo decide, pero
`policies.yaml` se asegura de que la decisión no tenga alcance fuera de lo
definido** — el modelo propone (patrón "Jev": salida TIPADA con confianza,
nunca prosa libre, vía tool use forzado de la API Converse), el evaluador
determinístico existente corre siempre después y la decisión final es la
MÁS CONSERVADORA entre ambas (reusa literalmente `severity_order`/
`SEVERITY_ORDER` de `policies.yaml`, el mismo mecanismo que ya combinaba
reglas entre sí).

**Nota de proceso:** esta fase se cortó a mitad de camino por un
rate-limit de sesión (segunda vez que pasa en el proyecto, ver la fase
i18n para el primer caso) — igual que esa vez, el coordinador auditó el
estado real en disco/AWS antes de seguir, no confió en el reporte parcial.
Todo lo documentado acá fue **verificado de nuevo por el coordinador
directamente**, no solo por los reportes de los subagentes interrumpidos.

### conversation-agent — Understand con Bedrock

`services/conversation-agent/src/understanding/` nuevo:
`understand-backend.ts` (orquesta Bedrock vs. heurística + umbral de
confianza), `bedrock-understander.ts` (Converse API, tool use forzado —
el modelo literalmente no puede devolver un `intent` fuera del enum del
contrato), `ssm-config.ts` (resuelve `modelId`/región desde SSM, cacheado).

Backend seleccionable vía `UNDERSTANDING_BACKEND` (`"bedrock"` default).
Fallback automático a la heurística regex/keywords YA EXISTENTE (no se
tocó, no se borró) si: Bedrock falla tras reintentos acotados, SSM no
responde, o la confianza del modelo es menor a
`UNDERSTANDING_CONFIDENCE_THRESHOLD` (0.5). Nunca se pierde el turno.

**Verificado por el coordinador contra AWS real** (no solo por el reporte
del subagente interrumpido): `npm test` desde la raíz → **227 tests en
verde** (193 previos + 34 nuevos), build limpio. `terraform plan` →
"No changes" (el código desplegado ya coincide con el código final en
disco — resuelve la duda que había dejado abierta el reporte de
devops/reviewer sobre si el último `apply` incluía el código final o no).
Invocación real contra el endpoint HTTP (`"Hola, quisiera saber cuales son
las tasas de interes de una tarjeta de credito"`) → `status: "ok"`,
`intent: "product_info"`, resultado correcto del catálogo. **Confirmado
con CloudWatch Logs real** (`FilterLogEventsCommand` sobre
`/aws/lambda/banking-agent-dev-conversation-agent`) que Bedrock
efectivamente se invocó, no que cayó al fallback por casualidad:
`{"event":"understanding_backend_used","backend":"bedrock","reason":
"success","confidence":0.97,...}`.

### policy-agent — Decide con Bedrock + guardrail

`services/policy-agent/src/bedrock/` nuevo: `model-decider.ts` (propone
`decision`/`confidence`, tool use forzado, nunca lanza — una decisión fuera
del enum se trata como propuesta no disponible, nunca se coacciona),
`config.ts` (mismo patrón de SSM cacheado), `guardrail.ts`
(`applyModelGuardrail`, combina la propuesta del modelo con
`PolicyDecisionResult` del evaluador existente). El evaluador
determinístico (`evaluator.ts`) **no se tocó** — se reutiliza tal cual.

**Verificado por el coordinador con CloudWatch Logs reales** (no solo
tests): para el mismo caso de arriba,
`{"event":"policy_decision_source","ruleDecision":"AUTO",
"modelDecision":"AUTO","modelConfidence":0.92,"finalDecision":"AUTO",
"winner":"rules"}` — confirma que **el evaluador de reglas es quien
decide** ("winner": "rules"), el modelo solo propuso una señal adicional.
Caso ESCALATE explícito en portugués (`"quero falar com um atendente"`)
re-verificado contra el endpoint real tras esta fase: `status: "escalate"`,
`language: "pt"`, sin mezcla de idioma — sin regresión.

### IAM real de Bedrock (ya no diferido)

`bedrock:InvokeModel`/`bedrock:Converse` agregados a los roles de
**conversation-agent y policy-agent únicamente** (no a los otros 4
Lambdas), scoped al ARN del inference profile real — **no** `Resource:
"*"`. Hallazgo real de devops durante esta fase: el inference profile
cross-region `us.anthropic.claude-sonnet-4-6` necesitó además los ARNs de
`foundation-model` en las 3 regiones que ese profile puede enrutar (no
alcanza con el ARN del inference profile solo) — documentado en
`terraform/modules/agent/README.md`. `terraform plan` sin drift,
confirmado por el coordinador.

### Limitaciones conocidas de esta fase

- **Latencia y costo aumentan**: cada turno de `product_info`/`faq`/
  `eligibility_check`/`unknown` ahora hace 1-2 llamadas a Bedrock
  (Understand siempre; Decide también, salvo que Bedrock ya haya fallado
  en Understand y se use el flag para saltarlo — a confirmar). No medido
  contra tráfico real (ver limitación de "Capacity limits" ya declarada en
  P2).
- El umbral de confianza (`0.5`) es un valor razonable elegido, no
  calibrado contra datos reales de producción — candidato a ajustar con
  telemetría real si el proyecto continúa.
- Tests de Bedrock usan mocks (nunca pegan a AWS real desde `npm test`,
  mismo criterio que DynamoDB) — la verificación contra AWS real fue
  manual (curl + CloudWatch Logs), no está automatizada en CI (tampoco
  existe CI todavía, limitación ya declarada en P2).
- `modelDecision`/`modelConfidence` quedan en el log estructurado pero no
  se exponen en la respuesta HTTP al cliente — son observabilidad interna,
  no un dato cliente-facing (mismo criterio que otros campos de auditoría
  del proyecto).
