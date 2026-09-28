import { describe, expect, it, vi } from "vitest";
import type { BedrockRuntimeClient } from "@aws-sdk/client-bedrock-runtime";
import { understandWithBedrock } from "../src/understanding/bedrock-understander";
import type { BedrockConfig } from "../src/understanding/ssm-config";

function makeMockClient(sendImpl: (cmd: unknown) => Promise<unknown>) {
  return { send: vi.fn(sendImpl) } as unknown as BedrockRuntimeClient;
}

function toolUseResponse(input: Record<string, unknown>) {
  return {
    output: {
      message: {
        role: "assistant",
        content: [
          {
            toolUse: {
              toolUseId: "tool-1",
              name: "record_understanding",
              input,
            },
          },
        ],
      },
    },
  };
}

const config: BedrockConfig = { modelId: "test-model", region: "us-east-1" };

describe("understandWithBedrock", () => {
  it("camino feliz: devuelve el tool call validado tal cual cuando todos los campos respetan el enum", async () => {
    const validInput = {
      intent: "eligibility_check",
      language: "es",
      entities: {
        income: 2500,
        employment_status: "employed",
        requested_amount: 10000,
        document_id: "12345678",
        document_type: "DNI",
        product_type: "personal_loan",
        existing_customer: false,
      },
      confidence: 0.9,
    };
    const client = makeMockClient(async () => toolUseResponse(validInput));

    const result = await understandWithBedrock("Gano 2500 y necesito 10000 para un préstamo", config, { client });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.intent).toBe("eligibility_check");
      expect(result.value.language).toBe("es");
      expect(result.value.entities.income).toBe(2500);
      expect(result.value.entities.document_type).toBe("DNI");
      expect(result.value.confidence).toBe(0.9);
    }
  });

  it("coerciona un intent fuera de enum a 'unknown' y baja confidence a 0, nunca propaga el valor crudo", async () => {
    const invalidInput = {
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
      confidence: 0.95,
    };
    const client = makeMockClient(async () => toolUseResponse(invalidInput));

    const result = await understandWithBedrock("mensaje cualquiera", config, { client });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.intent).toBe("unknown");
      expect(result.value.confidence).toBe(0);
    }
  });

  it("coerciona un employment_status inventado a null y baja confidence a 0", async () => {
    const invalidInput = {
      intent: "eligibility_check",
      language: "pt",
      entities: {
        income: 3000,
        employment_status: "space_pirate",
        requested_amount: null,
        document_id: null,
        document_type: null,
        product_type: null,
        existing_customer: null,
      },
      confidence: 0.8,
    };
    const client = makeMockClient(async () => toolUseResponse(invalidInput));

    const result = await understandWithBedrock("mensaje cualquiera", config, { client });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.entities.employment_status).toBeNull();
      // No debe propagarse ningún string no tipado.
      expect(result.value.entities.employment_status).not.toBe("space_pirate");
      expect(result.value.confidence).toBe(0);
      // El resto de campos válidos igual se preserva.
      expect(result.value.entities.income).toBe(3000);
    }
  });

  it("agota los reintentos ante fallo persistente y devuelve ok:false sin lanzar", async () => {
    let calls = 0;
    const client = makeMockClient(async () => {
      calls += 1;
      throw new Error("throttled");
    });

    const result = await understandWithBedrock("mensaje cualquiera", config, {
      client,
      maxRetries: 2,
      baseDelayMs: 1,
    });

    expect(result.ok).toBe(false);
    expect(calls).toBe(3); // 1 intento inicial + 2 reintentos
  });

  it("devuelve ok:false si la respuesta no contiene un tool call (sin lanzar)", async () => {
    const client = makeMockClient(async () => ({ output: { message: { role: "assistant", content: [{ text: "no tool" }] } } }));

    const result = await understandWithBedrock("mensaje cualquiera", config, { client });

    expect(result.ok).toBe(false);
  });

  it("camino feliz: acepta dispute_unrecognized_charge y los 4 entities nuevos de disputa", async () => {
    const validInput = {
      intent: "dispute_unrecognized_charge",
      language: "es",
      entities: {
        income: null,
        employment_status: null,
        requested_amount: null,
        document_id: "12345678",
        document_type: "DNI",
        product_type: "credit_card",
        existing_customer: null,
        disputed_amount: 150,
        merchant: "Amazon",
        transaction_date: "ayer",
        dispute_reason: "unrecognized_charge",
      },
      confidence: 0.85,
    };
    const client = makeMockClient(async () => toolUseResponse(validInput));

    const result = await understandWithBedrock("No reconozco un cargo de 150 en Amazon, fue ayer", config, { client });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.intent).toBe("dispute_unrecognized_charge");
      expect(result.value.entities.disputed_amount).toBe(150);
      expect(result.value.entities.merchant).toBe("Amazon");
      expect(result.value.entities.transaction_date).toBe("ayer");
      expect(result.value.entities.dispute_reason).toBe("unrecognized_charge");
      expect(result.value.confidence).toBe(0.85);
    }
  });

  it("coerciona un dispute_reason fuera de enum a null y baja confidence a 0 (nunca propaga 'other' inventado por el modelo)", async () => {
    const invalidInput = {
      intent: "dispute_unrecognized_charge",
      language: "es",
      entities: {
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
        dispute_reason: "not_a_real_reason",
      },
      confidence: 0.7,
    };
    const client = makeMockClient(async () => toolUseResponse(invalidInput));

    const result = await understandWithBedrock("mensaje cualquiera", config, { client });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.entities.dispute_reason).toBeNull();
      expect(result.value.confidence).toBe(0);
    }
  });

  it("acepta explícitamente dispute_reason 'other' cuando el modelo lo devuelve (categoría de reserva, válida en el enum)", async () => {
    const validInput = {
      intent: "dispute_unrecognized_charge",
      language: "pt",
      entities: {
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
        dispute_reason: "other",
      },
      confidence: 0.6,
    };
    const client = makeMockClient(async () => toolUseResponse(validInput));

    const result = await understandWithBedrock("mensaje cualquiera", config, { client });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.entities.dispute_reason).toBe("other");
      expect(result.value.confidence).toBe(0.6);
    }
  });

  it("coerciona disputed_amount no numérico a null y baja confidence a 0", async () => {
    const invalidInput = {
      intent: "dispute_unrecognized_charge",
      language: "es",
      entities: {
        income: null,
        employment_status: null,
        requested_amount: null,
        document_id: null,
        document_type: null,
        product_type: null,
        existing_customer: null,
        disputed_amount: "ciento cincuenta",
        merchant: null,
        transaction_date: null,
        dispute_reason: null,
      },
      confidence: 0.7,
    };
    const client = makeMockClient(async () => toolUseResponse(invalidInput));

    const result = await understandWithBedrock("mensaje cualquiera", config, { client });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.entities.disputed_amount).toBeNull();
      expect(result.value.confidence).toBe(0);
    }
  });
});
