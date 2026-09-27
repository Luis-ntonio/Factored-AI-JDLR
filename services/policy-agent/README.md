# `@banking-agent/policy-agent`

Capa **Decide** del pipeline. Lee `policies.yaml` (raíz del monorepo) y un
`UnderstandOutput` (contrato de `@banking-agent/shared`, producido por
`services/conversation-agent`) y devuelve `AUTO | CLARIFY | ESCALATE` con
trazabilidad completa de qué regla(s) matchearon.

**No ejecuta ninguna acción.** Solo autoriza (`AUTO`) o bloquea
(`CLARIFY`/`ESCALATE`) el paso a `retrieval-agent`/`transaction-agent`.

## Estado de este paquete — LEER ANTES DE USAR

Este código fue escrito por policy-agent **sin acceso a una shell/entorno de
ejecución** en este checkpoint. Concretamente:

- **No se corrió** `npm install`, `npm run build`, ni `npm test` sobre este
  workspace.
- No hay garantía de que compile sin errores de TypeScript (ej. tipos de
  `js-yaml`, resolución de `@banking-agent/shared` antes de que ese paquete
  esté compilado).
- La suite de tests (`src/evaluator.test.ts`) fue escrita para ejercitar
  cada regla de `policies.yaml` con los ejemplos de `docs/CONTRACTS.md`
  sección 5 más casos adicionales, pero **nunca se ejecutó** — si falla, es
  un bug real a corregir, no un falso positivo a ignorar.

**Antes de dar esta pieza por válida, el reviewer debe correr, en este
orden:**

```bash
npm install                                            # raíz del monorepo
npm run build --workspace=@banking-agent/shared        # compila el contrato primero
npm run build --workspace=@banking-agent/policy-agent
npm test --workspace=@banking-agent/policy-agent
```

Si se prefiere no arrastrar este riesgo, la alternativa completamente válida
(explícitamente permitida por la tarea original) es **ignorar este código y
usar solo `policies.yaml`** como especificación auditable para que otro
agente/fase la implemente desde cero. `policies.yaml` es legible y completo
por sí mismo sin depender de este evaluador.

## Qué hace el evaluador (`src/evaluator.ts`)

1. Carga `policies.yaml` con `js-yaml` (`loadPolicyFile`).
2. `evaluatePreAction(understandOutput, policy)` — evalúa las reglas
   `stage: pre_action` contra un `UnderstandOutput` real.
3. `evaluatePostAction(eligibilityResult, policy)` — evalúa las reglas
   `stage: post_action` contra un `EligibilityResult` real (contrato
   **confirmado**, tipo canónico en
   `packages/shared/src/contracts/eligibility-result.ts`, producido por
   `services/transaction-agent`) — ver `policies.yaml`,
   `post_action_contract_status: CONFIRMED`.

### Semántica de evaluación (implementada literalmente desde `policies.yaml`)

- Se evalúan **todas** las reglas de la stage pedida, no "la primera que
  matchea".
