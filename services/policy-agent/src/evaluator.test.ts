import { describe, expect, it, beforeAll } from "vitest";
import * as path from "node:path";
import type { EligibilityResult, UnderstandOutput } from "@banking-agent/shared";
import { loadPolicyFile, evaluatePreAction, evaluatePostAction } from "./evaluator";
import type { PolicyFile } from "./types";

/**
 * NOTA DE HONESTIDAD: esta suite fue escrita por policy-agent pero NUNCA
 * ejecutada (no hay acceso a shell en este checkpoint). El reviewer debe
 * correr `npm install && npm run build --workspace=@banking-agent/shared &&
 * npm test --workspace=@banking-agent/policy-agent` y tratar cualquier
 * fallo como un bug real a corregir, no como un falso positivo.
 */

const POLICY_PATH = path.resolve(__dirname, "../../../policies.yaml");

function baseContext(overrides: Partial<UnderstandOutput["context"]> = {}) {
  return {
    caseId: "case-1",
    customerId: null,
    turnId: "turn-1",
    degraded: false,
    degradedReason: "none" as const,
    historyTurns: 0,
    ...overrides,
  };
}

function emptyEntities(): UnderstandOutput["entities"] {
  return {
    income: null,
    employment_status: null,
    requested_amount: null,
    document_id: null,
    document_type: null,
    product_type: null,
    existing_customer: null,
    disputed_amount: null,
    merchant: null,
    transaction_date: null,
    dispute_reason: null,
  };
}

