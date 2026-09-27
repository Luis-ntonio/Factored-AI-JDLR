/**
 * Contrato de salida de la parte transaccional de la capa "Act":
 * transaction-agent (`services/transaction-agent`), invocado únicamente
 * después de que policy-agent autorizó `decision === "AUTO"` en
 * `stage: pre_action` para `intent: eligibility_check`
 * (`policies.yaml`, regla `auto-eligibility-complete`, sin que ninguna regla
 * ESCALATE/CLARIFY de excepción haya ganado — ver
 * `evaluation_semantics.model: most_conservative_match_wins`).
 *
 * Este archivo es la fuente de verdad del tipo `EligibilityResult`.
 * `services/policy-agent/src/evaluator.ts` ya NO tiene una interfaz local
 * paralela que deba mantenerse sincronizada a mano: importa este mismo tipo
 * directamente (`import type { EligibilityResult } from
 * "@banking-agent/shared";`), así que cualquier cambio de campos acá se
 * refleja automáticamente ahí, con garantía de compilación cruzada en vez de
 * una convención informal. Este archivo también RESUELVE las 3 preguntas
 * abiertas que `policies.yaml` deja
 * explícitas justo antes de `post_action_rules`
 * (`post_action_contract_status: PROPOSAL_NOT_CONFIRMED`):
 *
 * 1. Escala de `eligibility_score`: **0-100, confirmado**. Era la escala ya
 *    asumida por policy-agent (`config.borderline_score_min`/`_max` en
 *    `policies.yaml` están en esa misma escala) — se mantiene sin
 *    ambigüedad, no se introduce una escala nueva.
 *
 * 2. Quién calcula `score_zone`: **transaction-agent la calcula**, no
 *    policy-agent. Para evitar que el umbral quede duplicado/desincronizado
 *    en dos lugares distintos, transaction-agent LEE
 *    `config.borderline_score_min`/`config.borderline_score_max`
 *    directamente de `policies.yaml` en tiempo de ejecución (con `js-yaml`,
 *    mismo mecanismo que `services/policy-agent/src/evaluator.ts`, ver
 *    `services/transaction-agent/src/config/load-thresholds.ts`) en vez de
 *    hardcodear esos números otra vez. Regla de derivación:
 *      - `score < borderline_score_min`              -> "declined"
 *      - `score > borderline_score_max`               -> "approved"
 *      - `borderline_score_min <= score <= borderline_score_max` (inclusive)
 *                                                      -> "borderline"
 *    Consecuencia deliberada: con esta implementación, las dos señales que
 *    combina con OR la regla `escalate-score-borderline` de
 *    `policies.yaml` (el `score_zone` reportado explícitamente, y el
 *    `eligibility_score` numérico contra `config.borderline_score_min/_max`)
 *    SIEMPRE van a coincidir, porque nacen de la misma fuente de umbrales.
 *    Esto es la forma más robusta de resolver la pregunta abierta: elimina
 *    la posibilidad de que ambas señales queden inconsistentes entre sí.
 *
 * 3. Correlación por `caseId` si el cálculo fuera async: en este checkpoint
 *    el cálculo de elegibilidad es **síncrono** (no hay Step Functions ni
 *    cola de turnos todavía, ver `docs/PLAN.md`, "Pendiente de decidir" —
 *    esa decisión de arquitectura sigue abierta y no la resuelve
 *    transaction-agent). La correlación se resuelve así: el resultado se
 *    persiste en la MISMA tabla real `banking-agent-dev-case-store`, en la
 *    MISMA partición `pk = CASE#<caseId>` que ya usa conversation-agent
 *    (`sk = RESULT#eligibility#<turnId>`, ver
 *    `services/transaction-agent/src/store/eligibility-store.ts` para el
 *    detalle de idempotencia) — cualquier consumidor futuro
 *    (verification-agent, un orquestador real) puede reconstruir el caso
 *    completo con un `Query` sobre `pk = CASE#<caseId>` sin necesitar un
 *    mecanismo de correlación aparte. Si en una fase futura el cálculo se
 *    vuelve asíncrono (SQS/Step Functions), este mismo par `caseId`+`turnId`
 *    sigue siendo la clave de correlación válida — esta decisión sobrevive a
 *    ese cambio futuro sin requerir un contrato nuevo.
 *
 * Productor:
 *  - `services/transaction-agent` (`computeEligibility`).
 *
 * Consumidores:
 *  - policy-agent (`evaluatePostAction`, `stage: post_action` de
 *    `policies.yaml`) — decide AUTO/ESCALATE sobre el resultado.
 *  - verification-agent (fase posterior) — nunca se reporta este resultado
 *    directamente al usuario sin pasar antes por esa capa.
 */

import type { ProductType } from "./understand-output";

/** Zona de riesgo derivada del `eligibility_score` contra los umbrales
 * configurables de `policies.yaml` (`config.borderline_score_min/_max`).
 * Ver resolución de la pregunta abierta #2 en el docstring de este archivo. */
export type ScoreZone = "approved" | "borderline" | "declined";

/**
 * Contrato de salida exacto de transaction-agent.
 * `services/policy-agent/src/evaluator.ts` importa este mismo tipo
 * directamente desde `@banking-agent/shared` (no una interfaz local
 * duplicada), así que un `EligibilityResult` real se pasa a
 * `evaluatePostAction` sin mapeo ni riesgo de que ambos lados diverjan.
 */
export interface EligibilityResult {
  /** Igual a `UnderstandOutput.context.caseId` del turno que disparó el
   * cálculo (correlación, ver resolución de la pregunta abierta #3). */
  caseId: string;
  /** Eco de `entities.product_type` usado para el cálculo. */
  productType: ProductType;
  /** Escala 0-100 (ver resolución de la pregunta abierta #1). */
  eligibility_score: number;
  /** Ver resolución de la pregunta abierta #2. */
  score_zone: ScoreZone;
}
