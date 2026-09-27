# verification-agent

Capa **"Verify"** del pipeline (`.claude/agents/` — credit-product info &
eligibility): después de cada tool call de `retrieval-agent` (intents
`product_info`/`faq`) o `transaction-agent` (intent `eligibility_check`),
este servicio hace una **segunda verificación INDEPENDIENTE** del resultado
antes de que la Step Function lo comunique como exitoso al usuario. **Nunca
es un passthrough.**

Si no se puede verificar con certeza, el resultado se reporta como
`"pending_confirmation"` — **nunca** `"verified"` por default. Este paso es
explícito y visible en el flujo (un Task más de la Step Function, no un
side-effect oculto): la Step Function real
(`banking-agent-dev-chat-orchestrator`, definición en
`terraform/modules/orchestration/asl/chat-orchestrator.asl.json.tftpl`) invoca
este Lambda entre ActRetrieval/ActTransaction y la respuesta final —
integración que hace devops, no este servicio.

Runtime: Node.js 20.x + TypeScript (CommonJS), mismo criterio que el resto
del pipeline.

## Estructura

```
src/
  config/
    load-thresholds.ts   # lee config.borderline_score_min/_max de policies.yaml
  scoring/
    score-zone.ts         # deriveScoreZone(score, thresholds) -- recálculo independiente
  guards.ts                # type guards runtime (EligibilityHandlerResponse/EligibilityResult/RetrievalResult)
  types.ts                 # VerificationInput + mirror local de EligibilityHandlerResponse
  verify.ts                # verifyResult(input, getThresholds) -- lógica de negocio pura
  handler.ts                # handler de Lambda (Task-a-Task, JSON plano)
  index.ts                  # barrel + re-exporta handler
test/                        # vitest — verify.test.ts, handler.test.ts, load-thresholds.test.ts
```

## Contrato

Task-a-Task dentro de la Step Function (**nunca** expuesto vía API Gateway —
mismo criterio que `policy-agent`, a diferencia de
conversation-agent/retrieval-agent/transaction-agent). Acepta y devuelve JSON
plano, sin envoltura `APIGatewayProxyEventV2`.

**Entrada** (`VerificationInput`, ver `src/types.ts`):

```ts
interface VerificationInput {
  intent: "product_info" | "faq" | "eligibility_check";
  result: unknown;
}
```

- `intent` en `"product_info"`/`"faq"`: `result` es un `RetrievalResult`
  (`@banking-agent/shared`) tal cual lo devuelve el body de retrieval-agent,
  sin envoltura adicional.
- `intent === "eligibility_check"`: `result` es el `EligibilityHandlerResponse`
  **completo** tal cual lo devuelve el body de transaction-agent
  (`{status, result?, reason?}`) — el `EligibilityResult` real vive adentro de
  `result.result`, solo si `result.status === "ok"`.

**Salida**: `VerificationResult` (`@banking-agent/shared`,
`packages/shared/src/contracts/verification-result.ts`):

```ts
interface VerificationResult<T = unknown> {
  status: "verified" | "pending_confirmation";
  verified: boolean; // === (status === "verified"), redundante a propósito
  reason?: string;    // presente solo si status === "pending_confirmation"
  data: T;             // eco sin modificar del resultado ya verificado (o
                        // mejor esfuerzo si la verificación no se completó)
}
```

## Lógica de verificación (SEGUNDA verificación independiente, no un passthrough)

### `eligibility_check`

1. Si `result.status !== "ok"` (`"unavailable"`/`"rejected"`) o `result` no
   tiene la forma mínima de `EligibilityHandlerResponse` → `pending_confirmation`,
   `data` = lo disponible (el wrapper completo, o `null`).
2. Si `status === "ok"` pero `result.result` no tiene forma de
   `EligibilityResult` → `pending_confirmation`.
3. Si `eligibility_score` no es un número finito o está fuera de `[0, 100]` →
   `pending_confirmation` (defensivo — nunca debería ocurrir si
   transaction-agent funciona bien, ver Limitaciones).
4. Se leen `config.borderline_score_min`/`config.borderline_score_max`
   **directamente de `policies.yaml`** (mismo mecanismo `js-yaml` que
   `transaction-agent`/`policy-agent`, ver decisión de diseño abajo) y se
   recalcula `score_zone` con la MISMA regla que usa transaction-agent
   (`score < min` → `declined`; `score > max` → `approved`; `[min, max]`
   inclusive → `borderline`). Si la zona recalculada **no coincide** con la
   reportada → `pending_confirmation` con el detalle de ambos valores (no son
   PII, son datos numéricos/enum de negocio). Si coincide → `verified`, `data`
   = el `EligibilityResult` desenvuelto (no el wrapper completo).

### `product_info` / `faq`

- `result.found === false` → **ya es una señal honesta** de "no encontrado"
  de parte de retrieval-agent, no una falla que verificar → `verified`, `data`
  = el `RetrievalResult` tal cual.
