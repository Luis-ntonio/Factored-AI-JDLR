import { describe, expect, it } from "vitest";
import { emptyEntities } from "@banking-agent/shared";
import { computeEligibilityScore } from "../src/scoring/compute-score";

/**
 * Casos representativos de la fórmula documentada en
 * `src/scoring/compute-score.ts` (base 50, 4 factores, clamp [0,100]). Cada
 * expectativa numérica está calculada a mano en el comentario del test, para
 * que un reviewer pueda auditarla sin ejecutar código.
 */
describe("computeEligibilityScore", () => {
  it("empleado con ratio de deuda bajo y cliente existente -> score alto (clamp a 100)", () => {
    // base 50 + employed(+20) + ratio 8000/5000=1.6<=2(+20) + existing(+10) + amount<=30000(0) = 100
    const entities = {
      ...emptyEntities(),
      employment_status: "employed" as const,
      income: 5000,
      requested_amount: 8000,
      existing_customer: true,
    };
    expect(computeEligibilityScore(entities)).toBe(100);
  });

  it("unemployed (defensivo) -> score cae claramente a 0 (clamp), incluso con el resto favorable", () => {
    // base 50 + unemployed(-100) + ratio 1000/500=2<=2(+20) + existing false(0) + amount(0) = -30 -> clamp 0
    const entities = {
      ...emptyEntities(),
      employment_status: "unemployed" as const,
      income: 500,
      requested_amount: 1000,
      existing_customer: false,
    };
    expect(computeEligibilityScore(entities)).toBe(0);
  });

  it("ratio deuda/ingreso alto (>6) -> penalización de -30", () => {
    // base 50 + employed(+20) + ratio 10000/1000=10>6(-30) + existing null(0) + amount(0) = 40
    const entities = {
      ...emptyEntities(),
      employment_status: "employed" as const,
      income: 1000,
      requested_amount: 10000,
      existing_customer: null,
    };
    expect(computeEligibilityScore(entities)).toBe(40);
  });

  it("existing_customer true vs. false/null: diferencia exacta de 10 puntos, todo lo demás igual", () => {
    const base = {
      ...emptyEntities(),
      employment_status: "employed" as const,
      income: 4000,
      requested_amount: 4000, // ratio 1 <= 2 -> +20
    };
    const withCustomer = computeEligibilityScore({ ...base, existing_customer: true });
    const withoutCustomer = computeEligibilityScore({ ...base, existing_customer: false });
    const nullCustomer = computeEligibilityScore({ ...base, existing_customer: null });

    expect(withCustomer - withoutCustomer).toBe(10);
    expect(withoutCustomer).toBe(nullCustomer);
  });

  it("income <= 0 se trata como el tramo de mayor riesgo (-30), nunca divide por cero", () => {
    const entities = {
      ...emptyEntities(),
      employment_status: "employed" as const,
      income: 0,
      requested_amount: 5000,
      existing_customer: false,
    };
    // base 50 + employed(+20) + income<=0(-30) + existing(0) + amount(0) = 40
    expect(computeEligibilityScore(entities)).toBe(40);
    expect(Number.isFinite(computeEligibilityScore(entities))).toBe(true);
  });

  it("income o requested_amount null -> mismo tramo de mayor riesgo, nunca NaN/crash", () => {
    const entities = {
      ...emptyEntities(),
      employment_status: "self_employed" as const,
      income: null,
      requested_amount: 5000,
      existing_customer: null,
    };
    // base 50 + self_employed(+10) + income null(-30) + existing(0) + amount(0) = 30
    expect(computeEligibilityScore(entities)).toBe(30);
  });

  it("requested_amount > 30000 aplica la penalización de monto alto (-10)", () => {
    const entities = {
      ...emptyEntities(),
      employment_status: "employed" as const,
      income: 20000,
      requested_amount: 35000, // ratio 1.75 <= 2 -> +20
      existing_customer: true,
    };
    // base 50 + employed(+20) + ratio(+20) + existing(+10) + amount>30000(-10) = 90
    expect(computeEligibilityScore(entities)).toBe(90);
  });

  it("student y retired aplican sus ajustes documentados", () => {
    const base = {
      ...emptyEntities(),
      income: 4000,
      requested_amount: 4000,
      existing_customer: false,
    };
    // base 50 + student(-10) + ratio(+20) = 60
    expect(computeEligibilityScore({ ...base, employment_status: "student" })).toBe(60);
    // base 50 + retired(+10) + ratio(+20) = 80
    expect(computeEligibilityScore({ ...base, employment_status: "retired" })).toBe(80);
  });

  it("employment_status null o 'unknown' no premia ni penaliza (ajuste 0)", () => {
    const base = {
      ...emptyEntities(),
      income: 4000,
      requested_amount: 4000,
      existing_customer: false,
    };
    // base 50 + 0 + ratio(+20) = 70
    expect(computeEligibilityScore({ ...base, employment_status: null })).toBe(70);
    expect(computeEligibilityScore({ ...base, employment_status: "unknown" })).toBe(70);
  });

  it("el resultado siempre queda en [0, 100] (clamp)", () => {
    const worst = {
      ...emptyEntities(),
      employment_status: "unemployed" as const,
      income: -100,
      requested_amount: 999999,
      existing_customer: false,
    };
    const best = {
      ...emptyEntities(),
      employment_status: "employed" as const,
      income: 100000,
      requested_amount: 1000,
      existing_customer: true,
    };
    expect(computeEligibilityScore(worst)).toBe(0);
    expect(computeEligibilityScore(best)).toBe(100);
  });
});
