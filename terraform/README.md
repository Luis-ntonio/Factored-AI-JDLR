# Terraform — AI-First Banking Agent (credit-product info & eligibility)

Infraestructura AWS real (no un mock desechable) para el flujo de
credit-product info & eligibility. Blueprint de referencia:
[`E2E-documentacion-tecnica/E2E-Implementacion-AWS-Terraform-Databricks.md`](../E2E-documentacion-tecnica/E2E-Implementacion-AWS-Terraform-Databricks.md)
(secciones 2, 4.2, 8, 9 y 11), adaptado a este proyecto **sin** canal
WhatsApp/Insider — el canal de entrada/salida es el chat UI que construye
`frontend-dev`. Ver también `docs/PLAN.md` (fases del proyecto) y
`docs/EVALUATION-CRITERIA.md` (criterio "Make Your Result A Real Service":
Observability, Reliability, Security, Reproducibility).

## Estado actual: pipeline Understand→Decide→Act→Verify→Escalate completo sobre AWS real

El pipeline completo está conectado y desplegado: **API Gateway → Lambda
dispatcher → Step Function (Express) → conversation-agent → policy-agent →
retrieval-agent/transaction-agent → verification-agent →
policy-agent (post_action, solo eligibility_check) → escalation-agent (en
los caminos ESCALATE)**, con un frontend real (`apps/web`) consumiendo el
endpoint. Ver `docs/STATUS.md` para el detalle funcional completo y
`docs/PLAN.md` para el historial de cómo se llegó a este estado (no se
construyó en este orden lineal).

### Arquitectura desplegada

```
Cliente (apps/web, chat UI real — ver ../apps/web/README o docs/STATUS.md)
   │  POST /chat  { caseId, turnId, message }
   ▼
API Gateway HTTP API (modules/edge)  ── access logs → CloudWatch, CORS restringido al dominio de CloudFront (module.frontend)
   │  AWS_PROXY
   ▼
Lambda "chat-dispatcher" (modules/orchestration)
   │  StartSyncExecution (Step Functions Express)
   ▼
Step Function "chat-orchestrator" (modules/orchestration, EXPRESS)
   │
   ├─ Understand  → Lambda conversation-agent (modules/agent)  ── DynamoDB case_store
   ├─ Decide      → Lambda policy-agent, stage=pre_action (modules/agent) ── policies.yaml embebido
   └─ RouteByDecision
        ├─ CLARIFY  → RespondClarify (responde directo policyDecision.askField/reason —
        │             es una repregunta al propio usuario, no una escalación; por diseño
        │             no pasa por escalation-agent)
        ├─ ESCALATE → EscalateFromPolicy → Lambda escalation-agent → RespondEscalate
        └─ AUTO → RouteAutoIntent
             ├─ ActRetrieval    → Lambda retrieval-agent (product_info/faq) ── DynamoDB product_catalog (solo lectura)
             └─ ActTransaction  → Lambda transaction-agent (eligibility_check) ── DynamoDB case_store (idempotencia + resultado)
             │
             └─ Verify → Lambda verification-agent (segunda verificación independiente)
                  ├─ pending_confirmation → EscalateFromVerification → escalation-agent → RespondEscalate
                  └─ verified
                       ├─ intent == eligibility_check → PostActionDecide → Lambda policy-agent, stage=post_action
                       │     ├─ ESCALATE (score borderline) → EscalateFromPostAction → escalation-agent → RespondEscalate
                       │     └─ AUTO → RespondAuto
                       └─ intent == product_info/faq → RespondAuto (no aplica post_action, no hay EligibilityResult)

Aparte del pipeline síncrono de arriba (fase 2, "AWS real / infra adicional"):

Navegador ── HTTPS ──▶ CloudFront (modules/frontend, OAC) ──▶ S3 privado (bucket vacío en este checkpoint, ver limitaciones)

DynamoDB case_store ── Streams (NEW_AND_OLD_IMAGES) ──▶ Lambda transformer (modules/analytics)
   ──▶ Kinesis Firehose (Direct PUT) ──▶ S3 (NDJSON.gz, particionado por fecha)
   [pipeline gateada por var.enable_analytics_pipeline = false en esta cuenta -- ver Limitaciones]
```

