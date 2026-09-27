import type { Entities } from "@banking-agent/shared";

/**
 * Regla de scoring determinística de transaction-agent — fórmula simple,
 * auditable a simple vista (sin ML, sin llamada a modelo entrenado, mismo
 * criterio de "config auditable en vez de lógica oculta en prompt" que
 * `policies.yaml`). Un humano debe poder reproducir el resultado a mano
 * leyendo este archivo, sin ejecutar código.
 *
 * LIMITACIÓN CONOCIDA (deuda/ingreso real vs. proxy): el contrato `Entities`
 * de `@banking-agent/shared` (lo único que conversation-agent efectivamente
 * recolecta) NO tiene un campo de deuda existente del cliente. La tarea
 * original de este checkpoint pide un factor "deuda/ingreso" -- como no hay
 * un dato real de deuda, se usa el ratio `requested_amount / income` como
 * PROXY de carga financiera relativa (a mayor monto solicitado respecto al
 * ingreso, mayor riesgo). Esto NO es deuda real del cliente, es una
 * aproximación consciente con los datos disponibles -- documentado también
 * en README.md como limitación, no como un descuido.
 *
 * Fórmula (4 factores, base 50, clamp final a [0, 100]):
 *
 *  1. Base: 50 puntos.
 *
 *  2. `employment_status`:
 *       employed        -> +20
 *       self_employed    -> +10
 *       retired          -> +10
 *       student          -> -10
 *       unemployed       -> -100  (defensivo: en el pipeline real
 *                                   `escalate-eligibility-unemployed` de
 *                                   policies.yaml ya saca este caso del
 *                                   camino AUTO antes de llegar acá -- pero
 *                                   transaction-agent nunca asume que un
 *                                   valor "imposible" no puede llegar, y si
 *                                   llegara, el score debe caer claramente a
 *                                   zona "declined", nunca crashear.)
 *       null / "unknown" -> 0 (decisión propia, no pedida explícitamente por
 *                              la tarea original: dato ausente/no
 *                              clasificado no se premia ni se penaliza --
 *                              en el flujo real `missing_fields` ya exige
 *                              este campo antes de llegar a AUTO, así que
 *                              este caso es defensivo, igual que
 *                              "unemployed").
 *
 *  3. Ratio `requested_amount / income` (proxy deuda/ingreso):
 *       income <= 0, o income/requested_amount ausentes (`null`)
 *                        -> tratado como el caso de MAYOR riesgo (mismo
 *                           tramo que ratio > 6), tanto por seguridad
 *                           (nunca dividir por cero / usar NaN) como porque
 *                           datos financieros incompletos o un ingreso
 *                           declarado <= 0 son en sí una señal de riesgo.
 *       ratio <= 2       -> +20
 *       ratio <= 4       -> +10
 *       ratio <= 6       -> 0
 *       ratio > 6        -> -30
 *
 *  4. `existing_customer === true` -> +10; `false` o `null` -> 0.
 *
 *  5. `requested_amount > 30000` -> -10; si no, 0 (rango que policies.yaml
 *     todavía deja pasar a AUTO, ya que `requested_amount > 50000` escala
 *     en `stage: pre_action` antes de llegar acá -- este factor penaliza el
 *     tramo alto restante que sigue siendo AUTO-elegible).
 *
 *  Clamp final: `Math.max(0, Math.min(100, total))`.
 */

const EMPLOYMENT_ADJUSTMENT: Record<string, number> = {
  employed: 20,
  self_employed: 10,
  retired: 10,
  student: -10,
  unemployed: -100,
  unknown: 0,
};

const BASE_SCORE = 50;
const HIGH_AMOUNT_THRESHOLD = 30000;

function employmentAdjustment(entities: Entities): number {
  const status = entities.employment_status;
  if (status === null || status === undefined) return 0;
  return EMPLOYMENT_ADJUSTMENT[status] ?? 0;
}

function debtToIncomeAdjustment(entities: Entities): number {
  const { income, requested_amount } = entities;
  if (income === null || requested_amount === null || income <= 0) {
    // Dato incompleto o ingreso no positivo: mismo tratamiento que el tramo
    // de mayor riesgo (ratio > 6), nunca se divide por cero / NaN.
    return -30;
  }
  const ratio = requested_amount / income;
  if (ratio <= 2) return 20;
  if (ratio <= 4) return 10;
  if (ratio <= 6) return 0;
  return -30;
}

function existingCustomerAdjustment(entities: Entities): number {
  return entities.existing_customer === true ? 10 : 0;
}

function highAmountAdjustment(entities: Entities): number {
  const amount = entities.requested_amount;
  if (amount === null) return 0;
  return amount > HIGH_AMOUNT_THRESHOLD ? -10 : 0;
}

/**
 * Función pura (sin AWS, sin I/O) -- testeable sin mocks. Nunca lanza
 * excepción: cualquier combinación de `entities` (incluso con campos
 * faltantes que en el pipeline real ya deberían haber sido bloqueados por
 * policy-agent) produce un número en [0, 100].
 */
export function computeEligibilityScore(entities: Entities): number {
  const total =
    BASE_SCORE +
    employmentAdjustment(entities) +
    debtToIncomeAdjustment(entities) +
    existingCustomerAdjustment(entities) +
    highAmountAdjustment(entities);

  return Math.max(0, Math.min(100, total));
}
