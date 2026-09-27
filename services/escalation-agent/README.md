# escalation-agent

Capa **"Escalate"** del pipeline (`credit-product info & eligibility`): la
**última pieza** antes de que un humano reciba (o no) información sobre un
caso que no pudo resolverse 100% automáticamente. Nunca expone el transcript
crudo del usuario ni un JSON sin resumir de `policyDecision`/
`VerificationResult` — produce un `EscalationSummary` legible por un humano
**en segundos**.

Es invocado por la Step Function real (`banking-agent-dev-chat-orchestrator`,
`terraform/modules/orchestration/asl/chat-orchestrator.asl.json.tftpl`) desde
**tres orígenes distintos** (decisión de arquitectura del coordinador, no
cuestionada acá):

1. **`origin: "policy_decision"`** — policy-agent decidió `ESCALATE` en
   `stage: pre_action`, **antes** de intentar cualquier acción
   (retrieval-agent/transaction-agent nunca corrieron para este turno).
   Reemplaza el placeholder `RespondEscalate` del ASL (hoy devuelve el
   `PolicyDecisionResult` crudo de policy-agent sin resumir).
2. **`origin: "verification_failed"`** — sí se intentó una acción
   (retrieval-agent o transaction-agent) en el camino AUTO, pero
   verification-agent reportó `status: "pending_confirmation"` — no pudo
   confirmar activamente que el resultado fuera consistente.
3. **`origin: "post_action_decision"`** — sí se intentó y se COMPLETÓ una
   acción real (transaction-agent calculó elegibilidad) Y verification-agent
   SÍ confirmó que el resultado era internamente consistente
   (`verified: true`). La escalada ocurre en el paso nuevo `PostActionDecide`
   del ASL (entre `Verify` y `RespondAuto`, solo para
   `intent: eligibility_check`), que reinvoca a policy-agent en modo
   `stage: post_action` sobre el `EligibilityResult` ya verificado. Cuando
   esa segunda pasada decide `ESCALATE` (ej. regla `escalate-score-borderline`
   de `policies.yaml`, score en zona límite), el motivo es una decisión de
   **negocio posterior**, no una falla de verificación ni una excepción
   previa a la acción — por eso `attemptedActions` acá NUNCA es `[]` (algo sí
   se intentó y se completó), a diferencia de `"policy_decision"`.

Los tres orígenes terminan en el **mismo tipo de resumen estructurado**; la
diferencia es solo qué pasó antes de llegar acá (nada intentado / algo
intentado sin poder confirmarse / algo intentado y confirmado pero escalado
por una regla de negocio posterior).

Runtime: Node.js 20.x + TypeScript (CommonJS), mismo criterio que el resto
del pipeline.

## Estructura

```
src/
  types.ts               # EscalationInput, PolicyDecisionResultLike (mirror local), AttemptedAction
  mask.ts                 # maskDocumentId + redactRawDocumentId (núcleo de Security/PII)
  narrative.ts             # buildUserRequestSummary -- narrativa humana en templates ES
  known-entities.ts        # summarizeKnownEntities / emptyKnownEntities
  pending-question.ts      # attemptedActions[] + pendingQuestion por cada origin
  build-summary.ts         # buildEscalationSummary -- composición pura, camino feliz
  fallback.ts              # bestEffortFallback -- extracción defensiva ante input malformado
  handler.ts                # handler de Lambda (Task-a-Task, JSON plano)
  index.ts                  # barrel + re-exporta handler
test/                        # vitest — fixtures.ts, mask.test.ts, build-summary.test.ts,
                              # handler.test.ts, security.test.ts
```

## Contrato

Task-a-Task dentro de la Step Function (**nunca** expuesto vía API Gateway —
mismo criterio que `policy-agent`/`verification-agent`). Acepta y devuelve
JSON plano, sin envoltura `APIGatewayProxyEventV2`.

**Entrada** (`EscalationInput`, ver `src/types.ts`):

