# Módulo `observability` — parcialmente cubierto en otros módulos, dashboards/alarmas pendientes

Sin recursos propios todavía (dashboards, métricas custom, alarmas). Este
checkpoint (pipeline end-to-end sobre AWS real, ver `docs/STATUS.md`) ya
cubre la parte de **logging estructurado y correlacionable** del pilar
Observability (`docs/EVALUATION-CRITERIA.md`), distribuida en los módulos
que generan cada log:

| Fuente | Dónde vive | Qué registra |
|--------|-----------|---------------|
| Step Function (`chat_orchestrator`) | `modules/orchestration`, log group `/aws/vendedlogs/states/<prefix>-chat-orchestrator` | Historial completo de cada ejecución (`level = ALL`, `include_execution_data = true`) — input/output de cada Task, incluido `caseId` (generado por conversation-agent si no viene en el request). Es el **execution record consultable por caso** que exige el pilar Observability: cada ejecución de Step Function queda asociada 1:1 a un turno de chat. |
| 4 Lambdas de negocio | `modules/agent`, log groups `/aws/lambda/<prefix>-{conversation,policy,retrieval,transaction}-agent` | Logs de aplicación de cada handler (ya estructurados en JSON por el propio código de `services/*`, ej. `{"service":"transaction-agent","event":"...","caseId":"...","turnId":"..."}` — correlación por `caseId`/`turnId` ya presente en el código, no agregada por infra). |
| Lambda dispatcher | `modules/orchestration`, log group `/aws/lambda/<prefix>-chat-dispatcher` | Errores del puente API Gateway → Step Function. |
| API Gateway | `modules/edge`, log group `/aws/apigateway/<prefix>-chat-api` | Access logs (requestId, status, ruta, latencia) — correlación por `requestId` de API Gateway, distinto de `caseId` (limitación conocida: no hay hoy un join automático entre `requestId` de API Gateway y `caseId` de la ejecución de Step Function; ambos son consultables pero por separado). |

Todos los log groups tienen retención explícita configurada (`var.log_retention_days`, default 30 días) en vez de retención infinita por defecto.

## Qué sigue pendiente (fase 7 de `docs/PLAN.md`, "Días 8-9")

- Dashboards de CloudWatch (latencia por Task de la Step Function, tasa de
  `status: unavailable`/`escalate`/`clarify`, invocaciones por Lambda).
- Alarmas sobre errores/latencia (ej. `OrchestrationFailed` de la ASL,
  throttling de DynamoDB, duración de Lambda cerca del timeout).
- Un mecanismo explícito de correlación end-to-end `requestId` (API Gateway)
  ↔ `caseId` (Step Function/DynamoDB) — hoy son consultables por separado,
  no unidos automáticamente en una sola vista.
- Métricas/alarmas si en el futuro se agrega el módulo `messaging` (colas,
  DLQ).

No instanciar este módulo desde `envs/dev` hasta que tenga recursos reales
de dashboards/alarmas.
