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

## Fase 3 — Pivot de prioridad: transaction-dispute intake (2026-09-27)

### Contexto y decisión

El hackathon entregó el dataset real LATAM Bank (`hacka-info/`, carpeta gitignoreada, contexto local, no versionado). El EDA del equipo sobre ese dataset real (`hacka-info/EDA_LATAM_Bank_resumen.md`) concluyó que el flujo con mejor evidencia de negocio es **transaction-dispute intake**, no el flujo original de este proyecto:

- Las llamadas con motivo "Queja" tienen 43.6% de FCR (First Contact Resolution) contra 91.5% de "Transaccional" — es el mayor dolor medible del dataset.
- Las disputas ("Cargo no reconocido" + "Cobro indebido") son 36% de las quejas.
- Hallazgo crítico de integridad de datos: la tabla `complaints` **no sirve como fuente de verdad** — 0 de 44,570 productos reclamados pertenecen al cliente que reclama, y los montos reclamados no coinciden con ninguna transacción real. En cambio, `transactions`/`products` tienen integridad perfecta (100% de dueños correctos). Conclusión de negocio: cualquier disputa debe verificarse contra las **transacciones reales del cliente**, nunca contra `complaints`.

Decisión del usuario: **transaction-dispute pasa a ser el flujo PRINCIPAL** de esta fase del proyecto. El flujo original (`credit-product info & eligibility`, todo lo documentado en P0-P2 y "Fase 2" arriba) **no se descarta ni se retira** — sigue funcionando exactamente igual (sin regresión, confirmado por los 279 tests), solo deja de ser el foco.

**Decisión de arquitectura (idea del usuario, validada por el coordinador antes de delegar):** en vez de construir un router/Lambda nuevo duplicado, se **extendió el pipeline Understand→Decide ya existente**:
- `conversation-agent` ya hacía clasificación tipada de intent (heurística + Bedrock, patrón "Jev") — esa clasificación de intent ES el "orchestrator que identifica el challenge". Se le agregó el intent nuevo al mismo enum `Intent`, sin Lambda router aparte.
- `policy-agent` ya era 100% config-driven sobre `policies.yaml` — se le agregaron reglas nuevas para el intent nuevo en el MISMO archivo, sin archivo/Lambda aparte.
- `verification-agent`/`escalation-agent` **no se tocaron en esta fase** (fuera de un fix mecánico puntual, ver abajo) — su extensión para disputa es la fase siguiente.
- El único componente genuinamente nuevo (el "Act" de disputa) **no se construyó todavía** — es explícitamente la fase siguiente.

Datos: "mock chico respetando la estructura real" (decisión del usuario) — no se conecta el dataset completo (millones de filas, S3 real del hackathon), sino un subset sintético pequeño con los **nombres de columna y tipos exactos** del data dictionary real, para que conectar el dataset real después sea cambiar de repositorio (mismo patrón `CATALOG_BACKEND` estático/dynamodb que ya usa retrieval-agent), no de estructura.

### Qué se construyó

**1. Contrato compartido (`packages/shared/src/contracts/understand-output.ts`, extendido no reescrito):**
- `Intent` +1 valor: `"dispute_unrecognized_charge"` — cubre a propósito TANTO "Cargo no reconocido" COMO "Cobro indebido" del EDA (procedimentalmente idénticos). `dispute_status_check` (consultar el estado de una disputa ya abierta) fue considerado y **descartado por ahora** — MVP acotado, documentado en `docs/CONTRACTS.md`.
- `Entities` +4 campos (reutilizando `document_id`/`document_type`/`product_type` para identidad/producto, sin duplicar): `disputed_amount: number | null` (mismo criterio sin resolución de moneda que `requested_amount`), `merchant: string | null` (texto libre, sin normalizar), `transaction_date: string | null` (texto libre best-effort, ej. "ayer"/"la semana pasada" — deliberadamente SIN parser de fecha real), `dispute_reason: DisputeReason | null` (tipo nuevo `DisputeReason = "unrecognized_charge" | "duplicate_or_overcharge" | "other"`, con `"other"` reservado para una fase posterior — conversation-agent nunca lo asigna por su cuenta).
- `REQUIRED_ENTITIES_BY_INTENT.dispute_unrecognized_charge = ["product_type", "document_id"]` — solo estos dos son obligatorios vía esta matriz (semántica AND). La regla real de negocio también exige "al menos UNO de {disputed_amount, merchant, transaction_date}" (semántica OR) — esa matriz no puede modelar OR, así que esa validación quedó en policy-agent como regla adicional más estricta, mismo patrón ya usado para `document_type` en `eligibility_check`. Documentado explícitamente en un comentario extenso en el propio código para que nadie lo "corrija" pensando que es un bug.
- `docs/CONTRACTS.md` extendido en la misma sección existente (intents, entities, ejemplo ES/PT nuevo, limitaciones) — no se creó un documento paralelo.

**2. Reconocimiento de intents (`services/conversation-agent`):**
- Heurística ES/PT nueva en `router/intent-router.ts` (keywords tipo "no reconozco este cargo"/"cobro indebido"/"não reconheço essa cobrança"/"cobrança indevida", etc.) y `router/entity-extractor.ts` (extracción best-effort de `merchant`/`disputed_amount`/`transaction_date`/`dispute_reason`). Orden de prioridad final en `routeIntent`: `escalation_request` → `dispute_unrecognized_charge` → `eligibility_check` → `product_info` → `faq` → `unknown` — el intent de disputa se chequea ANTES que `product_info` a propósito, porque un mensaje de disputa casi siempre menciona el producto/tarjeta afectada (lo que dejaría `entities.product_type` no-null y sería mal capturado por `product_info` si se evaluara antes). Verificado con test de regresión explícito ES/PT: "tarjeta de crédito" + frase de disputa → `dispute_unrecognized_charge`, no `product_info`.
- Tool schema de Bedrock (`understanding/bedrock-understander.ts`) extendido con los 4 campos nuevos en `buildInputSchema()`, `SYSTEM_PROMPT`, y `coerceToolInput()` (nunca se confía ciegamente en que el modelo respetó el enum — mismo criterio ya establecido para los campos existentes).
- Verificado end-to-end de verdad por el reviewer (no solo tests unitarios): corrió mensajes reales en ES y PT contra el pipeline compilado real (`loadPolicyFile` + `evaluatePreAction`) usando la heurística (no Bedrock, no se invocó AWS), confirmando un CLARIFY en cada idioma y un ESCALATE real por monto alto.

**3. Datos mock del core bancario + repositorio (`services/transaction-agent`, código NUEVO y aditivo — no toca `compute-eligibility.ts` ni el flujo de elegibilidad existente):**
- `src/data/mock-core-banking.ts`: 4 clientes, 6 productos (cada cliente con al menos una tarjeta), 24 transacciones (6 por cliente). Columnas **calcadas literalmente del data dictionary real del hackathon** (`hacka-info/LATAM_Bank_Complete_Data_Dictionary.pdf`, páginas 4/5/8 para `Customer`/`Product`/`Transaction` respectivamente — NUNCA se leyó ni se copió la página 2 de ese PDF, que contiene credenciales AWS reales del hackathon; la extracción se hizo por rango de página con `pdftotext`, salteando esa página explícitamente en cada llamada). Incluye transacciones "disputables" realistas (monto/comercio/fecha claros) y una transacción explícita con `is_fraud: true, fraud_score: 96` para poder probar a futuro el camino de ESCALATE por fraude. **No se generó ningún dato mock de `complaints`** — el EDA es explícito en que esa tabla no sirve como fuente de verdad para este flujo.
- `src/repository/` (`types.ts`, `static-transaction-repository.ts`, `index.ts`): contrato `TransactionRepository` (mismo patrón `found`/`not_found`/`unavailable` ya usado por `CatalogRepository` de retrieval-agent) con `findCustomerByDocumentNumber`, `listCustomerProducts`, y `findCandidateTransactions(customerId, {merchant?, amount?, dateRange?})` — matching difuso (substring case-insensitive en comercio, tolerancia de monto `max(1% del monto, 0.5)`, rango de fecha inclusive). `StaticTransactionRepository` es la única implementación (sin AWS); mismo patrón `CATALOG_BACKEND` de retrieval-agent queda documentado como aplicable después, NO implementado (es trabajo de infra/fase de Act, junto con devops).
- 19 tests nuevos (`test/static-transaction-repository.test.ts`).