- `found === true` y `intent === "product_info"`: `result.product.source`
  debe ser un string no vacío → `verified`; si no → `pending_confirmation`.
- `found === true` y `intent === "faq"`: `result.faqs` debe ser un array no
  vacío y **cada** entrada debe tener `source` no vacío → `verified`; si no
  (vacío, ausente, o alguna entrada sin `source`) → `pending_confirmation`.

### Cualquier otro caso

`intent` fuera de los 3 valores esperados, `result` sin forma reconocible,
`input` que no es un objeto, etc. → siempre `pending_confirmation` con un
`reason` explícito. **Nunca** hay un default a `verified: true`.

## Decisiones propias (con su razón)

- **No se importa código de `@banking-agent/transaction-agent`.** El loader
  de umbrales (`src/config/load-thresholds.ts`) y el derivador de zona
  (`src/scoring/score-zone.ts`) son copias funcionalmente idénticas a los de
  `transaction-agent`, no una dependencia cross-package. Cada servicio de
  `services/*` es su propio paquete Lambda independiente (mismo criterio que
  ya aplica `retrieval-agent` al no depender de `transaction-agent`) —
  acoplar el bundle de este Lambda al de transaction-agent solo para reusar
  ~15 líneas de lectura de YAML introduciría una dependencia de despliegue
  innecesaria (un cambio no relacionado en transaction-agent podría romper el
  build de verification-agent) a cambio de evitar una duplicación mínima y
  estable. `policies.yaml` sigue siendo la ÚNICA fuente de verdad de los
  NÚMEROS en sí — lo que se duplica es el mecanismo de lectura, no el valor.
