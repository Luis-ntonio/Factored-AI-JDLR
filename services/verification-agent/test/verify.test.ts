import { describe, expect, it } from "vitest";
import type { EligibilityResult, RetrievalResult } from "@banking-agent/shared";
import { verifyResult } from "../src/verify";
import type { EligibilityHandlerResponseLike, VerificationInput } from "../src/types";

// Umbrales idénticos a los reales de policies.yaml (config.borderline_score_min:
// 55, config.borderline_score_max: 70) -- ver test/load-thresholds.test.ts
// para la verificación de que la lectura real coincide con estos valores.
const THRESHOLDS = { min: 55, max: 70 };

function eligibilityResult(overrides: Partial<EligibilityResult> = {}): EligibilityResult {
  return {
    caseId: "case-1",
    productType: "personal_loan",
    eligibility_score: 80,
    score_zone: "approved",
    ...overrides,
  };
}

function eligibilityHandlerResponse(
  overrides: Partial<EligibilityHandlerResponseLike> = {}
): EligibilityHandlerResponseLike {
  return { status: "ok", result: eligibilityResult(), ...overrides };
}

function retrievalResult(overrides: Partial<RetrievalResult> = {}): RetrievalResult {
  return { intent: "product_info", language: "es", found: true, ...overrides };
}

describe("verifyResult -- eligibility_check", () => {
  it("verifica cuando la zona derivada independientemente coincide y el score está en rango", () => {
    const input: VerificationInput = {
      intent: "eligibility_check",
      result: eligibilityHandlerResponse({ result: eligibilityResult({ eligibility_score: 90, score_zone: "approved" }) }),
    };
    const out = verifyResult(input, () => THRESHOLDS);
    expect(out.status).toBe("verified");
    expect(out.verified).toBe(true);
    expect(out.reason).toBeUndefined();
    expect(out.data).toEqual(eligibilityResult({ eligibility_score: 90, score_zone: "approved" }));
  });

  it("verifica el tramo borderline (zona inclusive en los extremos)", () => {
    const input: VerificationInput = {
      intent: "eligibility_check",
      result: eligibilityHandlerResponse({ result: eligibilityResult({ eligibility_score: 55, score_zone: "borderline" }) }),
    };
    const out = verifyResult(input, () => THRESHOLDS);
    expect(out.status).toBe("verified");
  });

  it("pending_confirmation cuando la zona reportada NO coincide con la recalculada", () => {
    const input: VerificationInput = {
      intent: "eligibility_check",
      // score 90 -> "approved" según los thresholds, pero transaction-agent
      // reportó "borderline": inconsistencia que debe detectar la
      // verificación independiente.
      result: eligibilityHandlerResponse({ result: eligibilityResult({ eligibility_score: 90, score_zone: "borderline" }) }),
    };
    const out = verifyResult(input, () => THRESHOLDS);
    expect(out.status).toBe("pending_confirmation");
    expect(out.verified).toBe(false);
    expect(out.reason).toMatch(/no coincide/);
    expect(out.data).toEqual(eligibilityResult({ eligibility_score: 90, score_zone: "borderline" }));
  });

  it("pending_confirmation cuando eligibility_score está fuera de [0, 100]", () => {
    const input: VerificationInput = {
      intent: "eligibility_check",
      result: eligibilityHandlerResponse({ result: eligibilityResult({ eligibility_score: 150, score_zone: "approved" }) }),
    };
    const out = verifyResult(input, () => THRESHOLDS);
    expect(out.status).toBe("pending_confirmation");
    expect(out.reason).toMatch(/fuera de rango/);
  });

  it("pending_confirmation cuando eligibility_score no es un número finito", () => {
    const input: VerificationInput = {
      intent: "eligibility_check",
      result: eligibilityHandlerResponse({
        result: { ...eligibilityResult(), eligibility_score: Number.POSITIVE_INFINITY },
      }),
    };
    const out = verifyResult(input, () => THRESHOLDS);
    expect(out.status).toBe("pending_confirmation");
  });

  it('pending_confirmation cuando transaction-agent reportó status !== "ok" (unavailable)', () => {
    const input: VerificationInput = {
      intent: "eligibility_check",
      result: eligibilityHandlerResponse({ status: "unavailable", result: undefined, reason: "dynamodb_read_failed" }),
    };
    const out = verifyResult(input, () => THRESHOLDS);
    expect(out.status).toBe("pending_confirmation");
    expect(out.verified).toBe(false);
    expect(out.reason).toMatch(/unavailable/);
  });

  it('pending_confirmation cuando transaction-agent reportó status !== "ok" (rejected)', () => {
    const input: VerificationInput = {
      intent: "eligibility_check",
      result: eligibilityHandlerResponse({ status: "rejected", result: undefined, reason: "entities.product_type ausente" }),
    };
    const out = verifyResult(input, () => THRESHOLDS);
    expect(out.status).toBe("pending_confirmation");
  });

  it('pending_confirmation cuando status === "ok" pero "result" no tiene forma de EligibilityResult', () => {
    const input: VerificationInput = {
      intent: "eligibility_check",
      result: { status: "ok" },
    };
    const out = verifyResult(input, () => THRESHOLDS);
    expect(out.status).toBe("pending_confirmation");
    expect(out.data).toEqual({ status: "ok" });
  });

  it("pending_confirmation cuando el result no tiene ni la forma mínima de EligibilityHandlerResponse", () => {
    const input: VerificationInput = { intent: "eligibility_check", result: { foo: "bar" } };
    const out = verifyResult(input, () => THRESHOLDS);
    expect(out.status).toBe("pending_confirmation");
  });
});