**4. Reglas de decisión (`policies.yaml`, mismo archivo, extendido no reescrito):**
- `stage: pre_action`, 4 reglas nuevas para `dispute_unrecognized_charge`: `clarify-dispute-missing-fields` (CLARIFY si falta `product_type`/`document_id`, mismo mecanismo `ask_field_priority` que eligibility), `clarify-dispute-no-transaction-clue` (CLARIFY si los datos mínimos están pero `disputed_amount`/`merchant`/`transaction_date` están los TRES vacíos — la validación OR-adicional descrita arriba, `ask_field: merchant` por ser el dato más específico para localizar la transacción), `escalate-dispute-amount-over-threshold` (ESCALATE si `entities.disputed_amount` supera un umbral **nuevo y separado** `config.dispute_high_risk_amount_threshold: 15000` — decisión deliberada de NO reusar `high_risk_amount_threshold: 50000` de eligibility, porque un cargo YA disputado es una señal de alarma distinta a un préstamo solicitado, y reusar 50000 dejaría sin escalar el caso mock de fraude del punto 3), `auto-dispute-complete` (AUTO si todo lo mínimo está completo, hay al menos una pista de transacción, y ninguna bandera de arriba matchea).
- Sección `security`: entrada nueva `sec-no-raw-dispute-fields-in-reason`, mismo criterio que `document_id` — ningún `reason` interpola el valor crudo de `disputed_amount`/`merchant`/`transaction_date`. Verificado línea por línea por el reviewer: las 4 `reason` son texto estático.
- Sección `post_action` de disputa: bloque **NUEVO, separado, y marcado explícitamente como propuesta no confirmada** (`dispute_post_action_contract_status: PROPOSAL_NOT_CONFIRMED`, claves distintas a las de eligibility para no chocar en YAML ni ser leídas por el evaluador en runtime — confirmado por el reviewer que `evaluator.ts` no lee esas claves) — mismo patrón que usó este archivo para `eligibility_check` antes de que existiera transaction-agent. Preguntas abiertas dejadas explícitas para la fase siguiente: shape exacto de un futuro `DisputeVerificationResult`, qué umbral de `fraud_score` dispara ESCALATE, mecanismo de correlación por `caseId`/`turnId`. Reglas BORRADOR incluidas como punto de partida legible, no de producción.
- `is_repeat_complainer` (reclamante repetido): evaluado y **descartado como no viable en esta fase** — `UnderstandContext.historyTurns` solo cuenta turnos dentro del MISMO `caseId`, no un conteo de disputas pasadas del cliente a través de múltiples cases/tiempo (requeriría una query nueva contra DynamoDB por `customerId`, trabajo de infra fuera de este scope). Documentado como limitación explícita en `policies.yaml`, sin bloquear el resto de la tarea.
- 4 tests nuevos agregados a `services/policy-agent/src/evaluator.test.ts` (cargando el `policies.yaml` REAL, no un fixture separado) cubriendo los 4 escenarios de arriba — cerrado un gap real que encontró el QA independiente (ver abajo).

**5. Cambios mecánicos (sin lógica nueva, requeridos para no romper el build por la extensión del contrato):**
- `packages/shared/src/contracts/escalation-summary.ts` (`KNOWN_ENTITIES_KEYS`) y `services/escalation-agent/src/known-entities.ts` (`summarizeKnownEntities`/`emptyKnownEntities`): agregaron las 4 keys nuevas con el mismo patrón pass-through (`entities.campo ?? null`) ya usado para el resto de campos no-PII. Confirmado por el reviewer: diff 100% mecánico, sin lógica nueva.
- `services/policy-agent/src/{evaluator.test.ts, handler.test.ts, handler.bedrock.test.ts, bedrock/model-decider.test.ts}`: fixtures de test que construían un `Entities` literal completo (interfaz sin campos opcionales) necesitaron las 4 keys nuevas para seguir compilando — sin cambios de lógica de negocio ni de `policies.yaml` en esos archivos.
- **Limitación estructural encontrada y documentada** (no es un bug, es una propiedad de TypeScript): como `Entities` es una interfaz completa, cualquier extensión aditiva del contrato compartido rompe la compilación de todo literal `Entities` hardcodeado en cualquier otro servicio del monorepo. Recomendación dejada para la próxima ronda de campos nuevos: estandarizar que todo código consumidor construya `Entities` siempre vía `{ ...emptyEntities(), ...overrides }`, nunca un objeto literal completo a mano.

### QA independiente (reviewer)

Dos rondas de QA reales (no solo lectura de reportes de los agentes):
- **Ronda 1:** build + test del monorepo completo en verde, **275 tests** (227 previos del flujo credit-eligibility, sin regresión, + 48 nuevos entre `packages/shared`, `conversation-agent` y `transaction-agent`). Confirmó consistencia de contrato leyendo código real (no reportes), sección `security` sin interpolación de PII/datos de disputa, y por `git diff`/lectura de código que **NO se tocó** `verification-agent`, `terraform/` (incluida la ASL), ni `compute-eligibility.ts` — el fix mecánico de `known-entities.ts` fue confirmado línea por línea como pass-through sin lógica nueva. Corrió además 5 escenarios sintéticos y 3 mensajes reales en ES/PT contra el `policies.yaml` real compilado, confirmando CLARIFY/AUTO/ESCALATE reales del flujo nuevo de punta a punta (Understand→Decide, sin Act).
  - **Único hallazgo real:** ningún test automatizado ejercitaba las 4 reglas nuevas de disputa contra el evaluador real — se cerró en una ronda de seguimiento.
  - Hallazgo secundario, no bloqueante: la heurística de disputa es literal por frase exacta (mismo estilo/limitación ya preexistente en `eligibility_check`/`product_info` — Bedrock es el camino real, la heurística es solo fallback).
- **Ronda 2 (seguimiento):** tras agregar los 4 tests a `evaluator.test.ts`, build + test completo en verde de nuevo: **279 tests** (275 + 4), confirmado test por test que cargan el `policies.yaml` real (no un mock), incluyendo verificación explícita de que ESCALATE gana sobre AUTO cuando ambas reglas matchean para el mismo caso (modelo "más conservador gana").

**Incidente de infraestructura de agentes (no de código de negocio) durante esta fase:** un evento de `git stash`/`git reset` repo-wide ocurrió en el working tree compartido mientras dos agentes trabajaban en paralelo (causa raíz: uno de los agentes corrió `git stash` sin pathspec para medir un conteo de tests, capturando también el trabajo en progreso del otro agente). Ambos agentes detectaron la pérdida por su cuenta y se recuperaron restaurando selectivamente sus propios archivos desde el stash, sin pisarse entre sí — verificado independientemente por el reviewer (git status/diff coherente, nada corrupto). El stash se dejó deliberadamente sin dropear como red de seguridad adicional hasta confirmar que todo el trabajo quedó commiteado.