- Si ninguna matchea → fallback `ESCALATE` (nunca `AUTO` por defecto).
- Si matchean una o más → gana la de **severidad más alta**
  (`ESCALATE(2) > CLARIFY(1) > AUTO(0)`), formalizando estructuralmente las
  reglas de desempate del diseño original ("cuando dudes entre AUTO y
  CLARIFY, elegí CLARIFY"; "cuando dudes entre CLARIFY y ESCALATE, elegí
  ESCALATE").
- Entre las de severidad máxima, la primera en orden de aparición en
  `policies.yaml` define el `reason`/`ask_field` mostrado; **todas** las
  reglas que matchearon quedan en `matchedRules` para auditoría/logging
  (coordinar con observabilidad/verification-agent).

### Seguridad (PII)

`reason` es siempre texto **estático** tomado estrictamente del YAML — el
evaluador nunca hace interpolación de `entities.*` (en particular
`entities.document_id`) dentro de `reason`. Ver `policies.yaml`, sección
`security`.

## Handler de Lambda (`src/handler.ts`) — Task "Decide" de la Step Function

A diferencia de `conversation-agent`/`retrieval-agent`/`transaction-agent`
(que exponen un contrato tipo `APIGatewayProxyEventV2` con `event.body` como
JSON string, porque `conversation-agent` está detrás de API Gateway y los
otros dos replican ese contrato por consistencia), **policy-agent NUNCA se
expone vía API Gateway** — solo lo invoca la Step Function (Express,
síncrona) internamente como un Task de Lambda. Por eso su handler acepta y
devuelve **JSON plano, sin envoltura de API Gateway**
(`event.body`/`isBase64Encoded`): esa capa de indirección sería innecesaria
para una invocación Task-a-Task dentro de la misma Step Function.

```ts
export async function handler(event: UnderstandOutput | PostActionEvent): Promise<PolicyDecisionResult>
```

Este mismo Lambda es invocado por la Step Function **dos veces**, discriminado
por la presencia de un campo `stage: "post_action"` a nivel raíz del
Payload (contrato fijo diseñado por el coordinador del ASL, no elegido acá):

1. **Task "Decide"** (sin `stage`, comportamiento original, no cambia):
   - **Entrada**: un `UnderstandOutput` completo (contrato de
     `@banking-agent/shared`), tal como lo produce `conversation-agent`.
   - Evalúa `evaluatePreAction` (stage `pre_action` de `policies.yaml`), el
     paso "Decide" real del pipeline antes de autorizar `retrieval-agent`/
     `transaction-agent`.

2. **Task "PostActionDecide"** (`stage: "post_action"`, ejecutado después de
   "Verify" — GAP YA CERRADO, este handler sí se conecta a este segundo
   paso de la Step Function real):
   - **Entrada**: un `EligibilityResult` completo (contrato de
     `@banking-agent/shared`, producido por `services/transaction-agent`)
     con el campo adicional `stage: "post_action"` agregado a nivel raíz
     por la Step Function.
   - Evalúa `evaluatePostAction` (stage `post_action` de `policies.yaml`),
     para decidir si el resultado de elegibilidad ya calculado se puede
     comunicar al usuario tal cual (`AUTO`) o requiere revisión humana
     (`ESCALATE`, ej. score en zona borderline).
   - El guard `isPostActionEvent` (en `src/handler.ts`) es el único punto
     que discrimina entre ambos modos: `typeof event === "object" && event
     !== null && event.stage === "post_action"`.

- **Salida** (para ambos modos): un `PolicyDecisionResult` (`decision`,
  `matchedRules`, `winningRuleId`, `reason`, `askField?`).

### Variables de entorno

- `POLICY_FILE_PATH`: ruta absoluta a `policies.yaml`, default
  `path.resolve(__dirname, "./policies.yaml")` (para cuando se compile a
  `dist/handler.js`, busca `dist/policies.yaml` — devops copia el
  `policies.yaml` real de la raíz del monorepo ahí al empaquetar el Lambda,
  mismo criterio que `services/transaction-agent/src/index.ts`). El
  `PolicyFile` cargado se cachea en un closure a nivel de módulo (mismo
  patrón `cachedX` que usan los otros 3 servicios) para no releer/reparsear
  el YAML en cada invocación tibia del Lambda.

### Reliability

Este handler **nunca lanza una excepción sin manejar** ni deja "crashear" el
Lambda: cualquier fallo (YAML malformado, archivo no encontrado, error
inesperado) se atrapa con `try/catch`, se loguea con `console.error`, y se
responde con un `PolicyDecisionResult` de fallback conservador:

```ts
{
  decision: "ESCALATE",
  matchedRules: [],
  winningRuleId: null,
  reason: "policy-agent no pudo evaluar policies.yaml (fallo interno) — escalado conservador por defecto.",
}
```

Nunca `AUTO` por defecto — mismo criterio que el fallback-por-defecto ya
documentado en `evaluateStage`/`policies.yaml`, y mismo criterio de
Reliability que los otros 3 servicios (siempre una respuesta válida, nunca
un crash/5xx).

Cubierto por `src/handler.test.ts`: para `pre_action` (Task "Decide") — caso
AUTO real, caso CLARIFY real (con `askField` poblado), caso ESCALATE real;
para `post_action` (Task "PostActionDecide") — caso ESCALATE real
(`score_zone: "borderline"`) y caso AUTO real (`score_zone: "approved"`); y
el fallback interno (apuntando `POLICY_FILE_PATH` a un archivo inexistente),
compartido por ambos modos.

## No implementado acá (fuera de scope de policy-agent)

- `escalation-agent` — no existe todavía (fase 4 de `docs/PLAN.md`). Este
  paquete solo produce la decisión, no la ejecuta.
- Validación cruzada YAML↔TypeScript de que los `field:` de `policies.yaml`
  existan literalmente en `understand-output.ts` (ver limitación declarada
  al final de `policies.yaml`).
- La Step Function (Terraform) que invoca este handler como Task —
  responsabilidad de devops, fuera de este paquete.