6 Lambdas de negocio en total (`conversation-agent`, `policy-agent`,
`retrieval-agent`, `transaction-agent`, `verification-agent`,
`escalation-agent`) + el Lambda dispatcher + (si `enable_analytics_pipeline
= true`) el Lambda de transformación de `modules/analytics`.

Todas las ejecuciones de la Step Function quedan registradas (`level = ALL`,
`include_execution_data = true`) en
`/aws/vendedlogs/states/<project>-<env>-chat-orchestrator` — es el
"execution record consultable por caso" que exige el pilar Observability.

### Qué crea cada módulo

| Módulo | Qué crea | Estado |
|--------|----------|--------|
| `modules/data` | Tabla `case-store` (case/session/conversation state, con **DynamoDB Streams habilitado**, `NEW_AND_OLD_IMAGES`) + tabla `product-catalog` (catálogo de productos/FAQs, sin GSI/TTL) + seeding automático del catálogo (`null_resource`+`local-exec`, ver abajo) | Real |
| `modules/edge` | API Gateway HTTP + stage con access logs + ruta `POST /chat` conectada al Lambda dispatcher + CORS restringido al dominio de CloudFront | Real |
| `modules/secrets` | SSM Parameter Store (model ID de Bedrock real elegido — `us.anthropic.claude-sonnet-5` — **no consumido todavía por ningún Lambda**, ver limitaciones) + Secrets Manager (placeholder) | Real |
| `modules/agent` | Los 6 Lambdas de lógica de negocio (conversation-agent, policy-agent, retrieval-agent, transaction-agent, verification-agent, escalation-agent) + IAM de mínimo privilegio + CloudWatch Log Groups | Real |
| `modules/orchestration` | Step Function Express (`chat-orchestrator`, 15+ estados incluyendo Verify/PostActionDecide/Escalate*) + su logging + Lambda dispatcher + `aws_lambda_permission` de invocación restringida a los 6 Lambdas | Real |
| `modules/frontend` | Bucket S3 privado (vacío en este checkpoint) + CloudFront con Origin Access Control (OAC, no OAI) + bucket policy scoped a la distribución | Real |
| `modules/analytics` | DynamoDB Streams (case_store) → Lambda de transformación → Kinesis Firehose (Direct PUT) → S3 (NDJSON.gz, particionado por fecha) | Código completo, **gateado por `var.enable_analytics_pipeline = false`** en esta cuenta — bloqueador real de cuenta, ver Limitaciones |
| `modules/messaging` | — | Sin recursos por **decisión confirmada** (Step Functions Express reemplaza la necesidad de cola de turnos), ver su README |
| `modules/observability` | — | Logging estructurado ya cubierto por los módulos de arriba; dashboards/alarmas dedicados quedan pendientes (fase 7), ver su README |

## Decisión confirmada: Step Functions Express (no Standard, no Lambda+colas)

