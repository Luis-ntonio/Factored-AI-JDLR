import type { Entities, EligibilityResult, ProductType } from "@banking-agent/shared";
import { computeEligibilityScore } from "./scoring/compute-score";
import { deriveScoreZone } from "./scoring/score-zone";
import type { EligibilityStore } from "./store/types";

export interface ComputeEligibilityInput {
  caseId: string;
  /** Mismo `turnId` que `UnderstandOutput.context.turnId` del turno que
   * disparó el AUTO -- forma la `idempotencyKey` junto con `caseId`. */
  turnId: string;
  productType: ProductType;
  entities: Entities;
}

export interface ComputeEligibilityDeps {
  store: EligibilityStore;
  thresholds: { min: number; max: number };
}

/**
 * Se lanza cuando DynamoDB falla (lectura o escritura) tras agotar los
 * reintentos acotados de `EligibilityStore`. NUNCA se fabrica un
 * `EligibilityResult` en este caso -- el caller (handler Lambda, o un
 * futuro orquestador) debe capturar este error y decidir explícitamente
 * "reintentar" o "escalar a revisión humana" (ver README.md, sección
 * Reliability). Esta es la forma elegida de "propagar un estado de error
 * explícito" sin fabricar un resultado, preservando al mismo tiempo la
 * firma `Promise<EligibilityResult>` pedida por la tarea original para el
 * camino feliz -- ver README.md, sección "Decisiones propias", para la
 * justificación completa de esta desviación.
 */
export class EligibilityUnavailableError extends Error {
  constructor(public readonly reason: "dynamodb_read_failed" | "dynamodb_write_failed", caseId: string, turnId: string) {
    super(
      `No se pudo calcular/persistir el resultado de elegibilidad para caseId=${caseId} turnId=${turnId}: ${reason}`
    );
    this.name = "EligibilityUnavailableError";
  }
}

function log(event: string, fields: Record<string, unknown>): void {
  // Logging estructurado correlacionado por caseId/turnId (pilar
  // Observability/Reliability, ver README.md) -- nunca incluye `entities`
  // crudas (podrían contener PII vía `document_id`, aunque este módulo ni
  // siquiera recibe ese campo dentro de su lógica de scoring).
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ service: "transaction-agent", event, ...fields }));
}

/**
 * Orquestación pura de la capa Act (parte transaccional): calcula
 * elegibilidad de forma determinística, con idempotencia obligatoria sobre
 * `EligibilityStore`.
 *
 * Flujo:
 *  1. `idempotencyKey = "${caseId}:${turnId}"` -> `store.getResult`.
 *     - Si ya existe -> se devuelve tal cual, SIN recalcular (requisito
 *       explícito de este checkpoint: evita duplicar el cálculo/la
 *       "acción" en reintentos).
 *     - Si el store no responde -> `EligibilityUnavailableError("dynamodb_read_failed")`.
 *  2. Si no existe: se calcula el score (`computeEligibilityScore`, función
 *     pura) y se deriva `score_zone` (`deriveScoreZone`) contra los
 *     `thresholds` ya leídos de `policies.yaml` (ver
 *     `./config/load-thresholds.ts`).
 *  3. Se persiste (`store.putResult`) antes de devolver el resultado.
 *     - Si el store no responde -> `EligibilityUnavailableError("dynamodb_write_failed")`.
 *       Se prefiere no reportar éxito si no se pudo confirmar la
 *       persistencia idempotente, aunque el cálculo en sí sea determinístico
 *       y "correcto" -- ver README.md para la justificación de esta
 *       decisión conservadora.
 */
export async function computeEligibility(
  input: ComputeEligibilityInput,
  deps: ComputeEligibilityDeps
): Promise<EligibilityResult> {
  const { caseId, turnId, productType, entities } = input;
  const { store, thresholds } = deps;

  log("idempotency_check_start", { caseId, turnId });
  const existing = await store.getResult(caseId, turnId);

  if (existing.status === "unavailable") {
    log("idempotency_check_failed", { caseId, turnId, reason: existing.reason });
    throw new EligibilityUnavailableError(existing.reason, caseId, turnId);
  }

  if (existing.status === "found") {
    log("idempotency_hit_no_recompute", { caseId, turnId, score_zone: existing.value.score_zone });
    return existing.value;
  }

  log("computing_score", { caseId, turnId, productType });
  const score = computeEligibilityScore(entities);
  const score_zone = deriveScoreZone(score, thresholds);
  const result: EligibilityResult = { caseId, productType, eligibility_score: score, score_zone };

  const putOutcome = await store.putResult(result, turnId);
  if (putOutcome.status === "unavailable") {
    log("persist_failed", { caseId, turnId, reason: putOutcome.reason });
    throw new EligibilityUnavailableError(putOutcome.reason, caseId, turnId);
  }

  log("computed_and_persisted", { caseId, turnId, eligibility_score: score, score_zone });
  return result;
}