### Qué NO se hizo todavía (explícito, fase siguiente)

Nadie puede disputar nada real todavía — esta fase es exclusivamente Understand (clasificar intent + extraer entities) y Decide (reglas AUTO/CLARIFY/ESCALATE de pre_action, más una propuesta documentada de post_action). Falta explícitamente:
- **Act de disputa**: un Lambda nuevo (fase siguiente) que use el `TransactionRepository` ya construido para buscar la transacción real, confirmarla con el cliente, bloquear la tarjeta, y abrir la disputa. No existe todavía.
- **Verify/Escalate extendidos**: `verification-agent`/`escalation-agent` no tienen ninguna rama nueva para disputa — siguen sin tocar en esta fase (fuera del fix mecánico ya descrito). Cuando exista el Act, necesitarán una rama nueva de verificación/resumen de escalación específica para disputas (mismo patrón ya usado para `eligibility_check` vs `escalation_request`).
- **Terraform/ASL**: ningún recurso de infraestructura nuevo para disputa — no hay Lambda desplegado, no hay estado nuevo en la Step Function. El pipeline de disputa NO está conectado a AWS real todavía; solo corre localmente vía tests/scripts.
- **Confirmación del contrato `post_action` de disputa**: queda como `PROPOSAL_NOT_CONFIRMED`, a resolver cuando exista el Act (mismo proceso que se siguió para `eligibility_check` en su momento).
- **`is_repeat_complainer`**: requiere una query nueva de historial cross-case por `customerId` contra DynamoDB — no existe, documentado como limitación.
- **`dispute_status_check`**: intent descartado por ahora, MVP acotado al intake.
- **Reconectar todo end-to-end**: una vez que exista el Act, hay que repetir el mismo trabajo de conexión que ya se hizo para `eligibility_check` (Step Function real, IAM scoped, verificación contra AWS real con `curl`/`start-sync-execution`).

## Fase Dispute 2 — Act/Verify/Escalate + infra real + 2 bugs encontrados y arreglados (2026-09-28)

Cierra todo lo dejado pendiente por Fase 3: existe Act de disputa real, Verify/Escalate extendidos, infraestructura desplegada en AWS real, y el pipeline completo de `dispute_unrecognized_charge` corre de punta a punta contra la API real — verificado con `curl` real, no solo tests.

### Qué se construyó

**1. Contrato `DisputeVerificationResult`** (`packages/shared/src/contracts/dispute-verification-result.ts`) — resuelve las 3 preguntas abiertas de Fase 3: shape (`caseId`, `transactionFound`, `transactionId?`, `fraudSuspected`, `productBlocked`), umbral de fraude (señal única `transaction.is_fraud`, sin corte de `fraud_score` — no hay caso límite real en el mock que lo justifique), correlación (misma tabla/partición que `EligibilityResult`, `sk = RESULT#dispute#<turnId>`).

**2. Act de disputa** (`services/transaction-agent/src/compute-dispute.ts`, `computeDisputeVerification`): localiza la transacción real disputada del cliente acotando candidatas por ownership real de producto tipo tarjeta; 0 o 2+ candidatas se tratan como "no encontrado" (nunca se adivina una entre varias). Idempotencia sobre `DisputeStore` (DynamoDB real + fallback in-memory), mismo patrón que `compute-eligibility.ts`.

**3. Reglas `post_action` confirmadas** en `policies.yaml` (`dispute_post_action_contract_status: CONFIRMED`): `escalate-dispute-fraud-suspected`, `escalate-dispute-transaction-not-found`, `auto-dispute-transaction-confirmed-no-fraud`, en el mismo array `post_action_rules` que eligibility, mismo evaluador.

**4. `verification-agent` extendido**: segunda verificación independiente de `DisputeVerificationResult` — invariante `productBlocked === (transactionFound && !fraudSuspected)`, y re-derivación de ownership/fraude contra el core bancario simulado cuando `transactionFound`, sin confiar en lo que ya afirmó el Act.

**5. `escalation-agent` extendido**: resúmenes y preguntas pendientes bilingües (es/pt) específicos de disputa para `verification_failed` y `post_action_decision`.

**6. Terraform/ASL**: `ActTransaction` enruta también `dispute_unrecognized_charge` (mismo Lambda, discriminado por intent). Dos estados `Pass` nuevos (`PreparePostActionEligibility`/`PreparePostActionDispute`) arman el Payload plano específico de cada intent antes de `PostActionDecide`, sin tocar el contrato de `policy-agent/src/handler.ts`. Desplegado contra AWS real (`banking-agent-dev-chat-orchestrator`).

### Bug 1 (crítico) — el guardrail de Bedrock escalaba TODA disputa a ciegas

Encontrado al reanudar esta fase tras una interrupción por rate-limit del subagente de devops, que reportó el síntoma pero no llegó a diagnosticarlo.

**Causa raíz confirmada** (leyendo `services/policy-agent/src/bedrock/model-decider.ts`): `buildSystemPrompt(stage: "post_action")` describía ÚNICAMENTE la forma de `EligibilityResult` (`productType`/`eligibility_score`/`score_zone`). Un `DisputeVerificationResult` real le llegaba al modelo con campos que el prompt ni mencionaba (`transactionFound`/`fraudSuspected`/`productBlocked`), y el prompt de `pre_action` tampoco reconocía el intent `dispute_unrecognized_charge` ni sus 4 entities nuevas. Sin contexto del shape que veía, el modelo proponía `ESCALATE` por su propia regla de desempate ante ambigüedad — y esa propuesta ganaba siempre vía `applyModelGuardrail` ("más conservador gana"), sin importar lo que dijera la regla determinista de `policies.yaml`. `handler.ts` tenía el mismo bug a nivel de tipos (`PostActionEvent` hardcodeado a `EligibilityResult`).

**Fix** (`model-decider.ts`, `handler.ts`): prompt de sistema ahora describe ambas formas posibles (`EligibilityResult`/`DisputeVerificationResult`) y le dice al modelo cómo distinguirlas por los campos presentes; el prompt de `pre_action` reconoce el intent y las 4 entities de disputa; tipos correctos en `handler.ts` (`PostActionEvent` acepta ambos contratos). Una segunda vuelta de verificación contra Bedrock real expuso un problema más sutil: aun con el prompt corregido, el modelo trataba `productBlocked: true` como una señal de riesgo adicional ("bloqueo de alto impacto pendiente de aprobar") y seguía escalando el caso de bajo riesgo por excelencia del flujo — se afinó el prompt para aclarar que ese bloqueo es la acción preventiva estándar y reversible ya ejecutada, no una decisión pendiente.

**Verificación** (dos capas):
- 53 tests de `policy-agent` (incluye 3 regresiones nuevas: 2 en `model-decider.test.ts` que inspeccionan el `system` prompt real enviado a Bedrock, 1 E2E en `handler.bedrock.test.ts` con un `DisputeVerificationResult` real de punta a punta).
- Contra Amazon Bedrock real (`us.anthropic.claude-sonnet-4-6`, invocado directamente con el prompt de producción): 5/5 casos coinciden con la política de negocio — `post_action` (encontrada+sin fraude → `AUTO`, con fraude → `ESCALATE`, no encontrada → `ESCALATE`), `pre_action` (datos completos → `AUTO`, datos incompletos → `CLARIFY`).