```ts
interface EscalationInput {
  origin: "policy_decision" | "verification_failed" | "post_action_decision";
  understand: UnderstandOutput;              // SIEMPRE presente
  policyDecision?: PolicyDecisionResultLike; // presente si origin === "policy_decision"
                                              // o origin === "post_action_decision"
  attemptedAction?: {
    intent: "product_info" | "faq" | "eligibility_check";
    verification: VerificationResult;        // presente si origin === "verification_failed"
  };
}
```

**Salida** (`EscalationSummary`, `@banking-agent/shared`,
`packages/shared/src/contracts/escalation-summary.ts`):

```ts
interface EscalationSummary {
  caseId: string;
  customerId: string | null;
  language: "es" | "pt";
  intent: Intent;
  origin: "policy_decision" | "verification_failed" | "post_action_decision";
  userRequestSummary: string;         // narrativa humana corta, ES
  knownEntities: KnownEntitiesSummary; // Entities sin document_id
  maskedDocumentId: string | null;     // NUNCA el valor crudo
  attemptedActions: string[];          // [] solo si origin === "policy_decision"
  unresolvedReason: string;
  pendingQuestion: string | null;      // nunca null en el camino de fallback
}
```

Este es el contrato de salida de la Step Function en el status `"escalate"`
— se devuelve tal cual al frontend/canal para el operador humano, **nunca**
al usuario final del chat.

## Lógica (camino feliz, `src/build-summary.ts`)

1. **`userRequestSummary`** — una oración en español generada por templates
   determinísticos (`src/narrative.ts`) a partir de `intent` +
   `entities.product_type`/`requested_amount` (nunca lee `document_id`).
2. **`knownEntities`** — proyección de `Entities` que excluye explícitamente
   `document_id` (`src/known-entities.ts`); el resto de campos no es PII
   directa (`docs/CONTRACTS.md` 4.3) y se expone tal cual (`null` si no se
   conoce todavía).
3. **`maskedDocumentId`** — `maskDocumentId(entities.document_id)`
   (`src/mask.ts`): últimos 4 caracteres visibles, resto reemplazado por
   `*`; documentos de 4 caracteres o menos se enmascaran por completo.
4. **`attemptedActions` / `unresolvedReason` / `pendingQuestion`** —
   dependen de `origin`:
   - `"policy_decision"`: `attemptedActions = []`; `unresolvedReason` =
     `policyDecision.reason` (texto estático de `policies.yaml`, o un
     default genérico si viene ausente/vacío); `pendingQuestion` =
     `"Confirmar/completar manualmente el dato '<askField>'..."` si
     `policyDecision.askField` existe, o una instrucción genérica de
     revisión manual si no.
   - `"verification_failed"`: `attemptedActions` tiene una entrada
     describiendo qué se intentó (`src/pending-question.ts`, una plantilla
     por `intent`: `eligibility_check`/`product_info`/`faq`);
     `unresolvedReason` = `attemptedAction.verification.reason` o un
     default genérico; `pendingQuestion` = una instrucción concreta acorde
     al tipo de acción no confirmada.
   - `"post_action_decision"`: `attemptedActions` tiene una entrada
     describiendo que la acción SÍ se completó y SÍ se confirmó, pero
     policy-agent decidió escalar en `stage: post_action`
     (`buildPostActionAttemptedActionDescription`, `src/pending-question.ts`);
     `unresolvedReason` = `policyDecision.reason` (texto estático de la
     regla `post_action` que ganó, ej. `escalate-score-borderline`) o un
     default genérico propio si viene ausente/vacío; `pendingQuestion` =
     `buildPolicyPendingQuestion(policyDecision)` (idéntico a
     `"policy_decision"` — reglas `post_action` no usan `ask_field`, así que
     en la práctica siempre cae al mensaje genérico de revisión manual).
5. **Redacción final defensiva** (`redactRawDocumentId`, `src/mask.ts`) —
   ver sección Security abajo.

**Decisión de diseño — normalización de `origin`:** los tres valores válidos
(`"policy_decision"`, `"verification_failed"`, `"post_action_decision"`) se
reconocen explícitamente; cualquier OTRO valor (realmente desconocido) sigue
cayendo al default más conservador, `"policy_decision"`:
`attemptedActions: []` nunca inventa una acción que no sabemos si ocurrió, y
la rama de `pendingQuestion` de `policy_decision` sigue siendo una
instrucción accionable aunque `origin` viniera con un valor inesperado.