describe("policy-agent evaluator", () => {
  let policy: PolicyFile;

  beforeAll(() => {
    policy = loadPolicyFile(POLICY_PATH);
  });

  it("carga policies.yaml con al menos una regla pre_action y una post_action", () => {
    expect(policy.rules.length).toBeGreaterThan(0);
    expect((policy.post_action_rules ?? []).length).toBeGreaterThan(0);
  });

  it("CONTRACTS.md 5.1 — eligibility_check con casi todo faltante -> CLARIFY", () => {
    const input: UnderstandOutput = {
      intent: "eligibility_check",
      language: "es",
      entities: { ...emptyEntities(), product_type: "credit_card" },
      missing_fields: ["income", "employment_status", "requested_amount", "document_id", "existing_customer"],
      context: baseContext(),
    };
    const result = evaluatePreAction(input, policy);
    expect(result.decision).toBe("CLARIFY");
    // product_type ya está dado -> según ask_field_priority, el siguiente
    // pendiente en la lista es "income".
    expect(result.askField).toBe("income");
  });

  it("CONTRACTS.md 5.2 — eligibility_check completo, sin excepciones -> AUTO", () => {
    const input: UnderstandOutput = {
      intent: "eligibility_check",
      language: "pt",
      entities: {
        ...emptyEntities(),
        income: 3000,
        employment_status: "employed",
        requested_amount: 8000,
        document_id: "12345678900",
        document_type: "CPF",
        product_type: "credit_card",
        existing_customer: true,
      },
      missing_fields: [],
      context: baseContext({ customerId: "cust-42", historyTurns: 2 }),
    };
    const result = evaluatePreAction(input, policy);
    expect(result.decision).toBe("AUTO");
    expect(result.winningRuleId).toBe("auto-eligibility-complete");
  });

  it("CONTRACTS.md 5.3 — product_info completo, degradado -> AUTO (degraded no afecta product_info)", () => {
    const input: UnderstandOutput = {
      intent: "product_info",
      language: "es",
      entities: { ...emptyEntities(), product_type: "personal_loan" },
      missing_fields: [],
      context: baseContext({ degraded: true, degradedReason: "dynamodb_read_failed" }),
    };
    const result = evaluatePreAction(input, policy);
    expect(result.decision).toBe("AUTO");
  });

  it("escalation_request siempre gana, incluso con datos completos", () => {
    const input: UnderstandOutput = {
      intent: "escalation_request",
      language: "es",
      entities: emptyEntities(),
      missing_fields: [],
      context: baseContext(),
    };
    const result = evaluatePreAction(input, policy);
    expect(result.decision).toBe("ESCALATE");
    expect(result.winningRuleId).toBe("escalate-explicit-request");
  });

  it("unknown siempre CLARIFY, nunca ESCALATE ni AUTO", () => {
    const input: UnderstandOutput = {
      intent: "unknown",
      language: "es",
      entities: emptyEntities(),
      missing_fields: [],
      context: baseContext(),
    };
    const result = evaluatePreAction(input, policy);
    expect(result.decision).toBe("CLARIFY");
  });

  it("eligibility_check con employment_status=unemployed y datos completos -> ESCALATE (gana sobre AUTO)", () => {
    const input: UnderstandOutput = {
      intent: "eligibility_check",
      language: "es",
      entities: {
        ...emptyEntities(),
        income: 500,
        employment_status: "unemployed",
        requested_amount: 1000,
        document_id: "87654321",
        document_type: "DNI",
        product_type: "personal_loan",
        existing_customer: false,
      },
      missing_fields: [],
      context: baseContext(),
    };
    const result = evaluatePreAction(input, policy);
    expect(result.decision).toBe("ESCALATE");
    expect(result.matchedRules.map((m) => m.id)).toContain("auto-eligibility-complete");
    expect(result.matchedRules.map((m) => m.id)).toContain("escalate-eligibility-unemployed");
    expect(result.winningRuleId).toBe("escalate-eligibility-unemployed");
  });

  it("eligibility_check con requested_amount sobre el umbral -> ESCALATE", () => {
    const input: UnderstandOutput = {
      intent: "eligibility_check",
      language: "es",
      entities: {
        ...emptyEntities(),
        income: 5000,
        employment_status: "employed",
        requested_amount: 999999,
        document_id: "87654321",
        document_type: "DNI",
        product_type: "personal_loan",
        existing_customer: true,
      },
      missing_fields: [],
      context: baseContext(),
    };
    const result = evaluatePreAction(input, policy);
    expect(result.decision).toBe("ESCALATE");
    expect(result.winningRuleId).toBe("escalate-eligibility-amount-over-threshold");
  });

  it("eligibility_check con document_type null aunque missing_fields esté vacío -> CLARIFY (regla adicional)", () => {
    const input: UnderstandOutput = {
      intent: "eligibility_check",
      language: "es",
      entities: {
        ...emptyEntities(),
        income: 2000,
        employment_status: "employed",
        requested_amount: 3000,
        document_id: "12345678",
        document_type: null,
        product_type: "personal_loan",
        existing_customer: true,
      },
      missing_fields: [],
      context: baseContext(),
    };
    const result = evaluatePreAction(input, policy);
    expect(result.decision).toBe("CLARIFY");
    expect(result.winningRuleId).toBe("clarify-eligibility-document-type-not-explicit");
    expect(result.askField).toBe("document_type");
  });

  it("eligibility_check completo pero degraded=true -> CLARIFY, no ESCALATE (degradación de infra, no riesgo)", () => {
    const input: UnderstandOutput = {
      intent: "eligibility_check",
      language: "es",
      entities: {
        ...emptyEntities(),
        income: 2000,
        employment_status: "employed",
        requested_amount: 3000,
        document_id: "12345678",
        document_type: "DNI",
        product_type: "personal_loan",
        existing_customer: true,
      },
      missing_fields: [],
      context: baseContext({ degraded: true, degradedReason: "dynamodb_read_failed" }),
    };
    const result = evaluatePreAction(input, policy);
    expect(result.decision).toBe("CLARIFY");
    expect(result.winningRuleId).toBe("clarify-eligibility-degraded-context");
  });

  it("dispute_unrecognized_charge con document_id faltante (product_type presente) -> CLARIFY / clarify-dispute-missing-fields / askField=document_id", () => {
    const input: UnderstandOutput = {
      intent: "dispute_unrecognized_charge",
      language: "es",
      entities: {
        ...emptyEntities(),
        product_type: "credit_card",
        document_id: null,
      },
      missing_fields: ["document_id"],
      context: baseContext(),
    };
    const result = evaluatePreAction(input, policy);
    expect(result.decision).toBe("CLARIFY");
    expect(result.winningRuleId).toBe("clarify-dispute-missing-fields");
    // product_type ya está dado -> según ask_field_priority
    // [product_type, document_id], el siguiente pendiente es "document_id".
    expect(result.askField).toBe("document_id");
  });

  it("dispute_unrecognized_charge con product_type/document_id presentes pero sin ninguna pista de transacción -> CLARIFY / clarify-dispute-no-transaction-clue / askField=merchant", () => {
    const input: UnderstandOutput = {
      intent: "dispute_unrecognized_charge",
      language: "es",
      entities: {
        ...emptyEntities(),
        product_type: "credit_card",
        document_id: "12345678",
        disputed_amount: null,
        merchant: null,
        transaction_date: null,
      },
      missing_fields: [],
      context: baseContext(),
    };
    const result = evaluatePreAction(input, policy);
    expect(result.decision).toBe("CLARIFY");
    expect(result.winningRuleId).toBe("clarify-dispute-no-transaction-clue");
    expect(result.askField).toBe("merchant");
  });

  it("dispute_unrecognized_charge completo (mínimo + al menos una pista de transacción, monto bajo el umbral) -> AUTO / auto-dispute-complete", () => {
    const threshold = Number(policy.config.dispute_high_risk_amount_threshold);
    expect(threshold).toBeGreaterThan(0);
    const input: UnderstandOutput = {
      intent: "dispute_unrecognized_charge",
      language: "es",
      entities: {
        ...emptyEntities(),
        product_type: "credit_card",
        document_id: "12345678",
        disputed_amount: threshold - 1,
        merchant: "Netflix",
        transaction_date: null,
      },
      missing_fields: [],
      context: baseContext(),
    };
    const result = evaluatePreAction(input, policy);
    expect(result.decision).toBe("AUTO");
    expect(result.winningRuleId).toBe("auto-dispute-complete");
  });

  it("dispute_unrecognized_charge con disputed_amount sobre config.dispute_high_risk_amount_threshold -> ESCALATE (gana sobre AUTO)", () => {
    const threshold = Number(policy.config.dispute_high_risk_amount_threshold);
    const input: UnderstandOutput = {
      intent: "dispute_unrecognized_charge",
      language: "es",
      entities: {
        ...emptyEntities(),
        product_type: "credit_card",
        document_id: "12345678",
        disputed_amount: threshold + 1,
        merchant: "Comercio Sospechoso",
        transaction_date: null,
      },
      missing_fields: [],
      context: baseContext(),
    };
    const result = evaluatePreAction(input, policy);
    expect(result.decision).toBe("ESCALATE");
    // También matchea auto-dispute-complete (mínimo completo + pista de
    // transacción), pero ESCALATE gana por el modelo "más conservador
    // gana" ya usado en la regla equivalente de eligibility_check.
    expect(result.matchedRules.map((m) => m.id)).toContain("auto-dispute-complete");
    expect(result.matchedRules.map((m) => m.id)).toContain("escalate-dispute-amount-over-threshold");
    expect(result.winningRuleId).toBe("escalate-dispute-amount-over-threshold");
  });

  it("faq siempre AUTO", () => {
    const input: UnderstandOutput = {
      intent: "faq",
      language: "es",
      entities: emptyEntities(),
      missing_fields: [],
      context: baseContext(),
    };
    const result = evaluatePreAction(input, policy);
    expect(result.decision).toBe("AUTO");
  });

  it("fallback: intent no reconocido por ninguna regla -> ESCALATE, nunca AUTO", () => {
    const input = {
      intent: "some_future_intent_not_in_policies_yaml",
      language: "es",
      entities: emptyEntities(),
      missing_fields: [],
      context: baseContext(),
    } as unknown as UnderstandOutput;
    const result = evaluatePreAction(input, policy);
    expect(result.decision).toBe("ESCALATE");
    expect(result.winningRuleId).toBeNull();
  });

  it("post_action (contrato confirmado, EligibilityResult): score_zone=borderline -> ESCALATE", () => {
    const input: EligibilityResult = {
      caseId: "case-1",
      productType: "personal_loan",
      eligibility_score: 60,
      score_zone: "borderline",
    };
    const result = evaluatePostAction(input, policy);
    expect(result.decision).toBe("ESCALATE");
    expect(result.winningRuleId).toBe("escalate-score-borderline");
  });

  it("post_action (contrato confirmado): score numérico dentro de la zona límite configurada -> ESCALATE aunque score_zone diga approved", () => {
    const input: EligibilityResult = {
      caseId: "case-1",
      productType: "personal_loan",
      eligibility_score: 60,
      score_zone: "approved",
    };
    const result = evaluatePostAction(input, policy);
    expect(result.decision).toBe("ESCALATE");
  });

  it("post_action (contrato confirmado): score claramente aprobado -> AUTO", () => {
    const input: EligibilityResult = {
      caseId: "case-1",
      productType: "personal_loan",
      eligibility_score: 90,
      score_zone: "approved",
    };
    const result = evaluatePostAction(input, policy);
    expect(result.decision).toBe("AUTO");
    expect(result.winningRuleId).toBe("auto-score-approved");
  });
});
