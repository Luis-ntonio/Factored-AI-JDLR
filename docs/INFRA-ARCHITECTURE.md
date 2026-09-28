# Arquitectura de infraestructura — qué está conectado y qué falta

Documento vivo — describe la infraestructura AWS REAL desplegada (no un
diseño aspiracional). Todo lo marcado ✅ está aplicado y verificado contra
AWS real en esta sesión o en sesiones anteriores del proyecto (`terraform
apply`/`curl`/CloudWatch reales, nunca solo `terraform plan`). Todo lo
marcado ⛔/🚧 está documentado explícitamente como gap, nunca oculto.
Complementa `docs/FLOWS.md` (qué hace el sistema) y `docs/
EVALUATION-CRITERIA.md` (cómo se mide contra el rubric del hackathon).
Última actualización: 2026-09-28.

## Diagrama de alto nivel

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────────────────────┐
│  Frontend    │────▶│  API Gateway      │────▶│  chat-dispatcher (Lambda)    │
│  (S3+CF)     │     │  HTTP API         │     │  → StartSyncExecution        │
└─────────────┘     │  (banking-agent-  │     └──────────────┬───────────────┘
                     │   dev-chat-api)   │                    │
                     │                   │     ┌──────────────▼───────────────┐
                     │  POST /auth/*  ───┼────▶│  auth-agent (Lambda directo,  │
                     │  (login/otp)      │     │  NUNCA vía Step Function)     │
                     └───────────────────┘     └───────────────────────────────┘
                                                              │
                                        ┌─────────────────────▼─────────────────────┐
                                        │  Step Functions Express                     │
                                        │  banking-agent-dev-chat-orchestrator         │
                                        │  conversation → policy → (retrieval|         │
                                        │  transaction) → verification →               │
                                        │  (escalation si ESCALATE)                    │
                                        └───────────────────────────────────────────────┘
```

## Componentes desplegados (✅ conectado y verificado)

### Edge (`terraform/modules/edge`)
API Gateway HTTP API única (`banking-agent-dev-chat-api`), rutas:
- `POST /chat` → integración con `chat-dispatcher` (único punto de entrada
  al pipeline Understand→Decide→Act→Verify→Escalate).
- `POST /auth/login`, `POST /auth/otp/request`, `POST /auth/otp/verify` →
  las 3 comparten la MISMA integración → `auth-agent`, que despacha
  internamente por `rawPath` — nunca pasan por la Step Function (login no
  es un turno del pipeline).

CORS restringido al dominio real de CloudFront (no `"*"` — hardening ya
aplicado, ver `local.cors_allow_origins` en `envs/dev/main.tf`).

### Orquestación (`terraform/modules/orchestration`)
Step Functions **Express** (síncrona) — decisión confirmada: no hace falta
una cola SQS de turnos para este volumen (request/response en la misma
conexión HTTP, no un canal asíncrono tipo WhatsApp). `chat-dispatcher`
(Lambda delgado, sin dependencias de negocio) hace `StartSyncExecution` y
devuelve la respuesta tal cual.

### Los 7 Lambdas de negocio (`terraform/modules/agent`)
`conversation-agent`, `policy-agent`, `retrieval-agent`, `transaction-agent`,
`verification-agent`, `escalation-agent`, `auth-agent` — bundleados con
esbuild (`terraform/scripts/package-lambdas.js`), IAM de mínimo privilegio
por Lambda.

**Aislamiento forzado a nivel de infraestructura, no solo de convención de
código** (gap resuelto, documentado en `docs/EVALUATION-CRITERIA.md`):
- `conversation-agent`/`policy-agent` no tienen `lambda:InvokeFunction`
  sobre NINGÚN recurso — no pueden invocar `retrieval-agent`/
  `transaction-agent` aunque su propio código quisiera.
- El rol de la Step Function (el único con `lambda:InvokeFunction`) lo
  tiene scoped a los ARNs exactos de los Lambdas de negocio, nunca
  `Resource: "*"`.
- Cada Lambda de negocio tiene una resource-based policy que solo permite
  invocación desde `states.amazonaws.com` con `source_arn` scoped a ESTA
  Step Function.

### Datos (`terraform/modules/data`)
3 tablas DynamoDB, `PAY_PER_REQUEST`:
- `case-store`: conversación/estado por `caseId` (`pk=CASE#<id>`,
  `sk=MSG#<id>`, GSI `by-customer`), TTL, **DynamoDB Streams habilitado**
  (`NEW_AND_OLD_IMAGES`) — consumido hoy por nada (ver sección de gaps,
  Analytics).
- `product-catalog`: catálogo de productos + FAQs, sembrado desde
  `services/retrieval-agent/src/data/catalog.ts` en cada `apply` que
  cambie ese archivo.
- `otp-codes`: códigos de un solo uso del login OTP, TTL nativo en
  `expiresAt` (10 min).

### Secretos (`terraform/modules/secrets`)
SSM Parameter Store — `bedrock_model_id`/`bedrock_region` (String plano,
no sensible), `session_token_secret` (SecureString, `random_password`
generado por Terraform), `resend_api_key` (SecureString, placeholder en
Terraform con `lifecycle.ignore_changes` — el valor real lo carga el
usuario fuera de banda vía CLI, nunca en git).

### Frontend (`terraform/modules/frontend`)
S3 (`banking-agent-dev-frontend`) + CloudFront
(`d1vi5rhqqyd97a.cloudfront.net`). Deploy real vía
`apps/web/scripts/deploy.mjs` (sync a S3 + invalidación de CloudFront) —
no automatizado en CI todavía, se corre a mano.

### Bedrock
Inference profile de Claude Sonnet 5 (`us.anthropic.claude-sonnet-5`),
invocado por `conversation-agent` (Understand, clasificación de
intent/idioma/entities con tool-use forzado) y `policy-agent` (guardrail de
Decide, "el modelo propone, el código dispone" — el resultado final siempre
lo decide `policies.yaml` con la severidad más conservadora entre regla y
modelo).

### Resend (servicio de terceros)
API REST de Resend (`https://api.resend.com/emails`, `fetch` nativo sin SDK
nuevo) para el envío de códigos OTP. Dominio remitente
`no-reply@phonance.com` (ya verificado en la cuenta de Resend del usuario,
de otro proyecto — config no sensible, va en una env var plana, no en SSM).

### Observability (parcial — `terraform/modules/observability`, sin
recursos propios todavía)
Logging estructurado correlacionable YA existe, distribuido en otros
módulos:
- Step Function: historial completo por ejecución (`level=ALL`,
  `include_execution_data=true`), 1:1 con cada turno de chat.
- Los 7 Lambdas: logs JSON estructurados por `caseId`/`turnId` (ya en el
  código de `services/*`, no agregado por infra).
- API Gateway: access logs (`requestId`, status, ruta, latencia).
- Retención explícita en todos los log groups (`var.log_retention_days`,
  default 30 días — nunca infinita por default).

## 🚧 Scaffolded pero NO desplegado

### Analítica (DynamoDB Streams → Lambda → Kinesis Firehose → S3)
`terraform/modules/analytics` — código completo y válido (`terraform plan`
con `enable_analytics_pipeline=true` muestra el plan completo sin errores
de sintaxis/lógica), pero **`enable_analytics_pipeline = false`** en
`envs/dev` por un bloqueador real de cuenta, no de código:

> **Kinesis Firehose no está disponible en la cuenta AWS de este proyecto**
> (tier freemium/free-tier). Confirmado con DOS llamadas reales
> independientes: (1) `terraform apply` creando el delivery stream falló
> con `SubscriptionRequiredException`; (2) una llamada de SOLO LECTURA
> (`ListDeliveryStreamsCommand`) con las credenciales admin del proyecto
> dio el mismo error — descarta que sea un problema de IAM del rol
> específico, confirma que es una restricción de cuenta/tier. Requiere
> upgrade a una cuenta de pago o contactar AWS Support/Sales.

**Sobre Databricks específicamente**: el pipeline (cuando `enable_
analytics_pipeline=true` en una cuenta con Firehose habilitado) deja los
datos en S3 como NDJSON gzipeado, particionado Hive-style
(`year=/month=/day=`), en formato DynamoDB JSON sin aplanar (estándar,
legible por Spark/Databricks/Glue con un deserializador estándar) —
**pero la integración de CONSUMO (un job de Databricks u otra herramienta
leyendo ese S3) está fuera de scope por decisión explícita del usuario**,
no es solo "no hubo tiempo". El pipeline llega hasta S3 y ahí termina a
propósito.

Para activarlo el día que haya una cuenta con Firehose disponible: cambiar
`enable_analytics_pipeline = true` en `terraform.tfvars` y `apply` — cero
cambios de código adicionales.

### Clasificador de fraude entrenado (ML) — resultado negativo, no integrado
`ml/` (pipeline Python completo, dataset real de 4.4M transacciones,
resultado documentado en `ml/REPORT.md`):

| Métrica | Modelo entrenado | Baseline (threshold sobre `fraud_score`) |
|---------|-------------------|---------------------------------------------|
| PR-AUC | **0.0009** | 0.5716 |
| F1 | 0.0019 | 0.7222 |
| Precision | 0.0009 | 1.0000 |
| Recall | 0.0448 | 0.5652 |

El modelo (probado con regresión logística Y gradient boosting, mismo
resultado en ambos) **no supera al baseline** — ni siquiera en el propio
set de entrenamiento (PR-AUC in-sample 0.0020 contra un base rate de
0.00096, prácticamente sin separación). No es un bug de generalización: las
features disponibles sin `fraud_score` (que se reservó como baseline, nunca
como input del modelo) simplemente no predicen `is_fraud` mejor que el azar
en este dataset.

**Decisión explícita del usuario tras ver el resultado**: "dejemos el
modelo entrenado así, sigamos como ahora" — nunca se integró a producción.
`services/transaction-agent/src/compute-dispute.ts` sigue leyendo
`transaction.is_fraud` directo del mock/dataset (label conocido, no un
score predicho en tiempo de consulta) — honestamente documentado como la
limitación que es, no ocultado. El clasificador entrenado vive solo como
evaluación offline en `ml/`, nunca en el camino de decisión real.

## ⛔ Gaps conocidos, sin trabajo de código pendiente (decisiones/hardening)

- **`AdministratorAccess` en el usuario IAM del proyecto** — las
  resource-based policies de arriba blindan contra principals SIN permiso
  propio, pero no contra este usuario admin invocando Lambdas directo vía
  `aws lambda invoke`. Reemplazar por una policy acotada queda fuera de
  scope de los 10 días del hackathon.
- **Sin WAF** en el API Gateway.
- **Sin dashboards ni alarmas de CloudWatch** (`terraform/modules/
  observability` sin recursos propios) — latencia por Task de la Step
  Function, tasa de `status: unavailable`/`escalate`/`clarify`,
  throttling de DynamoDB, todo consultable manualmente en logs pero sin
  visualización ni alerta automática.
- **Sin correlación automática `requestId` (API Gateway) ↔ `caseId`
  (Step Function/DynamoDB)** — ambos son consultables, pero por separado,
  no unidos en una sola vista/dashboard.
- **Política de retención (`ttl`) sin confirmar con negocio** — el atributo
  TTL existe técnicamente en `case-store`/`otp-codes`, el valor concreto es
  un default razonable, no una decisión de negocio validada.
- **Sin carga real probada** (capacity limits) — throughput, límites de
  Lambda/DynamoDB, concurrencia, todo sin medir bajo carga.
- **Sin mensaje distinto para "sesión expirada" vs. "nunca inició sesión"**
  en el chat — `resolveRole` degrada correctamente a `anonimo` cuando el
  token expira (seguro), pero la UX del chat no distingue los dos casos
  todavía.
- **Íconos/ilustración de la landing pendientes** — el plugin
  `media-pipeline` (Gemini/OpenAI) está instalado, pero sin
  `GEMINI_API_KEY`/`OPENAI_API_KEY` configurada en el entorno la
  generación real falla. Herramienta lista, credencial no.

## Módulo `messaging` — sin recursos, por decisión (no un gap)

`terraform/modules/messaging` existe pero está vacío a propósito: la
pregunta abierta original ("¿hace falta una cola SQS de turnos?") se
resolvió con Step Functions Express manejando la ejecución síncrona sin
necesidad de una cola intermedia para este volumen de tráfico. Si el
proyecto necesitara desacoplar ingesta de procesamiento en el futuro (picos
de tráfico, reintentos asíncronos), este es el lugar natural para una cola
SQS + DLQ — no requeriría cambios estructurales en `orchestration`/`agent`.