## Security — cómo se cumple `sec-masked-identifier-for-escalation`

`policies.yaml` (sección `security`) dejaba esta regla explícitamente
**"PENDIENTE de confirmar con escalation-agent cuando se implemente"** — esta
pieza es esa confirmación:

- El solicitante se referencia **siempre** por `caseId`/`customerId`
  (identificadores internos, no-PII) — nunca hay una URL/API/log que use
  `entities.document_id` como clave.
- Si hace falta mostrar el documento, se usa `maskedDocumentId` (últimos 4
  caracteres visibles, resto `*`) — **nunca** el valor crudo.
- `knownEntities` **excluye la key `document_id` por completo** (no solo la
  enmascara) — no hay forma de que un consumidor la lea por accidente desde
  ese objeto.
- **Defensa en profundidad**: `redactRawDocumentId` (`src/mask.ts`) recorre
  recursivamente TODOS los campos de texto del `EscalationSummary` final
  (incluyendo `unresolvedReason`, que proviene de texto ajeno —
  `policyDecision.reason`/`verificationResult.reason` — no generado por este
  servicio) y reemplaza cualquier ocurrencia literal del valor crudo por su
  versión enmascarada. Esto protege incluso ante un `reason` mal formado que,
  por un bug de policy-agent/verification-agent, incluyera el valor crudo
  (nunca debería ocurrir según sus propios contratos — ver
  `sec-no-raw-pii-in-reason` en `policies.yaml` y el docstring de
  `VerificationResult` — pero se prueba la red de seguridad de todos modos,
  ver `test/security.test.ts`, caso "adversarial").
  - Umbral: solo se redacta por substring si el valor crudo tiene 5+
    caracteres (`MIN_REDACTABLE_LENGTH`), para evitar falsos positivos sobre
    números no relacionados (ej. un monto que contuviera por casualidad los
    mismos 4 dígitos que un documento corto). Documentos de identidad reales
    siempre superan ese umbral en la práctica.
- El camino de **fallback ante input malformado** (`src/fallback.ts`) aplica
  exactamente la misma redacción — un evento malformado que trajera
  `document_id` crudo en cualquier forma tampoco lo filtra.

## Reliability (AÚN MÁS crítico que en el resto del pipeline)

Esta es la **última capa** antes de que un humano reciba, o no, información
accionable — un fallo acá nunca debe dejar al humano sin ningún resumen.

- El handler **nunca lanza una excepción sin manejar**.
- Si `event` no es un objeto, o `event.understand` no cumple la forma mínima
  de `UnderstandOutput` (`isUnderstandOutput`, `@banking-agent/shared`) —
  incluyendo `understand` ausente — se responde directamente con
  `bestEffortFallback(event)`, sin intentar `buildEscalationSummary`.
- Cualquier excepción inesperada dentro de `buildEscalationSummary` (bug no
  previsto, forma inesperada de `policyDecision`/`attemptedAction` más allá
  de lo que TypeScript garantiza en runtime) se atrapa en el único try/catch
  de nivel superior de `handler.ts` y también responde
  `bestEffortFallback(event)`.
- `bestEffortFallback` (`src/fallback.ts`):
  - busca `caseId`/`customerId` de forma **defensiva** (recorre rutas fijas
    razonables: `event.understand.context.caseId`, luego `event.caseId`,
    etc. — nunca asume la forma completa del evento), con `"unknown_case"`
    como último recurso para `caseId` (nunca `undefined`/`null`, el contrato
    exige `string`);
  - intenta rescatar y enmascarar un `document_id` si aparece en alguna ruta
    razonable del evento, pero **nunca** expone el valor crudo;
  - `unresolvedReason` fijo: `"escalation_internal_error: no se pudo
    construir un resumen completo, revisión manual completa requerida"`;
  - `pendingQuestion` **nunca es `null`** en este camino — siempre una
    instrucción de revisión manual prioritaria.