Desplegado a AWS real (`banking-agent-dev-policy-agent`, dos `terraform apply` — uno por cada vuelta de ajuste del prompt).

### Bug 2 — una respuesta a un CLARIFY perdía el intent de disputa activo

Encontrado durante la verificación E2E real del Bug 1 (`curl` contra la API desplegada, conversación de 2 turnos): tras el `CLARIFY` real pidiendo `product_type`, la respuesta del usuario ("Es de mi tarjeta de crédito") se reclasificó como un intent nuevo (`product_info`) en vez de continuar la disputa, aunque el dato SÍ llenaba el campo pedido.

**Causa raíz** (`services/conversation-agent/src/context/context-manager.ts`): `lastIntent` se persistía en `ConversationStateItem` (DynamoDB) en cada turno, pero nunca se leía de vuelta para nada — el intent se reclasificaba desde cero, solo a partir del texto del mensaje actual, sin memoria de que había una disputa a medio resolver.

**Fix**: `resolveEffectiveIntent` — si el intent anterior tenía `missing_fields` pendientes (el turno anterior terminó en `CLARIFY`) y el mensaje de este turno aporta un valor no nulo para al menos uno de esos campos pendientes, se continúa el intent anterior en vez de reclasificar. Un cambio de tema real sigue funcionando sin cambios (sus entities no llenan los `missing_fields` del intent anterior, así que la condición nunca se activa).

**Verificación**: 6 tests nuevos (`context-manager-continuity.test.ts`, 4 unitarios sobre la función pura + 2 de integración contra `buildUnderstandOutput` con estado persistido simulado) + confirmación real contra la API desplegada: la conversación completa de 2 turnos (disputa inicial → `CLARIFY` real → respuesta con el dato faltante) ahora completa correctamente con `status: "ok"`, `transactionFound: true` (`TXN-000001`, transacción real de María en el mock), `fraudSuspected: false`, `productBlocked: true`.

Desplegado a AWS real (`banking-agent-dev-conversation-agent`).

### Estado final de esta fase

- **331 tests** en verde (325 previos + 6 nuevos de continuidad de intent), sin regresión en ningún servicio.
- Pipeline `dispute_unrecognized_charge` completo (Understand→Decide→Act→Verify→PostActionDecide→respuesta) corriendo end-to-end contra AWS real, verificado con `curl` real contra `chat_api_endpoint`, no solo localmente.
- `dispute_post_action_contract_status: CONFIRMED` en `policies.yaml` — ya no es una propuesta.
- Pendiente explícito (no bloqueante, próxima fase si queda tiempo): `is_repeat_complainer` y `dispute_status_check` siguen fuera de scope (mismas razones que Fase 3); robustecer más el flujo de eligibility si el usuario lo pide ("si queda tiempo").

## Fase ML — evaluación del "learned component" (2026-09-28)

El PDF del hackathon (`hacka-info/Factored AI & Data Hackathon 2026.pdf`, pág. 4) exige evaluar al menos un "learned component" contra un baseline con held-out evaluation, labels válidos y prevención de leakage — pero aclara explícitamente que entrenar un modelo nuevo **no es obligatorio**. Dos piezas de trabajo, ambas cerradas:

### A. Harness de evaluación del guardrail de Bedrock (learned component pre-entrenado, sin entrenar nada)

`services/policy-agent/scripts/evaluate-decide-stage.ts`: compara baseline (`evaluatePreAction`/`evaluatePostAction` solos) contra el sistema propuesto (+ guardrail de Bedrock, `applyModelGuardrail`) sobre 17 casos held-out (ambos stages, ambos intents, es/pt, labels derivados de los umbrales reales de `policies.yaml`). Corrido contra Bedrock real (`us.anthropic.claude-sonnet-4-6`): **16/17 decisiones correctas**, con 1 caso real de escalación innecesaria capturado y reportado, no ocultado. Reporte completo en `docs/EVALUATION-DECIDE-STAGE.md`, con métricas del propio vocabulario del rubric (Safe Automated Resolution, Unsafe Outcomes, Escalation Quality, latencia/costo p50/p95 con tokens reales de Bedrock).

### B. Clasificador de fraude entrenado sobre el dataset real — resultado negativo honesto

Decisión de scope (con el usuario): entrenar un modelo de fraude para `dispute_unrecognized_charge` está justificado (reemplazaría el lookup directo `fraudSuspected = tx.is_fraud`, que en un banco real no existiría en el momento de la disputa); entrenar algo para `eligibility` NO está justificado (el PDF pide explícitamente que esa política sea determinística/auditable, no aprendida) ni para intent (la EDA del equipo ya descartó el texto conversacional como no entrenable).

Pipeline completo en `ml/` (Python, DuckDB + pandas/scikit-learn — mismo tooling que ya usó el equipo para su EDA). Acceso al dataset real bloqueado inicialmente por el sistema de permisos (clasificador "Credential Materialization" al intentar leer las credenciales del PDF de la hackathon) — resuelto con el usuario corriendo la descarga él mismo y compartiendo solo los listados de paths (sin credenciales). A pedido del usuario se expandió el scope de `transactions` sola a también `customers`/`products`/`daily_exchange_rates` (todas chicas, todas con features point-in-time seguras — ver `ml/src/features.py` para el detalle completo de qué campos se excluyen por riesgo de leakage y por qué).

Corrida real contra 4.4M transacciones (4,316 fraude real, 0.098%): **el modelo entrenado no supera al baseline**. Se probaron 2 familias de modelo (regresión logística, después `HistGradientBoostingClassifier`) — ambas con PR-AUC prácticamente igual al base rate (~0.001), incluso IN-SAMPLE (sobre datos que el modelo vio al entrenar, lo que descarta que sea un problema de generalización/overfitting — es evidencia de que la señal no está en las features disponibles). El baseline (threshold sobre la columna `fraud_score` ya provista en el dataset) funciona muy bien: Precision 1.0, Recall 0.57, F1 0.72 — probablemente `fraud_score` es la señal real (o casi) usada para generar `is_fraud` en este dataset sintético.

En el camino se encontraron y arreglaron 2 bugs reales del propio harness de evaluación (no del modelo en sí): un bug de calibración de threshold (`class_weight="balanced"` bajo desbalance extremo deja sin sentido el 0.5 "de fábrica" como corte de decisión) y un bug de reporte (una variable `threshold` compartida entre el modelo y el baseline hacía que el reporte mostrara el número equivocado).

**Decisión final (usuario, 2026-09-28): dejar el modelo entrenado documentado tal cual, sin integrarlo en vivo** — wirearlo en `compute-dispute.ts` empeoraría el sistema real dado que no tiene poder predictivo. El hallazgo negativo queda como evidencia de rigor ("Include failures in the results", PDF pág. 4) en `ml/REPORT.md` (con diagnóstico in-sample incluido) y `ml/README.md`. `compute-dispute.ts` sigue sin tocarse — `fraudSuspected` sigue leyendo `is_fraud` directo, sin cambios de esta fase.

## Fase Matcher de Disputas — learned component real integrado en producción (2026-09-30)

