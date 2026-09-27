import type { ScoreZone } from "@banking-agent/shared";

/**
 * Copia funcionalmente idéntica a
 * `services/transaction-agent/src/scoring/score-zone.ts` -- ver la nota de
 * diseño en `../config/load-thresholds.ts` sobre por qué verification-agent
 * NO importa código de `@banking-agent/transaction-agent` (cada servicio es
 * su propio paquete Lambda independiente). Es precisamente esta función
 * duplicada+independiente la que le permite a verification-agent recalcular
 * `score_zone` por su cuenta y COMPARARLA contra la que ya vino calculada,
 * en vez de confiar ciegamente en el valor reportado.
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
