/**
 * Tipos del envelope de respuesta de `POST /chat` (Step Function real
 * `banking-agent-dev-chat-orchestrator`). El envelope en sí (discriminado por
 * `status`) no vive en `@banking-agent/shared` — solo los payloads internos
 * (`RetrievalResult`, `EligibilityResult`, `EscalationSummary`) son contratos
 * compartidos reales, y esos SÍ se importan desde ahí (ver `api.ts`/
 * componentes). Este archivo modela únicamente el "sobre" HTTP tal como lo
 * describe la tarea (verificado contra AWS real).
 */
import type { EligibilityResult, EscalationSummary, Intent, LanguageCode, RetrievalResult } from "@banking-agent/shared";

/** Mirror mínimo de `PolicyDecisionResult` (services/policy-agent/src/types.ts)
 * — no exportado por @banking-agent/shared, solo se documenta el subconjunto
 * de campos que la UI necesita para status "clarify". */
export interface PolicyDecisionLike {
  decision?: string;
  matchedRules?: unknown;
  winningRuleId?: string | null;
  reason: string;
  askField: string;
}

export interface ChatOkResponse {
  status: "ok";
  caseId: string;
  language: LanguageCode;
  intent: Intent;
  result: RetrievalResult | EligibilityResult;
}

export interface ChatClarifyResponse {
  status: "clarify";
  caseId: string;
  language: LanguageCode;
  intent: Intent;
  policyDecision: PolicyDecisionLike;
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
export function isRetrievalResult(result: RetrievalResult | EligibilityResult): result is RetrievalResult {
  return "found" in result;
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
}
