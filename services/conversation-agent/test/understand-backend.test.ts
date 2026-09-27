import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BedrockRuntimeClient } from "@aws-sdk/client-bedrock-runtime";
import type { SSMClient } from "@aws-sdk/client-ssm";
import { resolveUnderstanding, UNDERSTANDING_CONFIDENCE_THRESHOLD } from "../src/understanding/understand-backend";
import { resetBedrockConfigCache } from "../src/understanding/ssm-config";

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
  vi.restoreAllMocks();
});

describe("resolveUnderstanding", () => {
  it("backend 'heuristic' explícito: nunca intenta llamar a Bedrock ni a SSM", async () => {
    process.env.UNDERSTANDING_BACKEND = "heuristic";
    process.env.BEDROCK_MODEL_ID_PARAM_NAME = "/some/param"; // presente mas no debe usarse
    const ssmClient = makeMockSsmClient({ "/some/param": "model-x" });
    const bedrockClient = makeMockBedrockClient(async () => {
      throw new Error("nunca debería llamarse");
    });

    const result = await resolveUnderstanding(
      { message: "Quiero saber si califico para un préstamo personal" },
      { ssmClient, bedrockClient }
    );

    expect(bedrockClient.send).not.toHaveBeenCalled();
    expect(ssmClient.send).not.toHaveBeenCalled();
    expect(result.intent).toBe("eligibility_check");
    expect(result.language).toBe("es");
  });

  it("camino feliz: confidence alta (>= threshold) usa el resultado de Bedrock, no cae a heurística", async () => {
    process.env.UNDERSTANDING_BACKEND = "bedrock";
    process.env.BEDROCK_MODEL_ID_PARAM_NAME = "/model";
    process.env.BEDROCK_REGION_PARAM_NAME = "/region";
    const ssmClient = makeMockSsmClient({ "/model": "model-x", "/region": "us-east-1" });

    const bedrockOutput = {
      intent: "product_info",
      language: "pt",
      entities: {
        income: null,
        employment_status: null,
        requested_amount: null,
        document_id: null,
        document_type: null,
        product_type: "credit_card",
        existing_customer: null,
      },
      confidence: 0.95,
    };
    const bedrockClient = makeMockBedrockClient(async () => toolUseResponse(bedrockOutput));

    // El mensaje heurísticamente clasificaría distinto (es/faq) para poder
    // distinguir en el assert que efectivamente se usó Bedrock y no heurística.
    const result = await resolveUnderstanding(
      { message: "mensaje ambiguo sin señales claras para la heurística" },
      { ssmClient, bedrockClient }
    );

    expect(result.intent).toBe("product_info");
    expect(result.language).toBe("pt");
    expect(result.entities.product_type).toBe("credit_card");
  });

  it("fallback por confianza baja (< threshold): usa heurística aunque Bedrock 'respondió' ok", async () => {
    process.env.UNDERSTANDING_BACKEND = "bedrock";
    process.env.BEDROCK_MODEL_ID_PARAM_NAME = "/model";
    const ssmClient = makeMockSsmClient({ "/model": "model-x" });

    const bedrockOutput = {
      intent: "escalation_request",
      language: "pt",
      entities: {
        income: null,
        employment_status: null,
        requested_amount: null,
        document_id: null,
        document_type: null,
        product_type: null,
        existing_customer: null,
      },
      confidence: UNDERSTANDING_CONFIDENCE_THRESHOLD - 0.1,
    };
    const bedrockClient = makeMockBedrockClient(async () => toolUseResponse(bedrockOutput));

    const message = "¿Cuáles son los requisitos del préstamo personal?"; // heurística -> product_info, es
    const result = await resolveUnderstanding({ message }, { ssmClient, bedrockClient });

    expect(result.intent).toBe("product_info");
    expect(result.language).toBe("es");
  });

  it("fallback por error de Bedrock (throttle tras agotar reintentos): usa heurística, nunca lanza", async () => {
    process.env.UNDERSTANDING_BACKEND = "bedrock";
    process.env.BEDROCK_MODEL_ID_PARAM_NAME = "/model";
    const ssmClient = makeMockSsmClient({ "/model": "model-x" });
    const bedrockClient = makeMockBedrockClient(async () => {
      throw new Error("throttled");
    });

    const message = "¿Cuál es el horario de atención al cliente?"; // heurística -> faq, es
    const result = await resolveUnderstanding({ message }, { ssmClient, bedrockClient });

    expect(result.intent).toBe("faq");
    expect(result.language).toBe("es");
  });

  it("fallback cuando SSM no tiene BEDROCK_MODEL_ID_PARAM_NAME configurada (local/test sin devops): usa heurística sin lanzar", async () => {
    process.env.UNDERSTANDING_BACKEND = "bedrock";
    delete process.env.BEDROCK_MODEL_ID_PARAM_NAME;

    const message = "Hola, quiero hablar con un asesor humano";
    const result = await resolveUnderstanding({ message });

    expect(result.intent).toBe("escalation_request");
    expect(result.language).toBe("es");
  });

  it("un intent inválido devuelto por Bedrock fuerza confidence 0 y por lo tanto fallback completo a heurística", async () => {
    process.env.UNDERSTANDING_BACKEND = "bedrock";
    process.env.BEDROCK_MODEL_ID_PARAM_NAME = "/model";
    const ssmClient = makeMockSsmClient({ "/model": "model-x" });

    const bedrockOutput = {
      intent: "hacked_value",
      language: "es",
      entities: {
        income: null,
        employment_status: null,
        requested_amount: null,
        document_id: null,
        document_type: null,
        product_type: null,
        existing_customer: null,
      },
      confidence: 0.99,
    };
    const bedrockClient = makeMockBedrockClient(async () => toolUseResponse(bedrockOutput));

    const message = "Quiero saber si califico para una tarjeta de crédito"; // heurística -> eligibility_check
    const result = await resolveUnderstanding({ message }, { ssmClient, bedrockClient });

    expect(result.intent).toBe("eligibility_check");
    expect(result.intent).not.toBe("hacked_value");
  });
});
