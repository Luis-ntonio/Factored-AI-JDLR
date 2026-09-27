import { afterEach, describe, expect, it, vi } from "vitest";
import * as path from "node:path";
import type { UnderstandOutput } from "@banking-agent/shared";
import type { handler as HandlerType, PostActionEvent } from "./handler";

/**
 * Tests del handler de Lambda de policy-agent, invocado por la Step Function
 * en dos pasos distintos: "Decide" (pre_action, `UnderstandOutput` crudo,
 * sin campo `stage`) y "PostActionDecide" (post_action, `EligibilityResult`
 * con `stage: "post_action"` agregado a nivel raíz). Reusa los mismos
 * fixtures y las mismas reglas reales de `policies.yaml` que ya ejercita
 * `evaluator.test.ts` -- no se inventan reglas nuevas.
 *
 * Cada test importa el módulo `./handler` de forma DINÁMICA después de
 * `vi.resetModules()` y de fijar `POLICY_FILE_PATH`, porque el handler
 * cachea el `PolicyFile` cargado en un closure a nivel de módulo (mismo
 * patrón `cachedX` que conversation-agent/retrieval-agent/transaction-agent)
 * -- sin resetear el módulo entre tests, el primer `POLICY_FILE_PATH` que
 * se cargara exitosamente quedaría cacheado para siempre y el test de
 * fallback (archivo inexistente) no podría ejercitar el catch real.
 */

const REAL_POLICY_PATH = path.resolve(__dirname, "../../../policies.yaml");
const NONEXISTENT_POLICY_PATH = path.resolve(__dirname, "./__policies-that-do-not-exist__.yaml");

const ORIGINAL_POLICY_FILE_PATH = process.env.POLICY_FILE_PATH;

afterEach(() => {
  if (ORIGINAL_POLICY_FILE_PATH === undefined) {
    delete process.env.POLICY_FILE_PATH;
  } else {
    process.env.POLICY_FILE_PATH = ORIGINAL_POLICY_FILE_PATH;
  }
  vi.resetModules();
});

async function loadHandler(policyFilePath: string): Promise<typeof HandlerType> {
  process.env.POLICY_FILE_PATH = policyFilePath;
  vi.resetModules();
  const mod = await import("./handler");
  return mod.handler;
}

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

describe("policy-agent handler (Lambda Task de la Step Function, JSON plano)", () => {
  it("AUTO real contra policies.yaml real — eligibility_check completo, sin excepciones", async () => {
    const handler = await loadHandler(REAL_POLICY_PATH);
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

    const result = await handler(input);

    expect(result.decision).toBe("AUTO");
    expect(result.winningRuleId).toBe("auto-eligibility-complete");
  });

  it("CLARIFY real — eligibility_check con missing_fields, askField poblado desde ask_field_priority", async () => {
    const handler = await loadHandler(REAL_POLICY_PATH);
    const input: UnderstandOutput = {
      intent: "eligibility_check",
      language: "es",
      entities: { ...emptyEntities(), product_type: "credit_card" },
      missing_fields: ["income", "employment_status", "requested_amount", "document_id", "existing_customer"],
      context: baseContext(),
    };

    const result = await handler(input);

    expect(result.decision).toBe("CLARIFY");
    expect(result.winningRuleId).toBe("clarify-eligibility-missing-fields");
    // product_type ya está dado -> el siguiente pendiente en ask_field_priority es "income".
    expect(result.askField).toBe("income");
  });

  it("ESCALATE real — escalation_request siempre gana", async () => {
    const handler = await loadHandler(REAL_POLICY_PATH);
    const input: UnderstandOutput = {
      intent: "escalation_request",
      language: "es",
      entities: emptyEntities(),
      missing_fields: [],
      context: baseContext(),
    };

    const result = await handler(input);

    expect(result.decision).toBe("ESCALATE");
    expect(result.winningRuleId).toBe("escalate-explicit-request");
  });

  it("ESCALATE real — stage post_action, score_zone borderline (Task PostActionDecide de la Step Function)", async () => {
    const handler = await loadHandler(REAL_POLICY_PATH);
    // Umbrales reales de policies.yaml: borderline_score_min: 55,
    // borderline_score_max: 70 -- 60 cae dentro del rango inclusive.
    const input: PostActionEvent = {
      stage: "post_action",
      caseId: "case-2",
      productType: "credit_card",
      eligibility_score: 60,
      score_zone: "borderline",
    };

    const result = await handler(input);

    expect(result.decision).toBe("ESCALATE");
    expect(result.winningRuleId).toBe("escalate-score-borderline");
  });

  it("AUTO real — stage post_action, score_zone approved (Task PostActionDecide de la Step Function)", async () => {
    const handler = await loadHandler(REAL_POLICY_PATH);
    const input: PostActionEvent = {
      stage: "post_action",
      caseId: "case-3",
      productType: "credit_card",
      eligibility_score: 85,
      score_zone: "approved",
    };

    const result = await handler(input);

    expect(result.decision).toBe("AUTO");
    expect(result.winningRuleId).toBe("auto-score-approved");
  });

  it("fallback interno — POLICY_FILE_PATH apunta a un archivo inexistente -> ESCALATE conservador, nunca lanza", async () => {
    const handler = await loadHandler(NONEXISTENT_POLICY_PATH);
    const input: UnderstandOutput = {
      intent: "faq",
      language: "es",
      entities: emptyEntities(),
      missing_fields: [],
      context: baseContext(),
    };

    const result = await handler(input);

    expect(result).toEqual({
      decision: "ESCALATE",
      matchedRules: [],
      winningRuleId: null,
      reason:
        "policy-agent no pudo evaluar policies.yaml (fallo interno) — escalado conservador por defecto.",
    });
  });
});
