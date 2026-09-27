# Criterio de evaluación — "Make Your Result A Real Service"

> Fuente: slide del challenge ("Think beyond the hackathon"). No es una
> sugerencia, es parte de lo que se evalúa — reviewer.md y devops.md deben
> chequear contra esto antes de dar por cerrado el proyecto.

## Los 4 pilares

| Pilar | Qué exige | Dueño principal |
|-------|-----------|------------------|
| **Observability** | Tracing, execution records, monitoring | devops (CloudWatch/tracing) + verification-agent (logging estructurado por caseId) |
| **Reliability** | Bounded retries, safe fallback, tool failure handling | transaction-agent / retrieval-agent (retries acotados, fallback seguro, manejo de fallos de tool) |
| **Security** | Authentication, access controls, data retention | devops (IAM, authZ en API Gateway, políticas de retención) + policy-agent (reglas de qué datos se retienen/exponen) |
| **Reproducibility** | Setup instructions, versioning, repeatable evaluation | devops (README de setup, versionado Terraform) + reviewer (casos de prueba repetibles) |

## Pilar Security — gaps resueltos y limitaciones conocidas

Entrada agregada al conectar el pipeline end-to-end sobre AWS real
(`terraform/modules/agent`, `terraform/modules/orchestration`; ver
`docs/STATUS.md` y `terraform/README.md` para el detalle técnico completo).

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
   `lambda:InvokeFunction`) lo tiene *scoped* a los 4 ARNs exactos de los
   Lambdas de negocio, nunca `Resource: "*"` — y la definición ASL en sí
   misma solo llega a `ActRetrieval`/`ActTransaction` por el camino
   `RouteByDecision: AUTO` → `RouteAutoIntent`.
3. `retrieval-agent`/`transaction-agent` (y, por defensa en profundidad,
   también `conversation-agent`/`policy-agent`) tienen una resource-based
   policy (`aws_lambda_permission`) que solo permite invocación desde el
   principal de servicio `states.amazonaws.com` con `source_arn` scoped a
   ESTA Step Function específica (no a cualquier Step Function de la
   cuenta).

**Limitación real de este diseño, documentada explícitamente (no
escondida):** el usuario IAM del proyecto (`banking-agent-dev`) tiene
`AdministratorAccess` (decisión de checkpoint 0, ver `terraform/README.md`).
Ninguna de las medidas de arriba impide que **ese usuario admin** invoque
`retrieval-agent`/`transaction-agent` directamente vía `aws lambda invoke`
— las resource-based policies del punto 3 son un permiso **adicional** para
principals que NO tienen permiso propio (cross-account, o un servicio de AWS
como `states.amazonaws.com`), no un firewall contra un principal que ya
tiene `lambda:InvokeFunction` vía una política de identidad admin. Dicho de
otra forma: este diseño protege contra "un Lambda del propio pipeline se
salta un paso", no contra "un humano/rol con permisos administrativos de la
cuenta decide invocar algo directamente". Endurecer esto de verdad
requeriría reemplazar `AdministratorAccess` por una policy acotada por
servicio para el usuario del proyecto (ya anotado como pendiente en
`terraform/README.md` desde checkpoint 0) — fuera de scope de los 10 días de
este proyecto.

## Ser honestos sobre lo que falta

Al cierre (docs/STATUS.md P2) la sección de limitaciones debe cubrir
explícitamente estas categorías, no genéricas:

- **Capacity limits** — hasta dónde escala lo construido (throughput, límites
  de Lambda/DynamoDB, concurrencia del agente)
- **Data limitations** — qué tan real/representativo es el dato bancario
  simulado, qué no cubre
- **Language coverage** — qué tan robusto es ES/PT realmente, qué casos no se
  probaron
- **Deployment work** — qué falta para llevar esto a producción real (qué se
  simplificó del blueprint AWS y qué haría falta completar)
- **Remaining risks** — riesgos conocidos no mitigados (seguridad, compliance,
  fiabilidad)

## Takeaway final

"Build something that works, prove that it works, and know when it should not
act." — esto es literalmente el requisito de **abstención** (policy-agent:
CLARIFY/ESCALATE en vez de actuar sin certeza) y de **verificación**
(verification-agent: nunca reportar éxito sin confirmar). No son features
opcionales, son el criterio central de evaluación.
