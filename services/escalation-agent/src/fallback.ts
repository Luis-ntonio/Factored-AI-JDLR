import type { EscalationSummary } from "@banking-agent/shared";
import { emptyKnownEntities } from "./known-entities";
import { maskDocumentId, redactRawDocumentId } from "./mask";

/**
 * Camino de "mejor esfuerzo" para cuando el evento recibido no es un
 * `EscalationInput` razonablemente bien formado (ej. `understand` ausente o
 * inválido) o cuando `buildEscalationSummary` lanzó una excepción inesperada
 * -- ver `handler.ts`.
 *
 * Reliability no-negociable (esta es la ÚLTIMA capa antes de un humano, ver
 * README.md): NUNCA se deja al humano sin ningún resumen accionable. Este
 * fallback:
 *   - busca `caseId`/`customerId` de forma DEFENSIVA en cualquier parte
 *     razonable del evento recibido (nunca asume la forma completa),
 *   - nunca expone `document_id` crudo aunque el input malformado lo trajera
 *     (misma redacción defensiva que el camino feliz, `src/mask.ts`),
 *   - siempre deja `pendingQuestion` no nulo y accionable.
 */
export function bestEffortFallback(event: unknown): EscalationSummary {
  const caseId = extractString(event, ["understand", "context", "caseId"]) ?? extractString(event, ["caseId"]) ?? "unknown_case";

  const customerId =
    extractString(event, ["understand", "context", "customerId"]) ?? extractString(event, ["customerId"]) ?? null;

  const language = extractLanguage(event);
  const intent = extractIntent(event);
  const origin = extractOrigin(event);

  const rawDocumentId =
    extractString(event, ["understand", "entities", "document_id"]) ??
    extractString(event, ["entities", "document_id"]) ??
    null;
  const maskedDocumentId = maskDocumentId(rawDocumentId);

  const summary: EscalationSummary = {
    caseId,
    customerId,
    language,
    intent,
    origin,
    userRequestSummary:
      "No se pudo reconstruir de forma confiable la intención del usuario para este turno (input recibido por escalation-agent incompleto o inválido).",
    knownEntities: emptyKnownEntities(),
    maskedDocumentId,
    attemptedActions: [],
    unresolvedReason:
      "escalation_internal_error: no se pudo construir un resumen completo, revisión manual completa requerida",
    pendingQuestion:
      "Revisar el caso manualmente de forma prioritaria: escalation-agent no pudo generar un resumen automático confiable para este turno.",
  };

  return redactRawDocumentId(summary, rawDocumentId, maskedDocumentId);
}

/** Camina un path fijo de keys sobre un `unknown` sin asumir la forma en
 * ningún punto intermedio; devuelve el valor solo si es un string no vacío. */
function extractString(root: unknown, path: readonly string[]): string | undefined {
  let current: unknown = root;
  for (const key of path) {
    if (typeof current !== "object" || current === null) return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return typeof current === "string" && current.trim() !== "" ? current : undefined;
}

function extractLanguage(event: unknown): "es" | "pt" {
  const value = extractString(event, ["understand", "language"]) ?? extractString(event, ["language"]);
  return value === "pt" ? "pt" : "es";
}

function extractIntent(event: unknown): EscalationSummary["intent"] {
  const value = extractString(event, ["understand", "intent"]) ?? extractString(event, ["intent"]);
  const known = ["product_info", "eligibility_check", "faq", "escalation_request", "unknown"] as const;
  return (known as readonly string[]).includes(value ?? "") ? (value as EscalationSummary["intent"]) : "unknown";
}

function extractOrigin(event: unknown): EscalationSummary["origin"] {
  const value = extractString(event, ["origin"]);
  if (value === "verification_failed") return "verification_failed";
  if (value === "post_action_decision") return "post_action_decision";
  return "policy_decision";
}