describe("verifyResult -- product_info / faq", () => {
  it("verifica cuando found = false (señal honesta de retrieval-agent, no una falla)", () => {
    const input: VerificationInput = {
      intent: "product_info",
      result: retrievalResult({ found: false, product: undefined, notes: "producto no está en catálogo" }),
    };
    const out = verifyResult(input, () => THRESHOLDS);
    expect(out.status).toBe("verified");
    expect(out.verified).toBe(true);
  });

  it("verifica product_info cuando found = true y product.source está presente", () => {
    const input: VerificationInput = {
      intent: "product_info",
      result: retrievalResult({
        found: true,
        product: {
          productType: "personal_loan",
          interestRateRange: { min: 10, max: 20 },
          requirements: { minIncome: 1000, acceptedDocumentTypes: ["DNI"], acceptedEmploymentStatus: ["employed"] },
          termRange: { minMonths: 6, maxMonths: 36 },
          amountRange: { min: 1000, max: 30000 },
          source: "internal_catalog_v1",
        },
      }),
    };
    const out = verifyResult(input, () => THRESHOLDS);
    expect(out.status).toBe("verified");
  });

  it("pending_confirmation para product_info cuando found = true pero product.source falta", () => {
    const input: VerificationInput = {
      intent: "product_info",
      result: retrievalResult({
        found: true,
        product: {
          productType: "personal_loan",
          interestRateRange: { min: 10, max: 20 },
          requirements: { minIncome: 1000, acceptedDocumentTypes: ["DNI"], acceptedEmploymentStatus: ["employed"] },
          termRange: { minMonths: 6, maxMonths: 36 },
          amountRange: { min: 1000, max: 30000 },
          source: "",
        },
      }),
    };
    const out = verifyResult(input, () => THRESHOLDS);
    expect(out.status).toBe("pending_confirmation");
    expect(out.reason).toMatch(/source/);
  });

  it("pending_confirmation para product_info cuando found = true pero product está ausente", () => {
    const input: VerificationInput = { intent: "product_info", result: retrievalResult({ found: true, product: undefined }) };
    const out = verifyResult(input, () => THRESHOLDS);
    expect(out.status).toBe("pending_confirmation");
  });

  it("verifica faq cuando found = true y todas las entradas tienen source", () => {
    const input: VerificationInput = {
      intent: "faq",
      result: retrievalResult({
        intent: "faq",
        found: true,
        faqs: [
          { id: "faq-1", language: "es", question: "q", answer: "a", source: "internal_catalog_v1" },
          { id: "faq-2", language: "es", question: "q2", answer: "a2", source: "internal_catalog_v1" },
        ],
      }),
    };
    const out = verifyResult(input, () => THRESHOLDS);
    expect(out.status).toBe("verified");
  });

  it("pending_confirmation para faq cuando faqs es un array vacío", () => {
    const input: VerificationInput = {
      intent: "faq",
      result: retrievalResult({ intent: "faq", found: true, faqs: [] }),
    };
    const out = verifyResult(input, () => THRESHOLDS);
    expect(out.status).toBe("pending_confirmation");
  });

  it("pending_confirmation para faq cuando alguna entrada no tiene source", () => {
    const input: VerificationInput = {
      intent: "faq",
      result: retrievalResult({
        intent: "faq",
        found: true,
        faqs: [
          { id: "faq-1", language: "es", question: "q", answer: "a", source: "internal_catalog_v1" },
          { id: "faq-2", language: "es", question: "q2", answer: "a2", source: "" },
        ],
      }),
    };
    const out = verifyResult(input, () => THRESHOLDS);
    expect(out.status).toBe("pending_confirmation");
  });

  it("pending_confirmation cuando el result no tiene forma de RetrievalResult", () => {
    const input: VerificationInput = { intent: "product_info", result: { foo: "bar" } };
    const out = verifyResult(input, () => THRESHOLDS);
    expect(out.status).toBe("pending_confirmation");
  });
});

