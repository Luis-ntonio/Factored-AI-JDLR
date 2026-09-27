import type { VerificationResult } from "@banking-agent/shared";
import type { BorderlineThresholds } from "./config/load-thresholds";
import {
  hasValidFaqSources,
  hasValidProductSource,
  isEligibilityHandlerResponseLike,
  isEligibilityResultShape,
  isRetrievalResultShape,
} from "./guards";
import { deriveScoreZone } from "./scoring/score-zone";
import type { VerificationInput } from "./types";

/**
 * Lógica pura de negocio de la capa "Verify" -- extraída de `handler.ts`
 * para poder testearla sin pasar por la firma Task-a-Task, mismo criterio
 * que `handleRetrieval`/`computeEligibility`/`evaluatePreAction` en las
 * piezas anteriores del pipeline.
 *
 * Este es el paso EXPLÍCITO Y VISIBLE del pipeline que hace una SEGUNDA
 * verificación INDEPENDIENTE del resultado ya producido por
 * retrieval-agent/transaction-agent -- nunca un passthrough. Si no se puede
 * verificar con certeza, el resultado se reporta como
 * `"pending_confirmation"` -- nunca `"verified"` por default (ver
 * `packages/shared/src/contracts/verification-result.ts`).
 *
 * NO lanza -- cualquier forma inesperada de `input`/`input.result` se
 * resuelve acá mismo a `"pending_confirmation"` con un `reason` explícito.
 *
 * `getThresholds` se recibe como función LAZY (no como valor ya resuelto) a
 * propósito: `policies.yaml` solo hace falta para el camino de
 * `eligibility_check` (recálculo independiente de `score_zone`). Si se
 * resolviera ansiosamente en `handler.ts` antes de llamar acá, un
 * `policies.yaml` roto degradaría también la verificación de
 * `product_info`/`faq`, que no lo necesita para nada -- acoplamiento
 * innecesario que este diseño evita. Si `getThresholds()` lanza (yaml
 * malformado, archivo no encontrado), la excepción se propaga tal cual hacia
 * `handler.ts`, que sí tiene el try/catch de nivel superior (ver
 * README.md, sección Reliability) -- este archivo no la atrapa a propósito,
 * para no duplicar ese manejo en dos lugares.
 */
export function verifyResult(input: unknown, getThresholds: () => BorderlineThresholds): VerificationResult {
  if (typeof input !== "object" || input === null) {
    return pendingConfirmation("input de verification-agent malformado (no es un objeto)", null);
  }

  const candidate = input as Partial<VerificationInput>;

  switch (candidate.intent) {
    case "eligibility_check":
      return verifyEligibilityCheck(candidate.result, getThresholds);
    case "product_info":
    case "faq":
      return verifyRetrieval(candidate.intent, candidate.result);
    default:
      return pendingConfirmation(
        `intent "${String(candidate.intent)}" no reconocido por verification-agent`,
        candidate.result ?? null
      );
  }
}

function verifyEligibilityCheck(rawResult: unknown, getThresholds: () => BorderlineThresholds): VerificationResult {
  if (!isEligibilityHandlerResponseLike(rawResult)) {
    return pendingConfirmation(
      "el body de transaction-agent no tiene la forma esperada de EligibilityHandlerResponse",
      rawResult ?? null
    );
  }

  if (rawResult.status !== "ok") {
    return pendingConfirmation(
      `transaction-agent no reportó un resultado exitoso (status: "${rawResult.status}")` +
        (rawResult.reason ? `, reason: "${rawResult.reason}"` : ""),
      rawResult
    );
  }

  if (!isEligibilityResultShape(rawResult.result)) {
    return pendingConfirmation(
      'transaction-agent reportó status "ok" pero "result" no tiene la forma de EligibilityResult',
      rawResult
    );
  }

  const eligibility = rawResult.result;
  const score = eligibility.eligibility_score;

  if (!Number.isFinite(score) || score < 0 || score > 100) {
    return pendingConfirmation(
      `eligibility_score fuera de rango o no numérico (valor recibido: ${score})`,
      eligibility
    );
  }

  const thresholds = getThresholds();
  const derivedZone = deriveScoreZone(score, thresholds);
  if (derivedZone !== eligibility.score_zone) {
    return pendingConfirmation(
      `score_zone no coincide con la verificación independiente: transaction-agent reportó ` +
        `"${eligibility.score_zone}", verification-agent recalculó "${derivedZone}" (score: ${score}, ` +
        `thresholds: [${thresholds.min}, ${thresholds.max}])`,
      eligibility
    );
  }

  return verified(eligibility);
}

function verifyRetrieval(intent: "product_info" | "faq", rawResult: unknown): VerificationResult {
  if (!isRetrievalResultShape(rawResult)) {
    return pendingConfirmation(
      "el body de retrieval-agent no tiene la forma esperada de RetrievalResult",
      rawResult ?? null
    );
  }

  // found: false ya es una señal HONESTA de "no encontrado" de parte de
  // retrieval-agent (catálogo/FAQ no disponible o no aplicable) -- no es una
  // falla que verificar, se reporta como verificado.
  if (rawResult.found === false) {
    return verified(rawResult);
  }

  if (intent === "product_info") {
    if (!hasValidProductSource(rawResult.product)) {
      return pendingConfirmation(
        "RetrievalResult.found = true para product_info pero product.source está ausente/vacío",
        rawResult
      );
    }
    return verified(rawResult);
  }

  // intent === "faq"
  if (!hasValidFaqSources(rawResult.faqs)) {
    return pendingConfirmation(
      "RetrievalResult.found = true para faq pero faqs está vacío/ausente o alguna entrada no tiene source",
      rawResult
    );
  }
  return verified(rawResult);
}

function verified<T>(data: T): VerificationResult<T> {
  return { status: "verified", verified: true, data };
}

function pendingConfirmation<T>(reason: string, data: T): VerificationResult<T> {
  return { status: "pending_confirmation", verified: false, reason, data };
}
