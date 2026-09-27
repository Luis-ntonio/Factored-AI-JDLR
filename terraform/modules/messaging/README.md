# Módulo `messaging` — sin recursos (decisión confirmada, no pendiente)

**Actualización:** la pregunta abierta de `docs/PLAN.md` ("¿hace falta una
cola de turnos SQS separada o basta con invocación directa Lambda→Lambda?")
quedó **resuelta**: el proyecto usa **Step Functions Express**
(`terraform/modules/orchestration`) como orquestador síncrono del pipeline
Understand→Decide→Act, invocado vía `StartSyncExecution` directamente desde
un Lambda dispatcher detrás de API Gateway. No hay cola de turnos SQS ni DLQ
propia de este módulo: Step Functions Express ya maneja la ejecución
síncrona del pipeline sin necesidad de una cola intermedia para este volumen
de tráfico (chat request/response en la misma conexión HTTP, no proceso
asíncrono tipo WhatsApp/Insider).

Este módulo queda **sin recursos por decisión**, no por estar pendiente de
implementar. Si en el futuro el proyecto necesita desacoplar la ingesta del
procesamiento (ej. picos de tráfico, reintentos asíncronos, procesamiento en
background), este es el lugar natural para agregar una cola SQS + DLQ frente
al dispatcher — no requeriría cambios estructurales en `orchestration` ni en
`agent`.

## Contexto original (blueprint completo)

Adaptado de la sección 4.5/8 del blueprint
`E2E-documentacion-tecnica/E2E-Implementacion-AWS-Terraform-Databricks.md`
(colas SQS de turnos del agente + DLQ, sin el EventBridge de publish a
Insider, que no aplica a este proyecto — nuestro canal es el chat UI de
`frontend-dev`, no WhatsApp).

No instanciar este módulo desde `envs/dev` mientras siga sin recursos.
