import type { ScoreZone } from "@banking-agent/shared";

/**
 * Deriva `score_zone` a partir de `eligibility_score` y los umbrales
 * configurables `borderline_score_min`/`borderline_score_max` de
 * `policies.yaml` (ver `../config/load-thresholds.ts`).
 *
 * Resolución de la pregunta abierta #2 de `policies.yaml`
 * (ver `packages/shared/src/contracts/eligibility-result.ts` para el
 * detalle completo): transaction-agent calcula `score_zone` a partir de la
 * MISMA fuente de umbrales que usa policy-agent, por lo que ambas señales
 * combinadas con `OR` en la regla `escalate-score-borderline` de
 * `policies.yaml` siempre coinciden.
 *
 * Límites inclusivos en el tramo "borderline":
 *   - score <  min        -> "declined"
 *   - score >  max        -> "approved"
 *   - min <= score <= max -> "borderline"
 */
export function deriveScoreZone(score: number, thresholds: { min: number; max: number }): ScoreZone {
  if (score < thresholds.min) return "declined";
  if (score > thresholds.max) return "approved";
  return "borderline";
}
