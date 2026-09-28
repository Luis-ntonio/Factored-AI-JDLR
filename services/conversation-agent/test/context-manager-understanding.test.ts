import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { GetCommand } from "@aws-sdk/lib-dynamodb";
import type { BedrockRuntimeClient } from "@aws-sdk/client-bedrock-runtime";
import type { SSMClient } from "@aws-sdk/client-ssm";
import { ConversationStateStore } from "../src/context/state-store";
import { buildUnderstandOutput } from "../src/context/context-manager";
import { resetBedrockConfigCache } from "../src/understanding/ssm-config";

/**
 * Confirma que buildUnderstandOutput sigue produciendo exactamente el mismo
 * shape de UnderstandOutput de siempre ({intent, language, entities,
 * missing_fields, context}) tanto en el camino Bedrock como en el camino
 * heurístico — y que `confidence` (dato interno del pipeline Understand)
 * NUNCA se filtra al contrato público.
 */

const EXPECTED_TOP_LEVEL_KEYS = ["intent", "language", "entities", "missing_fields", "context"].sort();

function makeMockDocClient(sendImpl: (cmd: unknown) => Promise<unknown>) {
  return { send: vi.fn(sendImpl) } as unknown as DynamoDBDocumentClient;
}

function makeMockBedrockClient(sendImpl: (cmd: unknown) => Promise<unknown>) {
  return { send: vi.fn(sendImpl) } as unknown as BedrockRuntimeClient;
}

function makeMockSsmClient(paramValues: Record<string, string>) {
  return {
    send: vi.fn(async (cmd: { input?: { Name?: string } }) => {
      const name = cmd.input?.Name;
      const value = name ? paramValues[name] : undefined;
      if (!value) throw new Error(`param not found: ${name}`);
      return { Parameter: { Value: value } };
    }),
  } as unknown as SSMClient;
}

function toolUseResponse(input: Record<string, unknown>) {
  return {
    output: {
      message: {
        role: "assistant",
        content: [{ toolUse: { toolUseId: "tool-1", name: "record_understanding", input } }],
      },
    },
  };
}

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  resetBedrockConfigCache();
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  resetBedrockConfigCache();
});

describe("buildUnderstandOutput — shape del contrato es idéntico sin importar el backend", () => {
  it("camino heurístico (backend explícito): shape exacto, sin campo confidence", async () => {
    process.env.UNDERSTANDING_BACKEND = "heuristic";
    const docClient = makeMockDocClient(async (cmd) => (cmd instanceof GetCommand ? { Item: undefined } : {}));
    const store = new ConversationStateStore({ tableName: "t", docClient, maxRetries: 1, baseDelayMs: 1 });

    const output = await buildUnderstandOutput(
      { caseId: "case-h", customerId: null, messageId: "msg-h", message: "Gano 2500 y trabajo en una empresa", role: "anonimo" },
      store
    );

    expect(Object.keys(output).sort()).toEqual(EXPECTED_TOP_LEVEL_KEYS);
    expect((output as Record<string, unknown>).confidence).toBeUndefined();
    expect(output.entities.income).toBe(2500);
    expect(output.context.degraded).toBe(false);
  });

  it("camino Bedrock (confidence alta): shape exacto, sin campo confidence filtrado", async () => {
    process.env.UNDERSTANDING_BACKEND = "bedrock";
    process.env.BEDROCK_MODEL_ID_PARAM_NAME = "/model";
    const ssmClient = makeMockSsmClient({ "/model": "model-x" });

    const bedrockOutput = {
      intent: "eligibility_check",
      language: "es",
      entities: {
        income: 4000,
        employment_status: "employed",
        requested_amount: 8000,
        document_id: "87654321",
        document_type: "DNI",
        product_type: "personal_loan",
        existing_customer: true,
      },
      confidence: 0.9,
    };
    const bedrockClient = makeMockBedrockClient(async () => toolUseResponse(bedrockOutput));

    const docClient = makeMockDocClient(async (cmd) => (cmd instanceof GetCommand ? { Item: undefined } : {}));
    const store = new ConversationStateStore({ tableName: "t", docClient, maxRetries: 1, baseDelayMs: 1 });

    const output = await buildUnderstandOutput(
      { caseId: "case-b", customerId: "cust-1", messageId: "msg-b", message: "cualquier mensaje", role: "anonimo" },
      store,
      { ssmClient, bedrockClient }
    );

    expect(Object.keys(output).sort()).toEqual(EXPECTED_TOP_LEVEL_KEYS);
    expect((output as Record<string, unknown>).confidence).toBeUndefined();
    expect(output.intent).toBe("eligibility_check");
    expect(output.entities.income).toBe(4000);
    expect(output.entities.document_type).toBe("DNI");
    expect(output.missing_fields).toEqual([]);
    expect(output.context.degraded).toBe(false);
  });
});
