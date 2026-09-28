import type { DisputeVerificationResult, EligibilityResult, RetrievalResult } from "@banking-agent/shared";
import type { DisputeHandlerResponseLike, EligibilityHandlerResponseLike } from "./types";

/**
 * Type guards mínimos, sin dependencias externas -- mismo criterio que
 * `isUnderstandOutput` de `@banking-agent/shared`
 * (`packages/shared/src/contracts/understand-output.ts`): no reemplazan un
 * JSON Schema formal, son la última línea de defensa en runtime antes de
 * confiar en la forma de un `unknown` recibido de otro Lambda. Ver
 * limitación documentada en README.md.
 */

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function isEligibilityHandlerResponseLike(value: unknown): value is EligibilityHandlerResponseLike {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return v.status === "ok" || v.status === "unavailable" || v.status === "rejected";
}

export function isEligibilityResultShape(value: unknown): value is EligibilityResult {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  if (typeof v.caseId !== "string") return false;
  if (typeof v.productType !== "string") return false;
  if (typeof v.eligibility_score !== "number") return false;
  if (v.score_zone !== "approved" && v.score_zone !== "borderline" && v.score_zone !== "declined") {
    return false;
  }
  return true;
}

export function isDisputeHandlerResponseLike(value: unknown): value is DisputeHandlerResponseLike {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return v.status === "ok" || v.status === "unavailable" || v.status === "rejected";
}

export function isDisputeVerificationResultShape(value: unknown): value is DisputeVerificationResult {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  if (typeof v.caseId !== "string") return false;
  if (typeof v.transactionFound !== "boolean") return false;
  if (typeof v.fraudSuspected !== "boolean") return false;
  if (typeof v.productBlocked !== "boolean") return false;
  if (v.transactionId !== undefined && typeof v.transactionId !== "string") return false;
  return true;
}

export function isRetrievalResultShape(value: unknown): value is RetrievalResult {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  if (v.intent !== "product_info" && v.intent !== "faq") return false;
  if (v.language !== "es" && v.language !== "pt") return false;
  if (typeof v.found !== "boolean") return false;
  return true;
}

/** `ProductCatalogEntry.source` no vacío (trazabilidad mínima exigida por el
 * contrato, ver `packages/shared/src/contracts/retrieval-result.ts`). */
export function hasValidProductSource(product: unknown): boolean {
  if (typeof product !== "object" || product === null) return false;
  const p = product as Record<string, unknown>;
  return isNonEmptyString(p.source);
}

/** Cada `FaqEntry` de un array debe tener `source` no vacío. */
export function hasValidFaqSources(faqs: unknown): faqs is Array<{ source: string }> {
  if (!Array.isArray(faqs) || faqs.length === 0) return false;
  return faqs.every((faq) => {
    if (typeof faq !== "object" || faq === null) return false;
    return isNonEmptyString((faq as Record<string, unknown>).source);
  });
}
