import { describe, expect, it } from "vitest";
import type { PolicyDecisionResult } from "../types";
import type { ModelProposal } from "./model-decider";
import { applyModelGuardrail } from "./guardrail";

/**
 * Tests de `applyModelGuardrail` -- el guardrail "most-conservative-match-
 * wins" entre la propuesta del modelo (Bedrock) y el resultado del
 * evaluador determinístico (`evaluatePreAction`/`evaluatePostAction`, acá
 * simulado con un `PolicyDecisionResult` fijo, sin depender de
 * `policies.yaml` real). Cubre EXPLÍCITAMENTE ambas direcciones de "más
 * conservador gana": cuando ganan las reglas y cuando gana el modelo.
 */

function ruleResult(overrides: Partial<PolicyDecisionResult> = {}): PolicyDecisionResult {
  return {
    decision: "AUTO",
    matchedRules: [{ id: "auto-some-rule", decision: "AUTO" }],
    winningRuleId: "auto-some-rule",
    reason: "Texto estático de policies.yaml.",
    ...overrides,
  };
}

function modelProposal(overrides: Partial<ModelProposal> = {}): ModelProposal {
  return {
    decision: "AUTO",
    confidence: 0.8,
    reasoning: "Razonamiento del modelo.",
    ...overrides,
  };
}

describe("applyModelGuardrail", () => {
  it("modelProposal null -> devuelve ruleResult TAL CUAL, sin ningún campo agregado (idéntico a hoy)", () => {
    const rule = ruleResult({ decision: "ESCALATE", winningRuleId: "escalate-x" });

    const result = applyModelGuardrail(rule, null);

    expect(result).toBe(rule);
    expect(result).toEqual(rule);
    expect(result).not.toHaveProperty("modelProposal");
    expect(result).not.toHaveProperty("modelOverrideReason");
    expect(result).not.toHaveProperty("decisionSource");
  });

  it("modelo propone AUTO pero la regla dice ESCALATE -> gana ESCALATE (regla más conservadora)", () => {
    const rule = ruleResult({ decision: "ESCALATE", winningRuleId: "escalate-eligibility-unemployed" });
    const model = modelProposal({ decision: "AUTO" });

    const result = applyModelGuardrail(rule, model);

    expect(result.decision).toBe("ESCALATE");
    expect(result.winningRuleId).toBe("escalate-eligibility-unemployed");
    expect(result.reason).toBe(rule.reason);
    expect(result.decisionSource).toBe("rules");
    expect(result.modelProposal).toEqual(model);
    expect(result.modelOverrideReason).toBeUndefined();
  });

  it("modelo propone ESCALATE pero la regla dice AUTO -> gana ESCALATE (el modelo es más conservador)", () => {
    const rule = ruleResult({ decision: "AUTO", winningRuleId: "auto-eligibility-complete" });
    const model = modelProposal({ decision: "ESCALATE", reasoning: "Riesgo no cubierto por ninguna regla explícita." });

    const result = applyModelGuardrail(rule, model);

    expect(result.decision).toBe("ESCALATE");
    // matchedRules/winningRuleId se conservan del evaluador para auditoría,
    // aunque la regla ganadora original no haya sido la decisión final.
    expect(result.winningRuleId).toBe("auto-eligibility-complete");
    expect(result.matchedRules).toEqual(rule.matchedRules);
    // reason NO se sobreescribe (sigue siendo el texto estático de la regla).
    expect(result.reason).toBe(rule.reason);
    expect(result.modelOverrideReason).toBe("Riesgo no cubierto por ninguna regla explícita.");
    expect(result.decisionSource).toBe("model");
    expect(result.modelProposal).toEqual(model);
  });

  it("modelo propone CLARIFY, la regla dice AUTO -> gana CLARIFY (el modelo es más conservador)", () => {
    const rule = ruleResult({ decision: "AUTO", winningRuleId: "auto-product-info-complete" });
    const model = modelProposal({ decision: "CLARIFY", reasoning: "Conviene confirmar antes de continuar." });

    const result = applyModelGuardrail(rule, model);

    expect(result.decision).toBe("CLARIFY");
    expect(result.decisionSource).toBe("model");
    expect(result.modelOverrideReason).toBe("Conviene confirmar antes de continuar.");
    expect(result.winningRuleId).toBe("auto-product-info-complete");
  });

  it("empate de severidad (misma decision) -> gana la regla, sin decisionSource 'model'", () => {
    const rule = ruleResult({ decision: "CLARIFY", winningRuleId: "clarify-x", askField: "income" });
    const model = modelProposal({ decision: "CLARIFY" });

    const result = applyModelGuardrail(rule, model);

    expect(result.decision).toBe("CLARIFY");
    expect(result.decisionSource).toBe("rules");
    expect(result.askField).toBe("income");
    expect(result.modelOverrideReason).toBeUndefined();
  });

  it("el modelo gana con ESCALATE sobre una regla CLARIFY con askField -> el askField heredado se descarta (ya no aplica)", () => {
    const rule = ruleResult({ decision: "CLARIFY", winningRuleId: "clarify-eligibility-missing-fields", askField: "income" });
    const model = modelProposal({ decision: "ESCALATE" });

    const result = applyModelGuardrail(rule, model);

    expect(result.decision).toBe("ESCALATE");
    expect(result.askField).toBeUndefined();
  });

  it("el modelo gana con CLARIFY sobre una regla AUTO -> no inventa un askField propio (el modelo no lo propone)", () => {
    const rule = ruleResult({ decision: "AUTO" });
    const model = modelProposal({ decision: "CLARIFY" });

    const result = applyModelGuardrail(rule, model);

    expect(result.decision).toBe("CLARIFY");
    expect(result.askField).toBeUndefined();
  });
});