- **`getThresholds` se pasa a `verifyResult` como función LAZY, no como valor
  ya resuelto.** `policies.yaml` solo hace falta para el camino de
  `eligibility_check` que efectivamente llega a comparar un
  `EligibilityResult` válido. Si `handler.ts` resolviera los umbrales
  ansiosamente antes de llamar a `verifyResult`, un `policies.yaml` roto
  degradaría también la verificación de `product_info`/`faq`, que no lo
  necesita para nada — acoplamiento innecesario que este diseño evita
  explícitamente (ver `test/verify.test.ts`, describe "getThresholds() es
  lazy").
- **`verifyResult` no atrapa la excepción de `getThresholds()`.** La deja
  propagar hacia `handler.ts`, que sí tiene el único try/catch de nivel
  superior — evita duplicar ese manejo de error en dos lugares.
- **Mirror local de `EligibilityHandlerResponse`** (`src/types.ts`,
  `EligibilityHandlerResponseLike`) en vez de importar el tipo desde
  `@banking-agent/transaction-agent`: mismo criterio de independencia entre
  paquetes que el punto anterior. Si el contrato real de transaction-agent
  cambia de forma, este mirror debe actualizarse a mano (ver Limitaciones).
- **Type guards runtime propios (`src/guards.ts`)**, sin JSON Schema formal
  — mismo criterio pragmático que `isUnderstandOutput` de
  `@banking-agent/shared`: suficiente para este checkpoint, última línea de
  defensa antes de confiar en la forma de un `unknown` recibido de otro
  Lambda, no un reemplazo de un contrato validado formalmente.

## Reliability (docs/EVALUATION-CRITERIA.md)

- El handler **nunca lanza una excepción sin manejar**. Toda la lógica está
  envuelta en un único try/catch de nivel superior en `handler.ts`; ante
  CUALQUIER excepción interna (yaml malformado, archivo no encontrado, bug no
  previsto), responde `{ status: "pending_confirmation", verified: false,
  reason: "verification_internal_error", data }`, con `data` = mejor esfuerzo
  de eco del `result` de entrada si estaba disponible en el evento recibido,
  o `null` si ni eso.
- Un fallo de verification-agent **jamás** se traduce en un resultado tratado
  como verificado por defecto — es el requisito central de esta pieza en el
  pipeline (ver docstring de `packages/shared/src/contracts/verification-result.ts`).
- Logging básico a CloudWatch (`console.error` en el catch de nivel
  superior) — sin logging estructurado adicional en este checkpoint (no hay
  `caseId`/`turnId` en el `VerificationInput`, ver Limitaciones).

## Security / IAM

**Sin acceso a DynamoDB ni a ningún otro recurso AWS.** Este servicio solo
lee su copia empaquetada de `policies.yaml` (archivo local del bundle del
Lambda) y loguea a CloudWatch. El IAM role de este Lambda debe ser el **más
mínimo posible**: solo `AWSLambdaBasicExecutionRole` (permisos de
CloudWatch Logs), **sin** `dynamodb:*`, **sin** `lambda:InvokeFunction` — esto
es responsabilidad de devops al conectar Terraform, documentado acá para que
quede explícito antes de esa integración.

`reason` nunca incluye datos crudos de `entities` (en particular, nunca
`entities.document_id`) — ninguno de los resultados que este servicio
verifica (`EligibilityResult`, `RetrievalResult`) contiene PII directamente,
así que esta restricción se cumple naturalmente, pero queda documentada de
forma explícita (ver docstring de `VerificationResult`).

## Variables de entorno

- `POLICY_FILE_PATH`: ruta absoluta a `policies.yaml`. Default:
  `path.resolve(__dirname, "../../../policies.yaml")` relativo al archivo
  compilado (`dist/handler.js` → raíz del monorepo), mismo criterio que
  `transaction-agent`. devops copia el `policies.yaml` real al empaquetar el
  Lambda.

## Handler compilado (para devops/Terraform)

- Entry point: `dist/index.js`, export `handler` (`export * from "./handler"`
  vía `src/index.ts`).
- `package.json`: `"main": "dist/index.js"`.
- Handler de Lambda (`nodejs20.x`): `index.handler`.

## Limitaciones conocidas

- **Sin JSON Schema formal.** `src/guards.ts` son type guards manuales
  (mismo criterio pragmático que `isUnderstandOutput` de
  `@banking-agent/shared`) — suficientes para este checkpoint, no un
  reemplazo de una validación de contrato formal (ej. AJV + JSON Schema
  compartido) que sería más robusta a evoluciones del contrato de
  retrieval-agent/transaction-agent.
- **Chequeo de `eligibility_score` fuera de `[0, 100]` es defensivo, no
  debería ocurrir nunca en la práctica.** Si transaction-agent funciona
  correctamente, ya clampea el score a ese rango (ver
  `services/transaction-agent/src/scoring/compute-score.ts`) — esta rama
  existe para no confiar ciegamente ni siquiera en esa garantía.
- **Mirror local de `EligibilityHandlerResponse`, no un tipo compartido
  importado.** Si `services/transaction-agent/src/index.ts` cambia la forma
  de `EligibilityHandlerResponse`, `src/types.ts` de este servicio debe
  actualizarse a mano — no hay garantía de compilación cruzada entre ambos
  paquetes (decisión deliberada, ver "Decisiones propias" arriba).
- **Sin `caseId`/`turnId` en el input, sin logging estructurado
  correlacionado.** `VerificationInput` no incluye esos campos (no forman
  parte del contrato de salida de retrieval-agent ni del
  `EligibilityHandlerResponse`, salvo dentro de `EligibilityResult.caseId`
  cuando existe) — el logging de este servicio es básico (`console.error`
  del catch de nivel superior), no correlacionado turno a turno como en
  transaction-agent. Un futuro cambio de contrato podría agregar esos campos
  al `VerificationInput` para mejorar trazabilidad.
- **Sin orquestador real conectando esta pieza todavía.** Este servicio
  asume que quien lo invoca (la Step Function real, integrada por devops) le
  pasa exactamente la forma de `VerificationInput` documentada. Hoy esa
  garantía es un contrato probado por test, no forzada por un JSON Schema en
  el borde del Task de Step Functions.
- **No conectado a Terraform.** El handler está listo para Lambda
  `nodejs20.x` (exporta `handler` desde `src/index.ts`), pero conectarlo al
  Task correspondiente de `chat-orchestrator.asl.json.tftpl` y crear el rol
  IAM mínimo es responsabilidad de devops (fase posterior a este checkpoint).
- **`escalation-agent` (fase posterior) no está implementado acá.** Este
  servicio solo produce `VerificationResult` — no decide qué hacer con los
  casos `pending_confirmation`, eso es responsabilidad de `escalation-agent`
  (`docs/PLAN.md`, "Días 5-6 — Verify + Escalate"), que consume este mismo
  contrato de salida.

## Comandos

```bash
npm install                                                # raíz del monorepo
npm run build --workspace=@banking-agent/shared            # compila el contrato primero
npm run build --workspace=@banking-agent/verification-agent
npm test --workspace=@banking-agent/verification-agent
```

O, desde la raíz, `npm run build && npm test` corre todo el monorepo en el
orden correcto (`package.json` raíz ya encadena
shared -> policy-agent -> conversation-agent -> retrieval-agent ->
transaction-agent -> verification-agent).

Los tests de `verifyResult`/`loadBorderlineThresholds` no requieren AWS real
ni ningún mock de infraestructura — este servicio no tiene ninguna
dependencia de AWS. `test/verify.test.ts` cubre los 4 escenarios de
`eligibility_check` (zona coincide, zona no coincide, score fuera de rango,
`status !== "ok"`), los de `product_info`/`faq` (found=false, source
presente, source faltante, faqs vacío/incompleto), input malformado/intent
desconocido, y el comportamiento lazy de `getThresholds()`.
`test/handler.test.ts` cubre el fallback ante error interno simulado
(`POLICY_FILE_PATH` apuntando a un archivo inexistente) — nunca lanza, nunca
reporta `verified` por default.