Origen: rama `develop-renato` (mergeada a `main` por fast-forward tras confirmar que era estrictamente aditiva — nuevo EDA + `docs/eval-experiment-proposal-v2.html`) propone, en su sección "05 — Learned component", un matcher que desambigüe transacciones candidatas cuando la descripción de la disputa es vaga, en vez de dejar que el LLM adivine sola. El usuario confirmó dos decisiones de scope antes de implementar: (1) integrarlo como componente REAL del flujo de disputa, no solo como harness de evaluación aislado; (2) usar embeddings REALES de Bedrock — a diferencia del bloqueo anterior con Claude Sonnet 5 (cuota de modelo no disponible), `amazon.titan-embed-text-v2:0` se verificó invocable directo en esta cuenta (sin inference profile) antes de construir nada alrededor.

**El gap real que cierra** (confirmado leyendo `compute-dispute.ts` antes de tocarlo): si `findCandidateTransactions` devolvía 2+ transacciones candidatas, el sistema las trataba como "no encontrado" y escalaba SIEMPRE a un humano (`escalate-dispute-transaction-not-found`), sin intentar desambiguar — el propio comentario del código ya señalaba el ejemplo típico ("los múltiples cargos de Netflix/streaming").

### Qué se construyó

**1. `services/transaction-agent/src/matching/`** (módulo nuevo):
- `resolve-relative-date.ts` — resuelve frases de fecha relativa ES/PT (ayer/anteayer/la semana pasada/el mes pasado/día de la semana/fecha completa) a un rango `{from, to}` real contra una fecha de referencia. Mismo vocabulario que `entity-extractor.ts` ya detectaba como texto crudo, pero ahora lo RESUELVE en vez de solo capturarlo.
- `transaction-matcher.ts` — `baselineScore` (formaliza el filtro substring+tolerancia que el repositorio ya aplicaba, como score sumable) vs. `modelScore` (similitud coseno de embeddings para el comercio + proximidad continua de monto + ventana de fecha realmente resuelta, pesos 0.5/0.3/0.2 con redistribución si falta una señal). `rankAndDecide` solo actúa si el top score supera `tau=0.6` y se separa del segundo por `marginTau=0.15` (o si hay una sola candidata) — si no, preserva el comportamiento actual exacto (CLARIFY/ESCALATE), cambio estrictamente aditivo.
- `bedrock-embeddings.ts`/`embedding-config.ts` — cliente de Titan Embeddings vía `InvokeModel` (nunca `Converse`), nunca lanza (cae a solo baseline ante cualquier fallo), config resuelta de SSM con el mismo patrón cache que `conversation-agent`.

**2. Integración en `compute-dispute.ts`**: el branch de 2+ candidatas corre `rankAndDecide` antes de rendirse; si "confiado", resuelve como si hubiera habido una sola transacción desde el principio. Se agregó `TXN-000025` (Disney Plus, mismo monto y rubro que Netflix `TXN-000002`, fecha deliberadamente separada 3 semanas) al mock de María para que el caso de demo fuera genuinamente ambiguo y resoluble.

**3. Terraform**: nuevo parámetro SSM `embedding_model_id` (String no-sensible, mismo patrón que `bedrock_model_id`) + IAM de mínimo privilegio para `transaction_agent` (`bedrock:InvokeModel` scoped al ARN de foundation-model de Titan, sin inference profile — se invoca directo; `ssm:GetParameter` scoped al parámetro nuevo). Fix crítico encontrado en el camino: `package-lambdas.js` tenía a `transaction-agent` con `external: ["@aws-sdk/*"]` (wildcard) — inseguro ahora que usa `@aws-sdk/client-bedrock-runtime`/`client-ssm`, sin garantía de venir preinstalados en el runtime de Lambda (mismo motivo ya documentado para `conversation-agent`). Cambiado a la lista explícita `AWS_SDK_CORE_EXTERNAL`. `terraform apply` real corrido por el usuario: 3 recursos nuevos, sin cambios destructivos más allá del rebuild esperado de los 7 Lambdas.

**4. Harness de evaluación** (`services/transaction-agent/scripts/{generate-matcher-fixtures,evaluate-transaction-matcher}.ts`, mismo patrón que `evaluate-decide-stage.ts` de policy-agent): 48 casos sintéticos (24 clientes, seed determinístico, split por cliente por construcción, 8 marcados `designSet: true` excluidos del reporte), con dos estilos de consulta deliberados — "exact-merchant" (nombra el comercio) y "generic-category" (frase genérica de rubro, sin nombrarlo) — para medir honestamente dónde el baseline (substring exacto) falla estructuralmente. Reporte completo en `docs/EVALUATION-DISPUTE-MATCHER.md`.

Corrida en dos pasadas reales:
- **Sin embeddings configurados** (antes del `terraform apply`): el arm "modelo" ya ganaba en Recall@1 (90.0% vs. 72.5% baseline) usando SOLO la resolución real de fecha (el término de comercio se omite con gracia sin Bedrock) — confirma que ese es el aporte real del feature incluso sin Bedrock.
- **Con embeddings reales de Bedrock** (tras el `terraform apply`, `AWS_PROFILE=banking-agent-dev`): Recall@1 95.0%, Recall@3 100.0%, MRR 0.975 (vs. baseline 72.5%/100.0%/0.842). Precisión cuando "confiado" 100% en ambos arms, 0 falsos positivos en los 40 casos held-out. Hallazgo honesto no ocultado: la cobertura de decisiones "confiadas" del modelo BAJÓ de 85.0% a 62.5% frente a la corrida sin embeddings — la similitud real entre comercios del mismo rubro (ej. Netflix vs. Disney Plus) es más conservadora que el crédito parcial anterior, así que el ranker exige más separación real antes de actuar solo (ninguna regresión de precisión, solo más cautela).

### Verificación end-to-end real contra la API desplegada

Dos llamadas `curl` reales contra `https://kr49s6ij26.execute-api.us-east-1.amazonaws.com` (login real de María vía `POST /auth/login`, `sessionToken` real de vuelta):

- **Caso positivo** — "Mi CURP es LOTM900101MDFPRR09. No reconozco un cargo de 219 pesos en mi tarjeta de crédito **la semana pasada**." → `status: "ok"`, `transactionFound: true`, `transactionId: "TXN-000002"` (Netflix, no Disney Plus), `productBlocked: true`. El matcher resolvió correctamente la ambigüedad real entre las 2 transacciones de 219 MXN de María usando la ventana de fecha resuelta en producción.
- **Control negativo** — mismo mensaje SIN la frase de fecha → `status: "escalate"`, `unresolvedReason` citando explícitamente que no se pudo localizar ninguna transacción real con las pistas dadas, `transaction_date: null` en `knownEntities`. Confirma que el sistema no adivina cuando no hay señal discriminante real — sigue escalando a revisión humana en vez de resolver a ciegas.

### Estado final de esta fase

- Todo el módulo nuevo + integración + harness + infra committeados en 4 commits chicos y divididos (matcher, terraform, harness, reporte real con embeddings).
- 91 tests en `transaction-agent` (monorepo completo en verde), `tsc --noEmit` limpio, `terraform validate`/`plan` limpios antes del apply real.
- Verificación real de punta a punta contra AWS (caso positivo + control negativo), no solo el harness sintético.
- **Qué NO se hizo todavía (explícito, próxima fase si queda tiempo):** el harness de evaluación usa un dataset 100% sintético (generado programáticamente), no transacciones/disputas reales de clientes — mide si el matcher cumple su propio diseño, no si ese diseño cubre toda la variedad real de cómo la gente describe una disputa. `DEFAULT_TAU`/`DEFAULT_MARGIN_TAU` se fijaron por inspección de 8 casos, no por búsqueda de grilla. El caso `queryStyle: "generic-category"` sin frase de fecha sigue sin ninguna señal discriminante para ningún arm (limitación de diseño declarada, no un bug) — si el usuario quiere cerrarlo, requeriría una señal adicional (ej. categoría/rubro de la transacción) que hoy no se usa en el matcher.

