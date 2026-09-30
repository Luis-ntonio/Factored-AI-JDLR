/**
 * Tipos del envelope de respuesta de `POST /chat` (Step Function real
 * `banking-agent-dev-chat-orchestrator`). El envelope en sí (discriminado por
 * `status`) no vive en `@banking-agent/shared` — solo los payloads internos
 * (`RetrievalResult`, `EligibilityResult`, `EscalationSummary`) son contratos
 * compartidos reales, y esos SÍ se importan desde ahí (ver `api.ts`/
 * componentes). Este archivo modela únicamente el "sobre" HTTP tal como lo
 * describe la tarea (verificado contra AWS real).
 */
import type {
  DisputeVerificationResult,
  EligibilityResult,
  EscalationSummary,
  Intent,
  LanguageCode,
  RetrievalResult,
} from "@banking-agent/shared";

/** Mirror mínimo de `PolicyDecisionResult` (services/policy-agent/src/types.ts)
 * — no exportado por @banking-agent/shared, solo se documenta el subconjunto
 * de campos que la UI necesita para status "clarify". */
export interface PolicyDecisionLike {
  decision?: string;
  matchedRules?: unknown;
  winningRuleId?: string | null;
  reason: string;
  /** Ausente cuando el guardrail de Bedrock sube la severidad de una regla
   * AUTO a CLARIFY (`services/policy-agent/src/bedrock/guardrail.ts`): el
   * modelo puede volver la decisión más conservadora pero nunca inventa un
   * campo estructurado a preguntar, a diferencia de una regla CLARIFY de
   * `policies.yaml` (que siempre trae uno). `ClarifyQuestion` debe manejar
   * este caso con una pregunta genérica, no asumir que siempre hay valor. */
  askField?: string;
}

export interface ChatOkResponse {
  status: "ok";
  caseId: string;
  language: LanguageCode;
  intent: Intent;
  result: RetrievalResult | EligibilityResult | DisputeVerificationResult;
}

export interface ChatClarifyResponse {
  status: "clarify";
  caseId: string;
  language: LanguageCode;
  intent: Intent;
  policyDecision: PolicyDecisionLike;
  /** Presente SOLO cuando `policyDecision.askField ===
   * "dispute_candidate_selection"` (ver `policies.yaml`,
   * `clarify-dispute-ambiguous-candidates`) -- transacciones reales del
   * cliente (ya verificadas por ownership) entre las que el matcher no
   * pudo elegir con confianza. `ClarifyQuestion` las renderiza como
   * botones en vez de la pregunta genérica de fallback; clickear uno
   * reenvía `transactionId` en el siguiente turno (`selectedTransactionId`
   * en `SendChatMessageContext`), que el backend SIEMPRE revalida contra
   * las candidatas reales antes de confiar en la elección. */
  ambiguousCandidates?: Array<{
    transactionId: string;
    merchant: string | null;
    amount: number;
    date: string;
  }>;
}

export interface ChatEscalateResponse {
  status: "escalate";
  caseId: string;
  language: LanguageCode;
  intent: Intent;
  escalation: EscalationSummary;
}

export interface ChatUnavailableResponse {
  status: "unavailable";
  reason?: string;
  caseId?: string;
  language?: LanguageCode;
  intent?: Intent;
}

export type ChatResponse = ChatOkResponse | ChatClarifyResponse | ChatEscalateResponse | ChatUnavailableResponse;

/** Un resultado `RetrievalResult` cae acá si `intent` es `product_info`/`faq`. */
export function isRetrievalResult(
  result: RetrievalResult | EligibilityResult | DisputeVerificationResult
): result is RetrievalResult {
  return "found" in result;
}

/** Un resultado `DisputeVerificationResult` cae acá si `intent` es
 * `dispute_unrecognized_charge` -- bug real encontrado en QA manual: antes
 * de este campo, un `status: "ok"` de disputa se renderizaba con
 * `EligibilityCard` (todos los campos `undefined`, UI rota) porque no
 * había ningún type guard que lo distinguiera. `transactionFound` es un
 * campo único de este contrato (ni `RetrievalResult` ni `EligibilityResult`
 * lo tienen). */
export function isDisputeResult(
  result: RetrievalResult | EligibilityResult | DisputeVerificationResult
): result is DisputeVerificationResult {
  return "transactionFound" in result;
}

/** Mensaje de chat en el historial de la UI. Un mensaje de usuario tiene
 * `role: "user"` y `text`. Un mensaje de bot tiene `role: "bot"` y, o bien
 * `response` (respuesta real del backend, cualquier `status`), o bien
 * `clientError` (fallo de red/parseo del lado del navegador, nunca llegó a
 * completarse un ciclo HTTP válido). */
export interface ChatMessage {
  id: string;
  role: "user" | "bot";
  timestamp: number;
  text?: string;
  response?: ChatResponse;
  clientError?: string;
  /** Aviso del propio cliente (nunca del backend) -- ej. "sesión cerrada por
   * inactividad" (ver `ChatPanel.tsx`). Se renderiza distinto a una
   * respuesta real del bot. */
  systemNotice?: string;
}