Se evaluó la pregunta abierta de `docs/PLAN.md` ("¿Step Functions completo o
Lambda + colas simples?") y se resolvió por **Step Functions Express**,
invocada síncronamente vía `StartSyncExecution` desde el Lambda dispatcher.
Razón (sección 11 del blueprint de referencia): el chat necesita una
respuesta síncrona en la misma request HTTP, no un flujo asíncrono tipo
webhook con callback — Express está pensado exactamente para eso (alto
volumen, ejecuciones cortas, cobro por duración+invocaciones en vez de por
transición de estado como Standard). `start-execution` (asíncrono) es para
Standard y no aplica a este flujo. Ver `terraform/modules/orchestration/README.md`
para el detalle completo de la definición ASL y sus placeholders
documentados (CLARIFY/ESCALATE sin verification-agent/escalation-agent
reales todavía).

## Estrategia de empaquetado de Lambdas: esbuild, no zip de `dist/`+`node_modules`

`@banking-agent/shared` es una dependencia de npm workspaces resuelta como
**symlink** en `node_modules/`, no un paquete publicado. Zippear
`dist/`+`node_modules/` tal cual arriesga un Lambda desplegado que falla en
runtime con `Cannot find module '@banking-agent/shared'` (symlink roto fuera
del contexto del monorepo), o un zip inflado con dependencias transitivas de
todo el workspace.

Se eligió bundlear cada uno de los 4 Lambdas de negocio con **esbuild** a un
único archivo CJS (`terraform/scripts/package-lambdas.js`, invocado por
Terraform vía `null_resource`+`local-exec` en `modules/agent`, o a mano con
`npm run package:lambdas`), con entry point el `.ts` de cada servicio
directamente (esbuild transpila TS sin type-check — el type-check real ya lo
hace `npm run build`/`tsc`, que debe correr en verde antes de desplegar) y
`--external:@aws-sdk/*` (el runtime Node.js 20.x de Lambda trae el SDK v3
completo preinstalado). Esto resuelve el problema de symlinks de raíz:
esbuild inlinea todo el grafo de módulos resuelto en disco, symlinks
incluidos.

`policy-agent` y `transaction-agent` reciben además una copia de
`policies.yaml` (raíz del monorepo) dentro de su paquete
(`/var/task/policies.yaml` una vez desplegado), con
`POLICY_FILE_PATH=/var/task/policies.yaml` seteado explícitamente como
variable de entorno en ambos Lambdas.

El Lambda dispatcher (`modules/orchestration/lambda-src/chat-dispatcher/index.js`)
y el Lambda de transformación de `modules/analytics`
(`lambda-src/case-store-stream-transformer/index.js`) son JS plano sin
dependencias propias más allá del SDK v3 preinstalado en el runtime
(`@aws-sdk/client-sfn` y `@aws-sdk/client-firehose` respectivamente),
zippeados directamente sin paso de bundling.

Ver `terraform/modules/agent/README.md` para el detalle del flujo de build
dentro de Terraform (`null_resource` → `data.archive_file` → `aws_lambda_function`,
con el trigger de re-build basado en un hash del código fuente relevante).

## Seed manual del catálogo de productos/FAQs

El seed corre automáticamente en cada `terraform apply` que cambie
`services/retrieval-agent/src/data/catalog.ts` (ver `modules/data/README.md`).
Para correrlo a mano (ej. para verificar el contenido sin tocar Terraform):

```bash
# Desde la raíz del monorepo
npm run build --workspace=@banking-agent/retrieval-agent
cd services/retrieval-agent
CATALOG_TABLE_NAME=banking-agent-dev-product-catalog \
AWS_REGION=us-east-1 \
AWS_PROFILE=banking-agent-dev \
node dist/scripts/seed-catalog.js
```

Es idempotente (mismo `pk`/`sk` + contenido determinístico converge) y
falla ruidosamente (`process.exit(1)`) si una escritura falla.

## Prerequisitos

- Terraform `>= 1.5.0`.
- Node.js `>= 20` + `npm install` corrido en la raíz del monorepo (los
  Lambdas se bundlean con `esbuild`, devDependency de la raíz, y el seed del
  catálogo necesita `services/retrieval-agent` compilado).
- Credenciales AWS disponibles vía un **perfil dedicado** en
  `~/.aws/credentials` (ver sección "Credenciales AWS" abajo) o variables de
  entorno `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY`.
- Región por defecto: `us-east-1` (override con `var.aws_region`).
- `bash` disponible en PATH si vas a correr `local-exec` en Windows (Git
  Bash es suficiente); en Linux/Mac no hace falta nada adicional. El
  `local-exec` de este proyecto solo invoca `node <script>` — no usa
  sintaxis de shell específica de ningún sistema operativo (sin `&&`
  encadenados fuera del que ya soporta tanto `cmd.exe` como `sh`, sin `cp`/
  utilidades Unix-only), así que corre igual en Windows/Linux/Mac.
- **AWS CLI opcional, no requerido**: `terraform apply`/`plan`/etc. usan el
  provider de Terraform (Go SDK), no el CLI. La verificación empírica de
  Bedrock de este checkpoint (ver "Modelo Bedrock elegido" abajo) se hizo
  con el SDK de Node (`@aws-sdk/client-bedrock`) en vez del AWS CLI porque
  el CLI no estaba instalado en la máquina de devops -- documentado como
  alternativa válida, no como un requisito nuevo de este proyecto.

## Credenciales AWS

**No reutilizar un perfil personal existente** (ej. `amplifyDev`) para este
proyecto — mezcla el blast radius de esta infra con otras cuentas/recursos.
Ver pasos detallados de creación del usuario IAM dedicado
(`banking-agent-dev`, `AdministratorAccess`) más abajo en "Limitaciones".

## Cómo aplicar desde cero (`envs/dev`)

```bash
# 0. Desde la raíz del monorepo: instalar dependencias y confirmar que todo
#    el código de negocio compila y sus tests están en verde ANTES de
#    empaquetar Lambdas sobre un build roto.
npm install
npm run build
npm test

cd terraform/envs/dev

# 1. Inicializar (descarga providers hashicorp/aws + hashicorp/archive +
#    hashicorp/null, configura el backend local)
terraform init

# 2. (Opcional) copiar y ajustar variables
cp terraform.tfvars.example terraform.tfvars
# editar terraform.tfvars — NUNCA versionar este archivo con secretos reales

# 3. Revisar el plan
terraform plan

# 4. Aplicar (esto corre esbuild + el seed del catálogo automáticamente vía
#    null_resource/local-exec, no hace falta un paso manual aparte)
terraform apply
```

Para destruir (ej. al final de una sesión de pruebas):

```bash
terraform destroy
```

### Verificación post-deploy (independiente de este reporte)

```bash
# 1. Catálogo poblado (esperado: 20 items = 4 productos + 16 FAQs es/pt)
#    (usar el AWS CLI si está disponible, o el SDK de Node como alternativa)
aws dynamodb scan --table-name banking-agent-dev-product-catalog \
  --select COUNT --profile banking-agent-dev --region us-east-1

# 2. Invocación directa de la Step Function (bypass de API Gateway, para
#    aislar el orquestador)
aws stepfunctions start-sync-execution \
  --state-machine-arn "$(terraform output -raw state_machine_arn)" \
  --input '{"message":"cual es el horario de atencion"}' \
  --profile banking-agent-dev

# 3. Path HTTP completo (API Gateway -> dispatcher -> Step Function)
curl -X POST "$(terraform output -raw chat_api_endpoint)chat" \
  -H "Content-Type: application/json" \
  -d '{"caseId":"demo-1","turnId":"demo-turn-1","message":"cual es el horario de atencion"}'
```

## Frontend real (`apps/web`)

El endpoint `POST /chat` tiene CORS restringido al dominio real de
CloudFront de `module.frontend` (ver `modules/edge/README.md`, sección
"Actualización fase 2") para que la chat UI servida desde ese dominio pueda
consumirlo directo. La chat UI real del proyecto vive en `apps/web`
(workspace `@banking-agent/web`, React + Vite + TypeScript) y ya apunta al
endpoint de este ambiente (`apps/web/src/api.ts`, `CHAT_API_URL`):

```bash
# Desde la raíz del monorepo
npm install
npm run dev --workspace=@banking-agent/web
# Abrir http://localhost:5173
```

**Nota**: en dev local (`localhost:5173`) el CORS restringido al dominio de
CloudFront BLOQUEA ese origin -- `apps/web` corriendo en local necesita
`cors_allow_origins` override temporal (`["http://localhost:5173",
"https://<dominio-cloudfront>"]`) mientras no exista un pipeline de deploy
real de `apps/web` al bucket de `module.frontend` (ver
`modules/frontend/README.md`, "Qué NO crea este checkpoint" -- el bucket
está vacío, sin contenido subido todavía).

Ver `docs/STATUS.md` (bullet "frontend") para el detalle completo de la UI,
la evidencia de QA (build + pruebas reales en browser en ES y PT), y las
limitaciones conocidas de esa pieza.

## Convención de naming/tagging (contrato entre módulos)

Todos los módulos reciben `var.project_name`/`var.environment` y nombran sus
recursos como `${project_name}-${environment}-<recurso>` (ej.
`banking-agent-dev-case-store`, `banking-agent-dev-chat-orchestrator`), con
tags base `Project`, `Environment`, `ManagedBy = "terraform"`,
`Module = "<módulo>"`.

## Fase 2 "AWS real / infra adicional" (2026-09-27) — Bedrock real, frontend, analytics

Resumen de lo agregado en esta fase (detalle completo en cada README de
módulo referenciado):

1. **Bedrock real**: se eligió `us.anthropic.claude-sonnet-5` (inference
   profile) como modelo concreto, confirmado empíricamente contra la cuenta
   real (`aws bedrock list-foundation-models`/`list-inference-profiles`, vía
   SDK de Node). El parámetro SSM de `modules/secrets` ya tiene este valor
   real. **IAM de `bedrock:InvokeModel` deliberadamente NO agregado
   todavía** (decisión consciente, ver `modules/agent/README.md`, sección
   "Bedrock IAM: decisión de diferir") -- se mantiene el principio "no
   otorgar permiso sin código que lo use". **Bloqueador real de "model
   access"** pendiente de acción manual del usuario en la consola de AWS
   (ver `modules/secrets/README.md`, sección "Bloqueador: model access").
2. **`modules/frontend`** (nuevo): S3 privado + CloudFront con OAC para
   alojar el build de `apps/web`. Bucket vacío en este checkpoint (sin
   contenido subido). El dominio de CloudFront ya se usa como CORS real de
   `module.edge` (ver arriba).
3. **`modules/analytics`** (nuevo): DynamoDB Streams sobre `case_store` →
   Lambda de transformación → Kinesis Firehose → S3. Código completo y
   válido (`terraform plan -var enable_analytics_pipeline=true` genera un
   plan limpio de 14 recursos sin errores), pero **gateado a `false` por
   default en esta cuenta** por un bloqueador real de cuenta -- ver
   Limitaciones abajo.

## Limitaciones / omisiones conocidas

Documentadas explícitamente (no silenciadas) porque impactan los pilares de
`docs/EVALUATION-CRITERIA.md`:

- **Sin WAF frente al API Gateway ni frente a CloudFront** (impacta
  Security). Ver `modules/edge/README.md` y `modules/frontend/README.md`.
- **Sin autenticación/autorización en el API Gateway** (impacta Security). El
  endpoint `POST /chat` queda abierto — cualquiera con el endpoint puede
  invocar el pipeline completo. CORS restringido (ver abajo) limita qué
  páginas web pueden invocarlo desde un navegador, pero NO protege contra
  `curl`/Postman directo -- CORS es una protección de navegador, no de
  servidor. Pendiente antes de un cierre real de producción.
- **Bypass de IAM por el usuario admin del proyecto** (impacta Security,
  documentado en detalle en `modules/orchestration/README.md` y
  `docs/EVALUATION-CRITERIA.md`): el usuario `banking-agent-dev` tiene
  `AdministratorAccess`, así que las resource-based policies que restringen
  la invocación de retrieval-agent/transaction-agent a la Step Function no
  bloquean a ESE usuario si invoca los Lambdas directamente. Lo que SÍ está
  forzado por IAM: ningún rol de ejecución de Lambda (conversation-agent,
  policy-agent) puede invocar a otro Lambda saltándose la Step Function.
- ~~`allow_origins = ["*"]` en CORS del API Gateway~~ **Resuelto en fase 2**:
  `cors_allow_origins` ahora se resuelve al dominio real de CloudFront de
  `module.frontend` en vez de `"*"` (ver `modules/edge/README.md`,
  "Actualización fase 2", incluido un detalle técnico real sobre por qué la
  comparación ingenua `list == ["*"]` en HCL no funciona).
- **Bedrock: model ID real elegido, IAM diferido, "model access" bloqueado**
  (impacta Security/Reproducibility de la fase C/D futura, no de este
  checkpoint): ver sección "Fase 2" arriba y `modules/secrets/README.md` /
  `modules/agent/README.md` para el detalle completo, incluida la evidencia
  real de ambos hallazgos.
- **`modules/analytics` gateado por `var.enable_analytics_pipeline = false`**
  en esta cuenta (impacta Reproducibility de esa pieza específica, no del
  resto de la infra): bloqueador real de cuenta, **confirmado con dos
  llamadas independientes contra la API real** (no solo el intento de
  `terraform apply`, sino también una llamada de solo lectura
  `ListDeliveryStreamsCommand` con las credenciales admin del proyecto,
  descartando que fuera un problema de IAM de un rol específico) --
  `SubscriptionRequiredException: The AWS Access Key Id needs a
  subscription for the service` al intentar crear/leer un Kinesis Firehose
  delivery stream. Ver `terraform/envs/dev/variables.tf` (docstring de
  `enable_analytics_pipeline`) y `modules/analytics/README.md` para el
  detalle completo. El código del módulo es correcto y desplegable en
  cualquier cuenta con Firehose habilitado (`terraform plan -var
  enable_analytics_pipeline=true` genera un plan limpio de 14 recursos, sin
  errores de sintaxis/lógica, verificado en este checkpoint).
- **`modules/frontend` sin dominio custom, sin logging de acceso de
  CloudFront, sin lifecycle/versionado en el bucket** — ver
  `modules/frontend/README.md`, sección "Limitaciones conocidas".
- **`modules/analytics`: sin lifecycle policy de retención en el bucket de
  analytics** (impacta Security/data retention -- el TTL de 30 días de
  `case_store` NO se propaga a los datos replicados en S3) y **sin
  destino `on_failure`** en el event source mapping del Lambda de
  transformación (records que agotan reintentos se descartan sin rastro) --
  ver `modules/analytics/README.md`, sección "Limitaciones conocidas", y
  `modules/data/README.md`, sección "Política de data retention",
  "Actualización (fase 2)".
- **Backend de Terraform state local** (impacta Reproducibility/Reliability
  de la operación de infra). Ver `envs/dev/backend.tf`.
- **Un solo ambiente (`dev`)** en vez de `envs/{uat,prod}` del blueprint
  completo.
- **`modules/messaging` sin recursos por decisión** (Step Functions Express
  reemplaza la necesidad de una cola de turnos separada) — ver su README.
- **`modules/observability` sin dashboards/alarmas dedicados todavía** — el
  logging estructurado y correlacionable (Step Function execution records +
  logs de aplicación por Lambda + access logs de API Gateway) ya está
  cubierto por los módulos existentes; dashboards/alarmas quedan para fase 7
  de `docs/PLAN.md`. Ver `modules/observability/README.md` para el detalle
  de qué se correlaciona hoy y qué falta (ej. join `requestId`↔`caseId`).
- **Sin `ConditionExpression` atómica** en la escritura de idempotencia de
  transaction-agent (limitación heredada de `services/transaction-agent`,
  no de infra).
- **Sin rotación de secretos** en `modules/secrets`.
- El módulo `data` fija el mecanismo de TTL en `case_store` pero el valor de
  retención real (`DEFAULT_TTL_DAYS` en código de conversation-agent) es un
  placeholder — política de retención de negocio pendiente de coordinación
  final entre policy-agent y devops. Ver `modules/data/README.md`, sección
  "Política de data retention".

## Terraform init/validate/plan/apply — última corrida real verificada

`terraform fmt`, `terraform init`, `terraform validate` corren en verde
(providers `hashicorp/aws` v5.100.0, `hashicorp/archive` v2.8.1,
`hashicorp/null` v3.3.2). **Estado actual: `terraform plan` → "No changes"**
contra la cuenta AWS real del proyecto (última verificación: fase 2 "AWS
real / infra adicional", 2026-09-27, después de aplicar Bedrock real +
`modules/frontend` + `modules/analytics` gateado). El pipeline completo (6
Lambdas de negocio + dispatcher + Step Function con los estados de
Verify/PostActionDecide/Escalate\*) sigue desplegado sin cambios; se
sumaron `modules/frontend` (S3+CloudFront, real, desplegado) y
`modules/analytics` (código completo, no desplegado en esta cuenta por el
bloqueador de Firehose documentado arriba). **193 tests en verde** en todo
el monorepo (`npm test` desde la raíz, sin cambios de código de negocio en
esta fase). Seed del catálogo verificado (20 items: 4 productos + 16 FAQs
es/pt). Casos reales verificados de punta a punta contra AWS (Step Function
directa + `curl` al endpoint HTTP + frontend en browser real): `faq`/
`product_info` AUTO, `eligibility_check` AUTO (zonas approved/borderline/
declined), `escalation_request` ESCALATE, `eligibility_check` CLARIFY por
campos faltantes — en español y portugués, sin mezcla de idioma.

### Fase 2: secuencia real de apply (2026-09-27)

1. `terraform plan` (baseline) → "No changes" (fin de la fase pipeline
   E2E/i18n).
2. `terraform apply` de Bedrock real (SSM) + `modules/frontend` (nuevo) +
   `modules/analytics` (nuevo, sin gate todavía) → **falló** al crear
   `aws_kinesis_firehose_delivery_stream.case_store`:
   `SubscriptionRequiredException: The AWS Access Key Id needs a
   subscription for the service`. `modules/frontend` se aplicó
   completamente sin error en la misma corrida (bucket + OAC + distribución
   CloudFront + bucket policy, `Creation complete`); `modules/analytics`
   quedó parcialmente creado (bucket, IAM, log groups, sin Firehose/Lambda/
   event source mapping, que dependían del delivery stream fallido).
3. Se confirmó el bloqueador con una segunda llamada real e independiente
   (`ListDeliveryStreamsCommand`, solo lectura, mismas credenciales admin
   del proyecto) → mismo error exacto, descartando un problema de IAM
   scoped de un rol específico.
4. Se gateó `module.analytics` completo con `count =
   var.enable_analytics_pipeline ? 1 : 0` (default `false`), y se corrió
   `terraform plan`/`apply` de nuevo → **`Apply complete! Resources: 0
   added, 0 changed, 10 destroyed`** (los recursos parcialmente creados en
   el paso 2 se destruyeron limpiamente, dejando el state consistente con
   el flag en `false`).
5. Al revisar el CORS de `module.edge` (debía haber cambiado a apuntar al
   dominio de CloudFront), `terraform plan` seguía mostrando `allow_origins
   = ["*"]` sin cambios -- se encontró que `var.cors_allow_origins == ["*"]`
   da `false` SIEMPRE en HCL (bug real de tipos `list` vs `tuple`, ver
   `modules/edge/README.md`). Se corrigió a `join(",",
   var.cors_allow_origins) == "*"` → `terraform apply` →
   **`Apply complete! Resources: 0 added, 1 changed, 0 destroyed`**
   (`module.edge.aws_apigatewayv2_api.this` actualizado in-place,
   `allow_origins` pasó de `["*"]` a
   `["https://d1vi5rhqqyd97a.cloudfront.net"]`).
6. `terraform plan` final → **"No changes. Your infrastructure matches the
   configuration."**
7. Sanity check adicional (sin aplicar):
   `terraform plan -var enable_analytics_pipeline=true` → plan limpio de 14
   recursos a crear, 0 errores de sintaxis/lógica, confirmando que el
   código de `modules/analytics` es correcto y quedaría listo para una
   cuenta con Firehose habilitado con un solo cambio de variable.

## Redeploy puntual post-fix (2026-09-26): bug de detección de idioma

QA independiente (reviewer) encontró contra la Step Function real un bug de
`detectLanguage` en `services/conversation-agent/src/router/
language-detector.ts` (matching de substring sin límite de palabra:
`"quero"` se detectaba como español). conversation-agent aplicó el fix +
7 tests de regresión nuevos (detalle completo del bug, causa raíz y fix en
`docs/STATUS.md`, sección conversation-agent — no se duplica acá).

Devops verificó independientemente antes de aplicar:

1. `npm test` desde la raíz del monorepo: **121 tests en verde, 0 fallas**
   (5 `shared` + 31 `conversation-agent` + 19 `policy-agent` + 32
   `retrieval-agent` + 34 `transaction-agent`), confirmado con exit code 0.
2. `terraform plan` en `envs/dev`: el plan mostró `update in-place` sobre
   los 4 `aws_lambda_function` (no solo `conversation-agent`) porque
   `null_resource.build_lambdas` usa un **hash combinado único** sobre los
   `src/` de los 4 servicios + `packages/shared/src` + `policies.yaml`
   (ver `terraform/modules/agent/main.tf`) — cualquier cambio en cualquiera
   de esos árboles dispara un rebuild de los 4 paquetes en la misma
   invocación de `package-lambdas.js`, aunque solo se haya modificado
   `conversation-agent`. Esto es un efecto conocido del diseño actual del
   módulo (rebuild atómico, no per-servicio), no un bug — y no implicó en
   ningún momento destrucción/reemplazo de la tabla, el API Gateway, la
   Step Function u otros Lambdas (los 4 `aws_lambda_function` aparecen como
   `update in-place`, nunca `replace`; el único `-/+` del plan fue
   `null_resource.build_lambdas`, un recurso sin huella real en AWS).
3. `terraform apply`: en la práctica, solo `conversation-agent` tenía
   contenido de zip realmente distinto — resultado final **`Apply
   complete! Resources: 1 added, 1 changed, 1 destroyed`** (el "added"/
   "destroyed" son el `null_resource` recreándose; el único cambio real de
   infraestructura fue `module.agent.aws_lambda_function.conversation_agent`
   modificado in-place). `policy-agent`/`retrieval-agent`/`transaction-agent`
   no se tocaron porque su zip resultó con el mismo hash ya desplegado.
4. Re-verificación contra AWS real (`StartSyncExecutionCommand` sobre
   `arn:aws:states:us-east-1:<AWS_ACCOUNT_ID>:stateMachine:banking-agent-dev-chat-orchestrator`)
   de los 2 casos que QA había reportado fallando:
   - `"quero falar com um atendente"` → `status: "escalate"`,
     `language: "pt"`, `intent: "escalation_request"` (antes: `clarify`
     con `language` mal detectado como `"es"`).
   - `"quero saber os requisitos"` → `language: "pt"` correctamente
     detectado (`status: "clarify"`, `intent: "unknown"` — esperado, sin
     relación con el bug de idioma ya corregido).

Limitación anotada para el checkpoint final: el trigger de rebuild
combinado (punto 2 arriba) es menos quirúrgico de lo ideal — un cambio en
cualquiera de los 4 servicios fuerza a Terraform a re-leer los 4
`archive_file` y marcarlos como cambio potencial en el `plan` (aunque el
`apply` termine siendo no-op para los que no cambiaron realmente). Migrar a
un `null_resource`/hash por servicio sería más preciso pero no se priorizó
en el scope de 10 días dado que el `apply` real ya es seguro (sin
destrucción de recursos, sin downtime más allá del update in-place normal
de Lambda).
