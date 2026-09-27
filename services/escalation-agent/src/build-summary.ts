import type { EscalationSummary } from "@banking-agent/shared";
import { maskDocumentId, redactRawDocumentId } from "./mask";
import { summarizeKnownEntities } from "./known-entities";
import { buildUserRequestSummary } from "./narrative";
import {
  buildAttemptedActionDescription,
  buildPolicyPendingQuestion,
  buildPostActionAttemptedActionDescription,
  buildVerificationPendingQuestion,
} from "./pending-question";
import type { AttemptedActionIntent, EscalationInput } from "./types";

const DEFAULT_POLICY_REASON =
  "policy-agent decidió escalar este caso pero no reportó un motivo específico (reason ausente o vacío) — revisión manual completa requerida.";

const DEFAULT_VERIFICATION_REASON =
  "verification-agent no pudo confirmar el resultado y no reportó un motivo específico (reason ausente o vacío) — revisión manual completa requerida.";

const DEFAULT_POST_ACTION_REASON =
  "policy-agent decidió escalar este caso en la revisión post_action pero no reportó un motivo específico (reason ausente o vacío) — revisión manual completa requerida.";

/** Los únicos intents para los que existe una acción "Act" real -- ver
 * `AttemptedActionIntent` en `src/types.ts`. Usado para no asumir
 * rígidamente que `understand.intent` sea siempre `eligibility_check` en
 * `origin === "post_action_decision"` (hoy es el único caso real, pero esta
 * función degrada de forma segura si no lo fuera). */
function asAttemptedActionIntent(intent: string): AttemptedActionIntent | undefined {
  return intent === "product_info" || intent === "faq" || intent === "eligibility_check" ? intent : undefined;
}

/**
 * Composición pura del `EscalationSummary` a partir de un `EscalationInput`
 * ya validado como "razonablemente bien formado" por `handler.ts`
 * (`understand` cumple `isUnderstandOutput`). Esta función SÍ puede lanzar
 * (ej. si `policyDecision`/`attemptedAction` tienen una forma inesperada más
 * allá de lo que TypeScript garantiza en runtime) -- `handler.ts` es el ÚNICO
 * lugar con el try/catch de nivel superior, mismo criterio que
 * policy-agent/verification-agent (no se duplica ese manejo acá).
 *
 * Decisión de diseño -- normalización de `origin`: los tres valores válidos
 * (`"policy_decision"`, `"verification_failed"`, `"post_action_decision"`)
 * se reconocen explícitamente; cualquier OTRO valor (realmente desconocido,
 * ej. un bug futuro en el ASL) sigue cayendo al default más conservador,
 * `"policy_decision"`: `attemptedActions: []` (nunca se inventa una acción
 * que no sabemos si ocurrió) y la rama de `pendingQuestion` genérica de
 * policy_decision sigue siendo una instrucción accionable para el humano
 * aunque `origin` viniera con un valor inesperado.
 */
export function buildEscalationSummary(input: EscalationInput): EscalationSummary {
  const { understand } = input;
  const entities = understand.entities;

  const maskedDocumentId = maskDocumentId(entities.document_id);
  const knownEntities = summarizeKnownEntities(entities);
  const userRequestSummary = buildUserRequestSummary(understand.intent, entities, understand.language);

  const origin: EscalationSummary["origin"] =
    input.origin === "verification_failed"
      ? "verification_failed"
      : input.origin === "post_action_decision"
        ? "post_action_decision"
        : "policy_decision";

  let attemptedActions: string[];
  let unresolvedReason: string;
  let pendingQuestion: string | null;

  if (origin === "verification_failed") {
    const attemptedAction = input.attemptedAction;
    attemptedActions = [buildAttemptedActionDescription(attemptedAction?.intent)];
    const verificationReason = attemptedAction?.verification?.reason;
    unresolvedReason =
      typeof verificationReason === "string" && verificationReason.trim() !== ""
        ? verificationReason.trim()
        : DEFAULT_VERIFICATION_REASON;
    pendingQuestion = buildVerificationPendingQuestion(attemptedAction?.intent, understand.language);
  } else if (origin === "post_action_decision") {
    attemptedActions = [buildPostActionAttemptedActionDescription(asAttemptedActionIntent(understand.intent))];
    const postActionReason = input.policyDecision?.reason;
    unresolvedReason =
      typeof postActionReason === "string" && postActionReason.trim() !== ""
        ? postActionReason.trim()
        : DEFAULT_POST_ACTION_REASON;
    pendingQuestion = buildPolicyPendingQuestion(input.policyDecision, understand.language);
  } else {
    attemptedActions = [];
    const policyReason = input.policyDecision?.reason;
    unresolvedReason =
      typeof policyReason === "string" && policyReason.trim() !== "" ? policyReason.trim() : DEFAULT_POLICY_REASON;
    pendingQuestion = buildPolicyPendingQuestion(input.policyDecision, understand.language);
  }

  const summary: EscalationSummary = {
    caseId: understand.context.caseId,
    customerId: understand.context.customerId,
    language: understand.language,
    intent: understand.intent,
    origin,
    userRequestSummary,
    knownEntities,
    maskedDocumentId,
    attemptedActions,
    unresolvedReason,
    pendingQuestion,
  };

  // Defensa en profundidad: aunque nada arriba interpola `entities.document_id`
  // crudo a propósito, esta pasada final garantiza que ningún cambio futuro
  // (o un `reason`/`askField` mal formado llegado de policy-agent/
  // verification-agent) pueda filtrarlo por accidente. Ver src/mask.ts.
  return redactRawDocumentId(summary, entities.document_id, maskedDocumentId);
}
