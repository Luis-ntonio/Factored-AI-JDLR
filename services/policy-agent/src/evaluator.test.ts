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