## Variables de entorno

**Ninguna.** A diferencia de policy-agent/transaction-agent/
verification-agent, escalation-agent **no lee `policies.yaml`** ni ningún
otro archivo de configuración en runtime — es pura transformación de datos
ya recolectados por las capas anteriores del pipeline (Understand/Decide/
Act/Verify), que le llegan completos dentro del propio `EscalationInput`.
No hay ningún umbral de negocio que este servicio necesite resolver por sí
mismo.

## IAM / Infra (para devops)

- **Sin acceso a DynamoDB ni a ningún otro recurso AWS.** Este servicio no
  lee archivos locales adicionales ni llama a otros servicios — solo
  transforma el JSON de entrada y loguea a CloudWatch.
- IAM role mínimo: **solo `AWSLambdaBasicExecutionRole`** (permisos de
  CloudWatch Logs). **Sin** `dynamodb:*`, **sin** `lambda:InvokeFunction` —
  mismo criterio que `verification-agent`.
- **No conectado a Terraform.** El handler está listo para Lambda
  `nodejs20.x`, pero conectarlo al Task `RespondEscalate` (y a un eventual
  Task nuevo para el camino `verification_failed`) de
  `chat-orchestrator.asl.json.tftpl`, y crear el rol IAM mínimo, es
  responsabilidad de devops (fase posterior a este checkpoint).

## Handler compilado (para devops/Terraform)

- Entry point: `dist/index.js`, export `handler` (`export * from "./handler"`
  vía `src/index.ts`).
- `package.json`: `"main": "dist/index.js"`.
- Handler de Lambda (`nodejs20.x`): `index.handler`.

## Decisiones propias (con su razón)

- **Mirror local de `PolicyDecisionResult`** (`src/types.ts`,
  `PolicyDecisionResultLike`) en vez de depender de
  `@banking-agent/policy-agent` como paquete — mismo criterio de
  independencia entre paquetes ya documentado por `verification-agent`
  (`EligibilityHandlerResponseLike`): cada servicio de `services/*` es su
  propio paquete Lambda independiente. Si el contrato real de policy-agent
  cambia de forma, este mirror debe actualizarse a mano (ver Limitaciones).
- **`VerificationResult`/`RetrievalResult`/`EligibilityResult` sí se
  importan desde `@banking-agent/shared`** (a diferencia del mirror de
  policy-agent) porque esos tres YA viven en el paquete compartido — no hay
  motivo para duplicarlos otra vez.
- **Redacción defensiva de PII como paso final separado**
  (`redactRawDocumentId`), en vez de confiar únicamente en "nunca
  interpolar `document_id`" en cada template — es una segunda línea de
  defensa barata de mantener y fácil de testear de forma aislada
  (`test/mask.test.ts`), que sobrevive a errores futuros en cualquier
  template nuevo que se agregue a `narrative.ts`/`pending-question.ts`.
- **`origin` desconocido se normaliza a `"policy_decision"`** en vez de
  tratarse como un error que dispara `bestEffortFallback` — si `understand`
  es válido, ya hay información suficiente para armar un resumen razonable
  sin necesidad del camino de fallback "degradado" (que reserva su mensaje
  más genérico para cuando ni siquiera `understand` es utilizable). Ver
  `test/build-summary.test.ts`, describe "origin desconocido".
- **`"post_action_decision"` reutiliza `PolicyDecisionResultLike` tal cual**
  (mismo tipo que `"policy_decision"`) en vez de introducir un tipo mirror
  nuevo — es literalmente el mismo contrato de policy-agent, solo producido
  en un momento distinto del pipeline (`stage: post_action` en vez de
  `pre_action`); duplicar el tipo no aportaría ninguna garantía adicional.
  Lo que sí cambia es `attemptedActions` (nunca `[]` en este origen, porque
  acá sí hubo una acción completada y verificada) — ver
  `src/pending-question.ts`, `buildPostActionAttemptedActionDescription`.

## Limitaciones conocidas

