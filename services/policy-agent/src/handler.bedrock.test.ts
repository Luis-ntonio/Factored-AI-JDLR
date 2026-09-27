import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as path from "node:path";
import type { UnderstandOutput } from "@banking-agent/shared";
import type { ConverseCommandOutput } from "@aws-sdk/client-bedrock-runtime";
import type { handler as HandlerType } from "./handler";

/**
 * Tests de integración del wiring `handler.ts` -> `./bedrock/config.ts` ->
 * `./bedrock/model-decider.ts` -> `./bedrock/guardrail.ts`, con
 * `@aws-sdk/client-ssm` y `@aws-sdk/client-bedrock-runtime` MOCKEADOS a
 * nivel de módulo (`vi.mock`) -- nunca pega a AWS real. Complementa (sin
 * modificar) `handler.test.ts`, que ejercita exclusivamente el camino sin
 * Bedrock configurado (mismo comportamiento de siempre).
 */

const { ssmSend, bedrockSend } = vi.hoisted(() => ({
  ssmSend: vi.fn(),
  bedrockSend: vi.fn(),
}));

vi.mock("@aws-sdk/client-ssm", () => ({
  SSMClient: vi.fn().mockImplementation(() => ({ send: ssmSend })),
  GetParameterCommand: vi.fn().mockImplementation((input: unknown) => ({ input })),
}));

vi.mock("@aws-sdk/client-bedrock-runtime", () => ({
  BedrockRuntimeClient: vi.fn().mockImplementation(() => ({ send: bedrockSend })),
  ConverseCommand: vi.fn().mockImplementation((input: unknown) => ({ input })),
}));

const REAL_POLICY_PATH = path.resolve(__dirname, "../../../policies.yaml");

const ORIGINAL_ENV = {
  POLICY_FILE_PATH: process.env.POLICY_FILE_PATH,
  BEDROCK_MODEL_ID_PARAM_NAME: process.env.BEDROCK_MODEL_ID_PARAM_NAME,
  BEDROCK_REGION_PARAM_NAME: process.env.BEDROCK_REGION_PARAM_NAME,
};

function restoreEnvVar(name: keyof typeof ORIGINAL_ENV): void {
  const original = ORIGINAL_ENV[name];
  if (original === undefined) delete process.env[name];
  else process.env[name] = original;
}

beforeEach(() => {
  ssmSend.mockReset();
  bedrockSend.mockReset();
});

afterEach(() => {
  restoreEnvVar("POLICY_FILE_PATH");
  restoreEnvVar("BEDROCK_MODEL_ID_PARAM_NAME");
  restoreEnvVar("BEDROCK_REGION_PARAM_NAME");
  vi.resetModules();
});

async function loadHandlerWithBedrockConfigured(): Promise<typeof HandlerType> {
  process.env.POLICY_FILE_PATH = REAL_POLICY_PATH;
  process.env.BEDROCK_MODEL_ID_PARAM_NAME = "/dev/bedrock/model_id";
  process.env.BEDROCK_REGION_PARAM_NAME = "/dev/bedrock/region";
  vi.resetModules();
  const mod = await import("./handler");
  return mod.handler;
}

function ssmRespondsWith(modelId: string, region: string): void {
  ssmSend.mockImplementation((command: { input: { Name: string } }) => {
    if (command.input.Name === "/dev/bedrock/model_id") {
      return Promise.resolve({ Parameter: { Value: modelId } });
    }
    if (command.input.Name === "/dev/bedrock/region") {
      return Promise.resolve({ Parameter: { Value: region } });
    }
    return Promise.resolve({ Parameter: undefined });
  });
}

function bedrockRespondsWithDecision(decision: string, confidence = 0.5, reasoning = "razón del modelo"): void {
  const response: ConverseCommandOutput = {
    output: {
      message: {
        role: "assistant",
        content: [
          {
            toolUse: {
              toolUseId: "tool-1",
              name: "propose_policy_decision",
              input: { decision, confidence, reasoning },
            },
          },
        ],
      },
    },
    stopReason: "tool_use",
  } as unknown as ConverseCommandOutput;
  bedrockSend.mockResolvedValue(response);
}

function baseContext(): UnderstandOutput["context"] {
  return {
    caseId: "case-bedrock-1",
    customerId: null,
    turnId: "turn-1",
    degraded: false,
    degradedReason: "none",
    historyTurns: 0,
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

describe("policy-agent handler con Bedrock configurado (SSM/Bedrock mockeados)", () => {
  it("el modelo propone ESCALATE, la regla real dice AUTO (faq) -> gana ESCALATE (el modelo es más conservador)", async () => {
    ssmRespondsWith("fake-model-id", "us-east-1");
    bedrockRespondsWithDecision("ESCALATE", 0.9, "Riesgo detectado por el modelo.");

    const handler = await loadHandlerWithBedrockConfigured();
    const input: UnderstandOutput = {
      intent: "faq",
      language: "es",
      entities: emptyEntities(),
      missing_fields: [],
      context: baseContext(),
    };

    const result = await handler(input);

    expect(result.decision).toBe("ESCALATE");
    expect((result as { decisionSource?: string }).decisionSource).toBe("model");
    expect((result as { modelOverrideReason?: string }).modelOverrideReason).toBe(
      "Riesgo detectado por el modelo."
    );
    // La regla que matcheó (auto-faq-always) se conserva para auditoría.
    expect(result.winningRuleId).toBe("auto-faq-always");
    expect(bedrockSend).toHaveBeenCalledTimes(1);
  });

  it("el modelo propone AUTO, la regla real dice ESCALATE (escalation_request) -> gana ESCALATE (la regla es igual o más conservadora)", async () => {
    ssmRespondsWith("fake-model-id", "us-east-1");
    bedrockRespondsWithDecision("AUTO");

    const handler = await loadHandlerWithBedrockConfigured();
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
    expect((result as { decisionSource?: string }).decisionSource).toBe("rules");
  });

  it("Bedrock configurado pero SSM falla tras reintentos -> resultado idéntico al de sin Bedrock (solo reglas)", async () => {
    ssmSend.mockRejectedValue(new Error("AccessDenied"));

    const handler = await loadHandlerWithBedrockConfigured();
    const input: UnderstandOutput = {
      intent: "faq",
      language: "es",
      entities: emptyEntities(),
      missing_fields: [],
      context: baseContext(),
    };

    const result = await handler(input);

    expect(result).toEqual({
      decision: "AUTO",
      matchedRules: [{ id: "auto-faq-always", decision: "AUTO" }],
      winningRuleId: "auto-faq-always",
      reason: expect.stringContaining("faq"),
    });
    expect(bedrockSend).not.toHaveBeenCalled();
  });

  it("Bedrock configurado pero devuelve una decision fuera del enum válido -> resultado idéntico al de solo reglas", async () => {
    ssmRespondsWith("fake-model-id", "us-east-1");
    bedrockRespondsWithDecision("MAYBE");

    const handler = await loadHandlerWithBedrockConfigured();
    const input: UnderstandOutput = {
      intent: "faq",
      language: "es",
      entities: emptyEntities(),
      missing_fields: [],
      context: baseContext(),
    };

    const result = await handler(input);

    expect(result).toEqual({
      decision: "AUTO",
      matchedRules: [{ id: "auto-faq-always", decision: "AUTO" }],
      winningRuleId: "auto-faq-always",
      reason: expect.stringContaining("faq"),
    });
  });
});