## Fase Post-Matcher — harness robusto + sesión expirada + CLARIFY post-Act (2026-09-30)

Tres piezas, todas verificadas contra AWS real (no solo tests):

### 1. Harness sintético más robusto

`generate-matcher-fixtures.ts` sube de 24 a 40 clientes sintéticos (80 casos) y agrega vocabulario de fecha de día de semana, montos "recordados" aproximados (±1-3%), y decoys "casi dentro" de la ventana resuelta — antes el dataset solo ejercitaba los casos fáciles. Nueva tabla de cruce `queryStyle × hasDatePhrase` en el reporte aísla la celda real de punto ciego (`generic-category` + sin fecha: Recall@1 16.7% para AMBOS arms, nivel de azar) que antes quedaba escondida dentro de desgloses marginales. Chequeo real (no asumido) de determinismo de embeddings agregado al reporte.

### 2. Mensaje distinto de "sesión expirada"

Gap cerrado de `EVALUATION-CRITERIA.md` (Security, punto 5): fix puramente de frontend (`ChatPanel.tsx`), sin tocar `session-token.ts`/`resolve-role.ts` (el backend ya degradaba correctamente). `AuthContext.tsx` ya persistía `expiresAt` pero solo lo consultaba al montar la página — `sendMessage()` ahora lo chequea justo antes de cada envío y agrega un aviso bilingüe (mismo mecanismo que el aviso de inactividad ya existente). Verificado real contra el frontend desplegado vía claude-in-chrome: sesión inyectada con `expiresAt` corto, esperada a que venza, mensaje enviado — aviso visible, header vuelve a "Iniciar sesión".

### 3. CLARIFY post-Act para disputas ambiguas (en vez de escalar directo)

Pregunta del usuario que originó esta pieza: "si falta una señal, ¿por qué no preguntarle al cliente en vez de escalar?" — investigado a fondo: el motor de reglas de policy-agent (`evaluator.ts`) YA soportaba `CLARIFY` en `post_action_rules` genéricamente, solo que ninguna regla lo usaba nunca.

**Cambios**: `DisputeVerificationResult` gana `ambiguousCandidates` (top 5 del ranking, SIEMPRE presente como `[]` o poblado -- nunca ausente, ver bug de ASL abajo); `UnderstandContext` gana `selectedTransactionId` (respuesta estructurada del cliente, revalidada SIEMPRE contra las candidatas reales recalculadas, nunca confiada a ciegas); nueva regla `clarify-dispute-ambiguous-candidates` en `policies.yaml` + exclusión explícita en `escalate-dispute-transaction-not-found` (mismo mecanismo que la exclusión de `cliente_estrella` ya existente, necesaria porque "más conservador gana" le habría ganado siempre a la regla nueva); frontend con botones de selección (`DisputeCandidateSelection`, mismo patrón sentinel que `session_login`+`LoginPrompt`).

**3 bugs reales encontrados y arreglados durante la implementación/verificación** (ninguno por tests solos — los tres por leer código real o verificar contra AWS real):
1. `RouteByPostAction` de la ASL (`chat-orchestrator.asl.json.tftpl`) solo tenía rama para `ESCALATE`, `Default: RespondAuto` sin condición — un `CLARIFY` real hubiera caído ahí y se habría respondido como disputa resuelta con éxito. Agregada la rama + nuevo estado `RespondClarifyPostAction`.
2. El prompt de Bedrock para `post_action` (`model-decider.ts`) no conocía `ambiguousCandidates` — el modelo habría propuesto `ESCALATE` a ciegas para el caso ambiguo (mismo bug de clase ya arreglado una vez para `DisputeVerificationResult`), y "más conservador gana" le habría ganado siempre a la regla `CLARIFY` nueva. Prompt actualizado; verificado en producción que el modelo real propone `CLARIFY` con 0.97 de confianza y razonamiento correcto (cita Netflix/Disney Plus por nombre).
3. `resolveEffectiveIntent` (continuidad de intent entre turnos) solo continuaba el intent anterior si `missing_fields` (pre_action) tenía algo pendiente — una pregunta post_action ya tiene `product_type`/`document_id` completos, así que `missing_fields` queda vacío y la condición nunca se activaba. Un mensaje corto respondiendo la pregunta ("Netflix", clickeado como botón) se reclasificaba como intent `unknown` y perdía el flujo de disputa — encontrado en la PRIMERA verificación E2E real (turno 2 devolvía `status: escalate` con `intent: unknown` en vez de resolver). Fix: `selectedTransactionId` fuerza continuar `dispute_unrecognized_charge` sin importar `missing_fields`, señal explícita e inequívoca.

