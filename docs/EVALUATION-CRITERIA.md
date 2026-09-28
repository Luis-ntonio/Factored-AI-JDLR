# Criterio de evaluación — PDF oficial del hackathon

> Fuente: `hacka-info/Factored AI & Data Hackathon 2026.pdf` (contexto local
> no versionado, leído completo el 2026-09-28). Esta versión del documento
> reemplaza una anterior basada en una slide suelta ("Think beyond the
> hackathon") — el PDF oficial es más detallado y es la fuente de verdad
> real. No es una sugerencia: es literalmente lo que se evalúa.

El PDF pide demostrar 6 puntos explícitos (pág. 3-4). Para cada uno, esta
sección dice **qué pide** y **dónde vive la evidencia en este repo** —
honestamente, incluyendo lo que falta.

## 1. "A problem supported by data"

Pide: analizar motivos de contacto, patrones de demanda, calidad de datos,
y usar esa evidencia para priorizar el flujo.

**Evidencia:** `hacka-info/EDA_LATAM_Bank_resumen.md` (contexto local, no
versionado) — el EDA real del equipo sobre el dataset del hackathon (19M
filas reales) que llevó al pivot de `credit-product info & eligibility` a
`transaction-dispute intake` como foco principal: 43.6% FCR en quejas vs.
91.5% en transaccional, disputas = 36% de las quejas, y el hallazgo crítico
de integridad de `complaints` (0/44,570 reclamos con ownership correcto).
Resumen y decisión documentados en `docs/STATUS.md`, "Fase 3".

## 2. "A functioning AI system"

Pide: mantener contexto conversacional relevante, clarificar ambigüedad, y
fundamentar respuestas factuales en información permitida de cuenta/
transacción/política.

**Evidencia:** `conversation-agent` (Understand) mantiene entities/intent
persistidos por `caseId` en DynamoDB, con continuidad de intent a través de
turnos (`resolveEffectiveIntent`, ver `docs/STATUS.md` "Fase Dispute 2",
Bug 2 — encontrado y arreglado durante QA real). `policy-agent` fuerza
CLARIFY cuando faltan datos (nunca inventa). `retrieval-agent`/
`transaction-agent` solo responden con datos verificables del catálogo/core
bancario simulado — nunca prosa libre del modelo para hechos.

## 3. "Controlled automation"

Pide: definir qué puede responder el sistema solo, qué requiere
confirmación, cuándo debe abstenerse/escalar, y proveer al agente humano
contexto completo (solicitud, hechos verificados, acciones tomadas,
evidencia, preguntas sin resolver).

**Evidencia:** `policies.yaml` (reglas AUTO/CLARIFY/ESCALATE, auditables,
fuera del prompt del modelo) + guardrail de Bedrock (`policy-agent/src/
bedrock/`, "el modelo propone, el código dispone" — most-conservative-wins,
ver `docs/STATUS.md` "Fase Dispute 2" para el bug real encontrado y
arreglado en este guardrail). `escalation-agent` arma el `EscalationSummary`
completo (resumen, entities conocidas, acciones intentadas, razón sin
resolver, pregunta pendiente) — nunca interpola PII cruda (ver `mask.ts` y
`security.test.ts`).

## 4. "Sound data and ML practice"

Pide explícitamente: datos preparados de forma repetible con contratos y
chequeos de calidad, **evaluar al menos un learned component contra un
baseline apropiado**, labels válidos, prevención de leakage, splits
justificados. Aclara que entrenar un modelo nuevo **no es obligatorio** — un
modelo pre-entrenado bien evaluado también cuenta.

**Evidencia (2 piezas, ver `docs/STATUS.md` "Fase ML" para el detalle
completo):**

- **Guardrail de Bedrock** (learned component pre-entrenado): harness de
  evaluación baseline-vs-sistema en `services/policy-agent/scripts/
  evaluate-decide-stage.ts`, 17 casos held-out, corrido contra Bedrock real
  — 16/17 correctos, con 1 desacuerdo real reportado sin ocultar. Reporte
  completo con métricas del propio vocabulario del PDF (Safe Automated
  Resolution, Unsafe Outcomes, Escalation Quality, costo/latencia con
  tokens reales) en `docs/EVALUATION-DECIDE-STAGE.md`.
- **Clasificador de fraude entrenado** (`ml/`, dataset real completo del
  hackathon: 4.4M transacciones): resultado **negativo, reportado
  honestamente** — el modelo no supera al baseline `fraud_score` ya
  provisto en el dataset (PR-AUC ~= base rate, incluso in-sample). Leakage
  prevention documentado explícitamente por campo (`ml/src/features.py`:
  qué columnas de `customers`/`products` se excluyen y por qué), split
  temporal con overlap de clientes reportado como métrica de transparencia,
  2 baselines comparados. Detalle en `ml/REPORT.md`.

## 5. "Measured quality and failure handling"

Pide: evaluar en casos held-out, incluir datos incorrectos/faltantes,
sesiones expiradas, **intentos de acceso no autorizado**, **fallos de
tools**, **prompt injection**, y ambigüedad multilingüe. Reportar resultados
exitosos, resultados inseguros, comportamiento de handoff, latencia y
costo, con tamaños de muestra y limitaciones.

**Evidencia parcial — gap real, no ocultado:**

- ✅ Held-out evaluation real con métricas/costo/latencia: `docs/
  EVALUATION-DECIDE-STAGE.md` (guardrail de Decide) y `ml/REPORT.md`
  (clasificador de fraude).
- ✅ Fallback seguro ante fallos de datos/tools: cada Lambda tiene reintentos
  acotados + fallback conservador documentado (`EligibilityUnavailableError`/
  `DisputeUnavailableError`, `fallbackDecision()` de policy-agent, etc. —
  ver `docs/STATUS.md`, pilar Reliability).
- ✅ Ambigüedad multilingüe: casos ES/PT en el held-out set de Decide,
  detección de idioma con tests de regresión (`language-detector.ts`).
- ⛔ **Gap real: no hay tests explícitos de prompt injection ni de intentos
  de acceso no autorizado** en el repo — solo existe `services/
  escalation-agent/test/security.test.ts`, que cubre enmascarado de PII, no
  esos dos escenarios. Pendiente.
- ⛔ **Gap real: no hay un caso de "sesión expirada"** modelado — el sistema
  no implementa autenticación por sesión (ver punto 6, Security).

## 6. "A credible route to operation"

Pide: tracing, reintentos acotados, fallback seguro, setup reproducible,
límites de capacidad, monitoreo, controles de acceso, retención de datos, y
explicaciones basadas en fuentes/reglas/registros de ejecución (nunca
chain-of-thought oculto como artefacto de auditoría).

Mapea a los 4 pilares que ya se venían trackeando en este proyecto desde el
checkpoint 0:

| Pilar | Qué exige | Dueño principal |
|-------|-----------|------------------|
| **Observability** | Tracing, execution records, monitoring | devops (CloudWatch/X-Ray) + verification-agent (logging estructurado por `caseId`) |
| **Reliability** | Bounded retries, safe fallback, tool failure handling | transaction-agent / retrieval-agent (retries acotados, fallback seguro) |
| **Security** | Authentication, access controls, data retention | devops (IAM, authZ en API Gateway) + policy-agent (qué datos se retienen/exponen) |
| **Reproducibility** | Setup instructions, versioning, repeatable evaluation | devops (README de setup, versionado Terraform) + los reportes de evaluación (`docs/EVALUATION-DECIDE-STAGE.md`, `ml/REPORT.md`) |

### Pilar Security — gaps resueltos y limitaciones conocidas

**Gap resuelto: "el pipeline solo invoca retrieval-agent/transaction-agent
cuando policy-agent autorizó AUTO, pero eso era solo un contrato de código,
no algo forzado por infraestructura".** Ahora está forzado en dos capas
independientes de IAM:

1. Los roles de ejecución de `conversation-agent` y `policy-agent` (los
   Lambdas que corren ANTES de la decisión AUTO) no tienen
   `lambda:InvokeFunction` sobre ningún recurso — no pueden invocar a
   retrieval-agent/transaction-agent aunque quisieran, sin importar qué
   decida su propio código.
2. El rol de ejecución de la Step Function (el único componente con
   `lambda:InvokeFunction`) lo tiene *scoped* a los ARNs exactos de los
   Lambdas de negocio, nunca `Resource: "*"`.
3. `retrieval-agent`/`transaction-agent` (y, por defensa en profundidad,
   también `conversation-agent`/`policy-agent`) tienen una resource-based
   policy (`aws_lambda_permission`) que solo permite invocación desde
   `states.amazonaws.com` con `source_arn` scoped a ESTA Step Function.

**Limitación real, documentada explícitamente (no escondida):** el usuario
IAM del proyecto (`banking-agent-dev`) tiene `AdministratorAccess`
(decisión de checkpoint 0). Ninguna de las medidas de arriba impide que
**ese usuario admin** invoque los Lambdas directamente vía `aws lambda
invoke` — las resource-based policies son un permiso *adicional* para
principals sin permiso propio, no un firewall contra un principal que ya
tiene `lambda:InvokeFunction` vía política de identidad admin. Endurecer
esto de verdad requeriría reemplazar `AdministratorAccess` por una policy
acotada — pendiente, fuera de scope de los 10 días.

**Gap real adicional (no estaba documentado antes, agregado 2026-09-28):**
no existe autenticación de usuario/sesión en el sistema — no hay flujo
anónimo-vs-autenticado, no hay token de sesión, no hay "step-up" pidiendo
identidad para acciones sensibles. El PDF pide explícitamente ("Data and
execution boundaries", pág. 5) *"Demonstrate authentication with a trusted
test session or identity service; a national ID or customer number alone
does not prove identity"* — hoy `document_id` es lo único que identifica al
cliente en el flujo de disputa/eligibility, sin una capa de sesión real
encima. Pendiente, no implementado en este checkpoint.

## Ser honestos sobre lo que falta (checklist de cierre)

- **Capacity limits** — hasta dónde escala lo construido (throughput,
  límites de Lambda/DynamoDB, concurrencia del agente). No medido con carga
  real en este checkpoint.
- **Data limitations** — el demo en vivo usa un mock chico (4 clientes, 24
  transacciones) que respeta el schema real, no el dataset completo; `ml/`
  sí entrena contra el dataset real completo, pero offline, no en el demo.
- **Language coverage** — ES/PT probados con casos reales y de regresión;
  portugués tiene menos volumen de casos que español en el held-out de
  Decide (2 de 17, ver `docs/EVALUATION-DECIDE-STAGE.md`) — limitación de
  muestra declarada, no oculta.
- **Deployment work** — pendiente real: autenticación de sesión (arriba),
  tests de prompt injection/acceso no autorizado (punto 5), hardening de
  `AdministratorAccess` (Security arriba), política de retención de `ttl`
  sin confirmar con negocio.
- **Remaining risks** — el clasificador de fraude entrenado no está en
  producción (resultado negativo, ver punto 4) — el riesgo de fraude en el
  flujo de disputa depende hoy del campo `is_fraud`/`fraud_score` del mock/
  dataset, no de un modelo propio validado en producción.

## Takeaway final

"Build something that works, prove that it works, and know when it should
not act." — esto es literalmente el requisito de **abstención**
(policy-agent: CLARIFY/ESCALATE en vez de actuar sin certeza) y de
**verificación** (verification-agent: nunca reportar éxito sin confirmar).
No son features opcionales, son el criterio central de evaluación — y
también es el criterio con el que se reportó honestamente el resultado
negativo del clasificador de fraude entrenado en vez de forzarlo a
producción.