describe("verifyResult -- input malformado / intent desconocido", () => {
  it("pending_confirmation cuando intent no es ninguno de los 3 esperados", () => {
    const input = { intent: "escalation_request", result: {} } as unknown as VerificationInput;
    const out = verifyResult(input, () => THRESHOLDS);
    expect(out.status).toBe("pending_confirmation");
    expect(out.verified).toBe(false);
  });

  it("pending_confirmation cuando el input completo no es un objeto", () => {
    const out = verifyResult(null, () => THRESHOLDS);
    expect(out.status).toBe("pending_confirmation");
    expect(out.verified).toBe(false);
  });

  it("pending_confirmation cuando el input es un string", () => {
    const out = verifyResult("not an object" as unknown, () => THRESHOLDS);
    expect(out.status).toBe("pending_confirmation");
  });

  it("nunca reporta 'verified' por default ante forma completamente vacía", () => {
    const out = verifyResult({}, () => THRESHOLDS);
    expect(out.status).toBe("pending_confirmation");
    expect(out.verified).toBe(false);
  });
});

describe("verifyResult -- getThresholds() es lazy (policies.yaml solo hace falta para eligibility_check)", () => {
  it("NO invoca getThresholds() para product_info/faq (no dependen de policies.yaml)", () => {
    const explosiveThresholds = () => {
      throw new Error("policies.yaml no debería leerse para este intent");
    };
    const input: VerificationInput = { intent: "product_info", result: retrievalResult({ found: false }) };
    expect(() => verifyResult(input, explosiveThresholds)).not.toThrow();
    expect(verifyResult(input, explosiveThresholds).status).toBe("verified");
  });

  it("invoca getThresholds() para eligibility_check solo cuando hay un EligibilityResult válido que comparar", () => {
    let calls = 0;
    const countingThresholds = () => {
      calls += 1;
      return THRESHOLDS;
    };
    const input: VerificationInput = {
      intent: "eligibility_check",
      result: eligibilityHandlerResponse({ result: eligibilityResult({ eligibility_score: 90, score_zone: "approved" }) }),
    };
    verifyResult(input, countingThresholds);
    expect(calls).toBe(1);
  });

  it("NO invoca getThresholds() para eligibility_check cuando status !== 'ok' (nada que comparar todavía)", () => {
    const explosiveThresholds = () => {
      throw new Error("policies.yaml no debería leerse si no hay un EligibilityResult que verificar");
    };
    const input: VerificationInput = {
      intent: "eligibility_check",
      result: eligibilityHandlerResponse({ status: "unavailable", result: undefined }),
    };
    expect(() => verifyResult(input, explosiveThresholds)).not.toThrow();
  });

  it("propaga la excepción de getThresholds() cuando eligibility_check SÍ la necesita (handler.ts es quien la atrapa)", () => {
    const explosiveThresholds = () => {
      throw new Error("policies.yaml malformado");
    };
    const input: VerificationInput = {
      intent: "eligibility_check",
      result: eligibilityHandlerResponse({ result: eligibilityResult({ eligibility_score: 90, score_zone: "approved" }) }),
    };
    expect(() => verifyResult(input, explosiveThresholds)).toThrow("policies.yaml malformado");
  });
});