**Verificación end-to-end real, 2 turnos, contra la API desplegada** (tras el fix #3): turno 1 ("no reconozco un cargo de 219 pesos en mi tarjeta de crédito", sin comercio ni fecha) → `status: "clarify"`, `ambiguousCandidates` con Netflix y Disney Plus reales; turno 2 (mismo `caseId`, `selectedTransactionId: "TXN-000002"`) → `status: "ok"`, `intent` correctamente `dispute_unrecognized_charge` (no perdido), `transactionId: "TXN-000002"`. Repetido en browser real vía claude-in-chrome contra el frontend desplegado: login real, mensaje real, botones de candidatas renderizados correctamente, click en "Netflix" resuelve a `TXN-000002` con tarjeta bloqueada.

**Diseño deliberado sin estado nuevo en DynamoDB**: la selección se revalida cada turno recalculando las candidatas reales desde los `entities` ya persistidos (mecanismo de merge ya existente) — no hace falta recordar "qué candidatas se ofrecieron" entre turnos, evitando un cambio de esquema de persistencia.

**Qué NO se hizo (deliberado)**: sin tope nuevo de reintentos si la selección no matchea (mismo nivel de tolerancia que cualquier otro campo pendiente); sin cambios en verification-agent (confirmado passthrough real) ni en el evaluador genérico de policy-agent.

## Fase Simulador de conversaciones — nueva vista de admin + hallazgo real en entity-extractor (2026-10-01)

Pregunta del usuario sobre qué falta para que el sistema sea más robusto de cara a evaluación ("un generador de conversaciones para evaluación con un objetivo y resolución a base de un perfil de usuario?") — construido como una vista nueva de admin (`/admin`, pestaña "Simulaciones"), apalancada en lo ya existente: perfiles = los 4 clientes mock reales, objetivos = catálogo fijo de 4 escenarios con `expectedStatus`, y un cliente sintético (Bedrock, tool use forzado, mismo patrón que `model-decider.ts`) que juega el rol del usuario turno a turno contra el pipeline REAL desplegado (`POST /auth/login` + `POST /chat`, nunca la Step Function invocada directo). El veredicto es estructural (`finalStatus === expectedStatus`), nunca otro LLM opinando — "el modelo propone, el código dispone" aplicado también acá: el modelo solo decide qué escribiría el cliente, nunca si el resultado fue correcto.

Detalle técnico completo (worker async vía self-invoke del mismo Lambda, persistencia reusando `case-store` con `gsi1pk=SIMULATIONS` sobre el GSI `by-customer` ya existente, IAM/Terraform) en los commits `18e6790` (backend+infra) y `6580d6f` (frontend). Verificado real contra AWS tras el `terraform apply` del usuario: 2 corridas por `curl` + corridas adicionales y navegación completa en browser real contra CloudFront.

### Hallazgo real: `entity-extractor.ts` nunca puede extraer un `document_id` en varios formatos reales

Encontrado por la SEGUNDA corrida real del simulador (objetivo `dispute-ambiguous`, perfil María/CUST-0001), no por un test ni por inspección de código previa — exactamente el tipo de caso que un tester humano no escribiría a mano porque normalmente tipea el formato "que ya sabe que funciona":

- Turno 1 (disputa de $219, sin comercio): `status: "clarify"`, `askField: "document_id"` (correcto, es un campo requerido faltante).
- Turno 2, el cliente sintético respondió **"Mi número de documento es 28.456.789."** (formato DNI con puntos, natural para alguien de Argentina) → `status: "escalate"`, `intent: "unknown"` — el documento NUNCA se extrajo (`entities.document_id: null`), conversation-agent perdió el contexto de la disputa entera y escaló en vez de continuar.

**Causa raíz, verificada empíricamente (no asumida)**: `services/conversation-agent/src/router/entity-extractor.ts` tiene exactamente 3 patrones para reconocer un documento en texto libre —

```
CPF_PATTERN            = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/        // Brasil, numérico
DNI_PATTERN             = /\b\d{8}\b/                              // 8 dígitos CONTIGUOS
DOCUMENT_LABEL_PATTERN  = /\b(cpf|dni|cédula|cedula|documento|c\.?c\.?)\D{0,10}(\d{5,14})\b/i
```

Dos problemas reales, confirmados con un repro directo de la regex (no solo con el caso del simulador):

1. **Ningún patrón reconoce CURP** (formato mexicano real, alfanumérico de 18 caracteres, ej. `LOTM900101MDFPRR09` — el document_type real de María y de Roberto, 2 de los 4 clientes mock). "Mi CURP es LOTM900101MDFPRR09." no matchea ninguno de los 3 patrones — `document_id` queda `null` sin importar cómo lo escriba el cliente.
2. **`DOCUMENT_LABEL_PATTERN` exige el grupo de dígitos CONTIGUO** (`\d{5,14}` sin separadores internos) — un DNI argentino escrito con el separador de miles convencional ("28.456.789") rompe el match en fragmentos de 2/3/3 dígitos, ninguno llega a 5. Sin los puntos ("28456789") sí matchea.

Repro mínimo (Node, confirmado antes de escribir esto):
```js
"Mi número de documento es 28.456.789.".match(DOCUMENT_LABEL_PATTERN) // null
"Mi CURP es LOTM900101MDFPRR09.".match(DOCUMENT_LABEL_PATTERN)        // null
"Mi documento es 28456789.".match(DOCUMENT_LABEL_PATTERN)             // matchea, digits="28456789"
```

**Impacto real**: cualquier clarify que pida `document_id` a un cliente CURP (María/Roberto) es un callejón sin salida por texto libre — ninguna respuesta natural lo completa, el turno siguiente cae a `intent: unknown` y escala. Para clientes DNI/CC (Julieta/Carlos), funciona solo si el cliente escribe el número sin puntos, lo cual no es la forma más natural de escribirlo.

**Estado: RESUELTO** -- ver fase "Reparos propuestos" más abajo (ítem #1).

## Fase Reparos propuestos (2026-10-01)

Tras el hallazgo de `entity-extractor.ts` (fase anterior), se le pidió al
agente proponer reparos para TODO lo que seguía abierto en este documento
y en `policies.yaml`, priorizados por costo/beneficio. El usuario eligió
implementar 3 de los propuestos (#1+#2 juntos, #3, #4) ahora mismo; el
resto queda tal cual estaba documentado (WAF/`AdministratorAccess`/sin CI/
hardening de `modules/frontend`, Kinesis Firehose bloqueado por cuenta,
harness del matcher 100% sintético) -- no son bugs nuevos, son las mismas
limitaciones ya declaradas antes de esta fase.

### #1 -- `entity-extractor.ts`: CURP y DNI con puntos ahora se reconocen

Fix exacto al gap documentado arriba: `CURP_PATTERN` nuevo
(`/\b[A-Za-z]{4}\d{6}[A-Za-z]{6}\d{2}\b/`, clasificado `document_type:
"other"` -- `DocumentType` no tiene un valor CURP dedicado, mismo criterio
ya usado para cédula CO) + `DOCUMENT_LABEL_PATTERN` ahora acepta
separadores (`.`/`-`/espacio) dentro del grupo de dígitos, normalizándolos
antes de validar longitud 5-14. 6 tests nuevos (`entity-extractor.test.ts`)
con los 2 mensajes reales que dispararon el hallazgo + regresión de los
casos que ya funcionaban (DNI etiquetado, DNI sin etiqueta, CPF). 99 tests
verdes en `conversation-agent` (sin regresión).

### #2 -- El simulador ahora conoce el documento REAL del perfil

`services/admin-agent/src/simulation/user-simulator.ts`: el prompt del
cliente sintético ahora incluye `profile.documentId` y una regla explícita
("respondé EXACTAMENTE con el número de documento de tu perfil, nunca
inventes uno distinto") -- antes el simulador inventaba un número
plausible pero falso (fue justamente lo que disparó el hallazgo #1). Sin
este fix, el simulador seguiría probando una ruta que ningún cliente real
tomaría (dar un documento inventado), en vez de la ruta real que SÍ debería
funcionar ahora con #1.

### #3 -- `is_repeat_complainer` (reincidencia de reclamos), reabierto y resuelto

Señal nueva `UnderstandContext.priorDisputeCount` (número de cases
PREVIOS del mismo `customerId` con `lastIntent =
dispute_unrecognized_charge`, `null` si no se pudo calcular -- NUNCA
forzado a `0`). Calculada por
`ConversationStateStore.countPastDisputeCases` (nuevo método,
`services/conversation-agent/src/context/state-store.ts`): un `Query`
sobre el GSI `by-customer` que YA EXISTE (`gsi1pk = CUSTOMER#<customerId>`,
puesto en cada item de ese cliente desde el día 1) -- cero tablas/GSI
nuevos, mismo reuso que ya usa `admin-agent` para listar simulaciones.
Corre en paralelo con la lectura de estado del turno (`Promise.all`), y un
fallo de esta query NUNCA marca `degraded` (es una señal opcional
adicional, no core del merge del turno) -- a diferencia de un fallo de
lectura/escritura de `STATE#latest`.

Regla nueva en `policies.yaml`: `escalate-dispute-repeat-complainer`
(`context.priorDisputeCount >= config.dispute_repeat_complainer_threshold`,
default `2`) -- el operador `gte` del evaluador nunca es verdadero contra
`null`, así que un fallo de la query simplemente no dispara la regla,
nunca escala a ciegas por un problema de infraestructura. 3 tests nuevos
en `evaluator.test.ts` (dispara en el umbral, no dispara debajo del
umbral, no dispara con `null`) + 7 tests nuevos en
`state-store-fallback.test.ts` (conteo real, paginación, fallo de
DynamoDB, wiring completo en `buildUnderstandOutput`). 99 tests verdes en
`conversation-agent`, 34 en `policy-agent` (sin regresión en ninguno).

**Limitación que queda** (documentada, no un bug): la ventana de
reincidencia es toda la retención real de case-store (TTL, hoy 30 días) --
no hay una ventana de tiempo propia/más corta configurable para esta regla
en particular.

### #4 -- Señal de categoría (`merchant_category`) en el matcher de disputas

Investigación ANTES de implementar reveló que la propuesta original no
aplicaba al caso que motivó el pedido: `generate-matcher-fixtures.ts`
construye cada caso ambiguo con candidatas del MISMO `MerchantGroup`
(mismo rubro por diseño), así que una señal de categoría no puede
discriminar ahí -- el cruce `generic-category`+sin-fecha sigue en nivel de
azar por diseño del dataset, no por falta de esta señal. Confirmado con el
usuario antes de seguir (ver AskUserQuestion de esta sesión); se implementó
igual, más un caso nuevo (`crossCategory: true`, "Caso C") que SÍ mide el
aporte real.

**`transaction-matcher.ts`**: `modelScore` gana un 4to término --
similitud de embeddings entre `query.merchant` (lo que el cliente
escribió, nombre real o frase genérica de rubro) y
`candidate.merchant_category` -- reusa el MISMO `embed` ya inyectado,
nunca una taxonomía/keyword list nueva. Pesos re-balanceados: `merchant
0.4 / amount 0.25 / date 0.15 / category 0.2` (antes 0.5/0.3/0.2) --
redistribuidos proporcionalmente si falta alguna señal, mismo criterio que
ya existía. 3 tests nuevos en `transaction-matcher.test.ts` (categoría
rechaza una decoy de otro rubro, candidata sin `merchant_category` se
omite con gracia, fallo del embed de categoría se omite con gracia).

**`generate-matcher-fixtures.ts`**: cada `MerchantGroup` gana un
`categoryLabel` real (ej. "Streaming", "Food & Beverage", "Online Retail",
"Transportation", "Groceries" -- mismo vocabulario que `mock-core-
banking.ts` ya usa), propagado a `Transaction.merchant_category` en TODAS
las candidatas generadas. "Caso C" nuevo (`buildCrossCategoryCase`, 1 por
cliente sintético, 40 casos nuevos): candidata target + 1 decoy de un
`MerchantGroup` DISTINTO, mismo monto aproximado, consulta SIEMPRE
`generic-category` y SIN frase de fecha -- aísla el aporte real de la
señal nueva (si el merchant/fecha no pueden discriminar, ¿discrimina la
categoría?). Dataset sintético sube de 80 a 120 casos (102 held-out tras
excluir `designSet`).

**Resultado real, medido** (`docs/EVALUATION-DISPUTE-MATCHER.md`,
regenerado con embeddings reales de Bedrock, `AWS_PROFILE=banking-agent-
dev`):

| Grupo | Casos | Recall@1 baseline | Recall@1 modelo |
| --- | --- | --- | --- |
| same-category (candidatas del mismo rubro) | 68 | 73.5% | 94.1% |
| cross-category (candidatas de rubro distinto) | 34 | **52.9%** | **97.1%** |

Exactamente lo predicho: la señal de categoría da un salto real donde
corresponde (cross-category, baseline casi al nivel de azar -> modelo
97.1%), y el agregado global (Recall@1 66.7% baseline / 95.1% modelo,
MRR 0.828/0.972) se mantiene estable respecto al reporte anterior (antes
de esta fase: 95.0%/0.975) -- la señal nueva no degradó nada de lo que ya
funcionaba. Precisión-cuando-confiado se mantuvo en 100% para ambos arms
en toda la corrida (0 falsos positivos nuevos). El cruce
`generic-category`+sin-fecha restringido a SAME-category sigue siendo el
punto ciego real declarado (ninguna señal disponible puede discriminar
ahí, confirmado, no es un bug) -- queda documentado en el propio reporte,
sección "Limitaciones declaradas".

**Nota operativa encontrada en el camino** (no un bug del código, un
gotcha del entorno): `AWS_PROFILE`/`EMBEDDING_MODEL_ID_PARAM_NAME` pasados
inline a `npm run` en Git Bash sobre Windows fallan silenciosamente --
MSYS reescribe cualquier valor de env var que empiece con `/` como si
fuera un path POSIX a convertir (`/banking-agent-dev/...` -> `C:/Program
Files/Git/banking-agent-dev/...`), y `getEmbeddingConfig()` atrapa el
`ParameterNotFound` resultante con gracia (silenciosamente cae a "sin
embeddings"), nunca lo expone. Fix: `export MSYS_NO_PATHCONV=1` antes de
correr cualquier script de este repo con un env var que empiece con `/`
en Git Bash.

### Estado final de esta fase

- 96 tests en `transaction-agent`, 99 en `conversation-agent`, 34 en
  `policy-agent`, 36 en `admin-agent` -- monorepo completo (9 workspaces)
  en verde, sin regresión en ninguno.
- `tsc --noEmit` limpio en los 4 servicios tocados.
- `docs/EVALUATION-DISPUTE-MATCHER.md` regenerado con datos reales de
  Bedrock (no una corrida sin embeddings) -- mismo criterio de rigor que
  el resto de este documento.

## Fase Revisión final contra la página pública del hackathon (2026-10-01)

El usuario pidió una última revisión cruzando el repo contra
`factored.ai/careers/ai-data-hackathon` (FAQs/entregables/rubric
públicos, distinto del PDF original que ya se mapeó en
`docs/EVALUATION-CRITERIA.md`). Encontró 2 gaps de cumplimiento reales
(no de calidad de código) y 2 gaps de documentación baratos:

1. **Nombre de repo no cumplía el formato exigido**
   (`factored-hackathon-2026-[team-name]`) -- el repo se llamaba
   `Factored-AI-JDLR`. Renombrado a `factored-hackathon-2026-jdlr`
   (`gh repo rename`), remote local actualizado
   (`git remote set-url`), verificado que no quedó ninguna referencia
   hardcodeada al nombre/URL viejo en el repo.
2. **Faltan 2 de los 4 entregables obligatorios**: deck de 4-6 slides y
   video pitch (máx. 3 min) -- NO implementados en esta fase a pedido
   explícito del usuario ("arma todo, menos los slides y el video, eso
   dejalo para después de terminar todo"). Quedan como pendiente
   explícito, no resuelto.
3. **El link del demo en vivo no estaba destacado** donde un evaluador lo
   buscaría -- solo aparecía una vez, enterrado en
   `EVALUATION-CRITERIA.md` como evidencia de un test. Agregado de forma
   prominente en el `README.md` (primeras líneas), con credenciales de
   prueba reales (María Fernanda, CUST-0001) para que un evaluador pueda
   probar `eligibility_check`/`dispute_unrecognized_charge` sin tener que
   leer código primero. Verificado real (`curl` contra la URL, HTTP 200).
4. **"Fairness" (production concern nombrado explícitamente en la página
   pública, ausente del mapeo original del PDF)** no tenía ninguna
   sección dedicada. Agregada en `docs/EVALUATION-CRITERIA.md`: lo
   defendible verificado leyendo código (`computeEligibilityScore` nunca
   usa atributos demográficos, solo señales de negocio), las asimetrías
   reales ya conocidas nombradas bajo este paraguas (umbral 2x por
   segmento Premium sin auditar impacto dispar, asimetría de detección
   de documento por idioma, clasificador de fraude nunca desagregado por
   atributo demográfico), y qué NO se hizo (ninguna prueba formal de
   impacto dispar).

### Estado final de esta fase

- Repo renombrado y verificado en GitHub real (`gh repo view`).
- README y `docs/EVALUATION-CRITERIA.md` actualizados, sin tocar código
  de ningún servicio -- esta fase es 100% documentación/compliance,
  cero riesgo de regresión.
- Pendiente explícito, a propósito: deck de slides + video pitch (los 2
  entregables obligatorios restantes), para una fase posterior.
