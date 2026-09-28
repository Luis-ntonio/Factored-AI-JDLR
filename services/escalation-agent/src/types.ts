import type { Intent, UnderstandOutput, VerificationResult } from "@banking-agent/shared";

/**
 * Mirror LOCAL (no importado) de `PolicyDecisionResult`
 * (`services/policy-agent/src/types.ts`). Deliberado, mismo criterio que
 * `EligibilityHandlerResponseLike` en `services/verification-agent/src/types.ts`:
 * cada servicio de `services/*` es su propio paquete Lambda independiente,
 * así que escalation-agent no depende de `@banking-agent/policy-agent` como
 * paquete solo para tipar 4 campos. Si el contrato real de policy-agent
 * cambia de forma, este mirror debe actualizarse a mano (ver "Limitaciones"
 * en README.md).
 */
export interface PolicyDecisionResultLike {
  decision?: "AUTO" | "CLARIFY" | "ESCALATE";
  matchedRules?: Array<{ id: string; decision: string }>;
  winningRuleId?: string | null;
  /** Texto ESTÁTICO (nunca interpolado con `entities.*`, ver
   * `policies.yaml` sección `security`, regla `sec-no-raw-pii-in-reason`) —
   * escalation-agent confía en esa garantía de policy-agent pero igual pasa
   * este valor por el mismo redactor defensivo que el resto del resumen
   * (ver `src/mask.ts`, `redactRawDocumentId`). */
  reason?: string;
  askField?: string;
}

/**
 * Intents para los que existe una acción "Act" real (retrieval-agent o
 * transaction-agent) que pudo haberse intentado antes de llegar acá.
 * Deliberadamente el mismo subconjunto que `VerificationInput.intent` en
 * `services/verification-agent/src/types.ts` -- `escalation_request` y
 * `unknown` nunca llegan a "Act", así que nunca aparecen acá.
 */
export type AttemptedActionIntent = "product_info" | "faq" | "eligibility_check" | "dispute_unrecognized_charge";

/** Presente cuando `origin === "verification_failed"`: qué acción se
 * intentó y el `VerificationResult` completo (`status: "pending_confirmation"`
 * esperado, pero escalation-agent no asume ciegamente ese valor -- ver
 * `src/build-summary.ts`) que produjo verification-agent para esa acción. */
export interface AttemptedAction {
  intent: AttemptedActionIntent;
  verification: VerificationResult;
}

/**
 * Input Task-a-Task esperado por escalation-agent dentro de la Step Function
 * real (`banking-agent-dev-chat-orchestrator`). `understand` está SIEMPRE
 * presente (es el contrato de conversation-agent, disponible en cualquier
 * punto del flujo vía `$.understand` del ASL). Con TRES orígenes posibles,
 * `policyDecision` y `attemptedAction` ya no son estrictamente "uno u otro":
 * `policyDecision` está presente tanto en `"policy_decision"` (ESCALATE en
 * `pre_action`, antes de intentar cualquier acción) como en
 * `"post_action_decision"` (ESCALATE en `post_action`, DESPUÉS de una acción
 * ya completada y verificada) -- mismo tipo `PolicyDecisionResultLike` en
 * ambos casos, solo cambia el momento del pipeline en el que policy-agent lo
 * produjo. `attemptedAction` sigue siendo exclusivo de
 * `"verification_failed"`. Ver docstring de cabecera de
 * `packages/shared/src/contracts/escalation-summary.ts` para el detalle
 * completo de los tres orígenes.
 */
export interface EscalationInput {
  origin: "policy_decision" | "verification_failed" | "post_action_decision";
  understand: UnderstandOutput;
  /** Presente cuando `origin === "policy_decision"` (ESCALATE en `pre_action`)
   * o `origin === "post_action_decision"` (ESCALATE en `post_action`, sobre
   * un `EligibilityResult` ya verificado) -- el `PolicyDecisionResult`
   * (`decision: "ESCALATE"` esperado) que produjo policy-agent en cada caso.
   * En `post_action_decision`, `askField` nunca debería venir presente (las
   * reglas `post_action` de `policies.yaml`, ej. `escalate-score-borderline`,
   * no usan `ask_field`), pero escalation-agent no lo asume ciegamente --
   * `buildPolicyPendingQuestion` ya maneja ambos casos de forma genérica. */
  policyDecision?: PolicyDecisionResultLike;
  /** Presente cuando `origin === "verification_failed"`. */
  attemptedAction?: AttemptedAction;
}

/** Re-exportado por conveniencia para quien importe solo desde `./types`. */
export type { Intent };