- **`userRequestSummary` es texto generado por reglas/templates
  determinísticos SOLO en español.** No hay un i18n-agent (fase futura, no
  parte de este checkpoint) que revise si estos resúmenes están bien
  redactados en portugués cuando `language === "pt"` — un caso con
  `language: "pt"` recibe igual una narrativa en español (el operador
  humano interno se asume hispanohablante en este checkpoint, a diferencia
  del usuario final del chat, que sí recibe respuestas en su idioma vía
  conversation-agent). Documentado como pendiente de fase i18n.
- **`VerificationResult.data` no tiene una forma 100% garantizada en todos
  los sub-casos** (ver `services/verification-agent/README.md`, "mejor
  esfuerzo de eco"). Este servicio maneja esa incertidumbre de forma
  defensiva: **nunca lee `attemptedAction.verification.data`** para construir
  el resumen (ni `attemptedActions` ni `unresolvedReason` lo necesitan — la
  descripción de la acción intentada depende solo de
  `attemptedAction.intent`, y el motivo depende solo de
  `verification.reason`, ambos con forma estable). Si en el futuro se
  quisiera enriquecer el resumen con detalles de `data` (ej. el score
  exacto), habría que agregar los mismos type guards defensivos que ya usa
  `verification-agent` (`src/guards.ts` de ese paquete) antes de leer nada
  de ahí.
- **Mirror local de `PolicyDecisionResult`, no un tipo compartido
  importado** — ver "Decisiones propias" arriba.
- **Sin JSON Schema formal.** La validación de `event.understand` usa
  `isUnderstandOutput` (`@banking-agent/shared`, type guard manual) — mismo
  criterio pragmático que el resto del pipeline, no un reemplazo de un
  contrato validado formalmente.
- **Redacción por substring de `document_id` tiene un umbral mínimo de 5
  caracteres** (`MIN_REDACTABLE_LENGTH` en `src/mask.ts`) — un documento de
  identidad de 4 caracteres o menos ya se enmascara por completo en
  `maskedDocumentId` (nunca aparece crudo en ese campo), pero la pasada de
  redacción defensiva por substring sobre el resto del texto no se aplica
  para valores tan cortos (para evitar falsos positivos sobre números no
  relacionados). En la práctica los documentos de identidad reales
  (DNI/CC/CPF/RG/pasaporte) siempre superan ese umbral.
- **No conectado a Terraform todavía** — ver sección IAM/Infra arriba.
- **Sin logging estructurado correlacionado más allá de `console.error` en
  el catch de nivel superior** — mismo criterio (y misma limitación) que
  `verification-agent`.

## Comandos

```bash
npm install                                                # raíz del monorepo
npm run build --workspace=@banking-agent/shared            # compila el contrato primero
npm run build --workspace=@banking-agent/escalation-agent
npm test --workspace=@banking-agent/escalation-agent
```

O, desde la raíz, `npm run build && npm test` corre todo el monorepo en el
orden correcto (`package.json` raíz ya encadena
shared -> policy-agent -> conversation-agent -> retrieval-agent ->
transaction-agent -> verification-agent -> escalation-agent).

Los tests de este servicio no requieren AWS real ni ningún mock de
infraestructura — no tiene ninguna dependencia de AWS ni de `policies.yaml`.
`test/mask.test.ts` cubre el criterio exacto de enmascarado y la redacción
defensiva; `test/build-summary.test.ts` cubre los tres orígenes (con ejemplos
reales de `policies.yaml` para `policy_decision` y `post_action_decision`
—`escalate-score-borderline`—, y de `eligibility_check`/`product_info` para
`verification_failed`), más la normalización de `origin` desconocido;
`test/security.test.ts` es el test explícito de seguridad (el valor crudo de
`entities.document_id` nunca aparece serializado en el `EscalationSummary`
resultante, en ningún origen —incluyendo `post_action_decision`—, ni siquiera
con un `reason` adversarial que lo incluyera); `test/handler.test.ts` cubre
el fallback ante input malformado (`event` no objeto, `understand` ausente/inválido, `origin`
desconocido) y ante un error interno simulado (mock de
`buildEscalationSummary` lanzando una excepción) — nunca lanza, nunca deja
`pendingQuestion` en `null`.
