import { describe, expect, it, vi } from "vitest";
import type { ConverseCommandOutput } from "@aws-sdk/client-bedrock-runtime";
import type { UnderstandOutput } from "@banking-agent/shared";
import { proposeModelDecision } from "./model-decider";

/**
 * Tests de `proposeModelDecision` con un `bedrockClient` INYECTADO (fake,
 * `{ send: vi.fn() }`) -- nunca se construye un `BedrockRuntimeClient` real
 * ni se pega a AWS real. `baseDelayMs` se pasa en 1ms en los tests de
 * reintentos para no ralentizar la suite (el backoff exponencial real de
 * producción sigue siendo el default de 75ms, ver `./model-decider.ts`).
 */

function baseContext(): UnderstandOutput["context"] {
  return {
    caseId: "case-1",
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
    disputed_amount: null,
    merchant: null,
    transaction_date: null,
    dispute_reason: null,
  };
}

function sampleUnderstandOutput(): UnderstandOutput {
  return {
    intent: "faq",
    language: "es",
    entities: emptyEntities(),
    missing_fields: [],
    context: baseContext(),
  };
}

function toolUseResponse(input: Record<string, unknown>): ConverseCommandOutput {
  return {
    output: {
      message: {
        role: "assistant",
        content: [
          {
            toolUse: {
              toolUseId: "tool-1",
              name: "propose_policy_decision",
              input,
            },
          },
        ],
      },
    },
    stopReason: "tool_use",
  } as unknown as ConverseCommandOutput;
}

describe("proposeModelDecision", () => {
  it("devuelve la propuesta del modelo cuando Bedrock responde con un tool use válido", async () => {
    const send = vi.fn().mockResolvedValue(
      toolUseResponse({ decision: "CLARIFY", confidence: 0.7, reasoning: "Falta un dato clave." })
    );

    const result = await proposeModelDecision(sampleUnderstandOutput(), "pre_action", {
      bedrockClient: { send },
      modelId: "fake-model",
    });

    expect(result).toEqual({ decision: "CLARIFY", confidence: 0.7, reasoning: "Falta un dato clave." });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("trata una decision fuera del enum válido como NO DISPONIBLE (null), sin coaccionar a un default", async () => {
    const send = vi.fn().mockResolvedValue(
      toolUseResponse({ decision: "MAYBE", confidence: 0.9, reasoning: "no debería pasar" })
    );

    const result = await proposeModelDecision(sampleUnderstandOutput(), "pre_action", {
      bedrockClient: { send },
      modelId: "fake-model",
    });

    expect(result).toBeNull();
  });

  it("devuelve null (nunca lanza) cuando Bedrock falla tras agotar los 2 reintentos por defecto", async () => {
    const send = vi.fn().mockRejectedValue(new Error("ThrottlingException"));

    const result = await proposeModelDecision(sampleUnderstandOutput(), "pre_action", {
      bedrockClient: { send },
      modelId: "fake-model",
      baseDelayMs: 1,
    });

    expect(result).toBeNull();
    // 1 intento inicial + 2 reintentos = 3 llamadas.
    expect(send).toHaveBeenCalledTimes(3);
  });

  it("se recupera si un intento falla pero un reintento posterior tiene éxito", async () => {
    const send = vi
      .fn()
      .mockRejectedValueOnce(new Error("transient"))
      .mockResolvedValueOnce(toolUseResponse({ decision: "AUTO", confidence: 0.4, reasoning: "ok" }));

    const result = await proposeModelDecision(sampleUnderstandOutput(), "pre_action", {
      bedrockClient: { send },
      modelId: "fake-model",
      baseDelayMs: 1,
    });

    expect(result).toEqual({ decision: "AUTO", confidence: 0.4, reasoning: "ok" });
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("devuelve null cuando la respuesta no trae ningún toolUse", async () => {
    const send = vi.fn().mockResolvedValue({
      output: { message: { role: "assistant", content: [{ text: "respuesta en texto libre" }] } },
      stopReason: "end_turn",
    } as unknown as ConverseCommandOutput);

    const result = await proposeModelDecision(sampleUnderstandOutput(), "post_action", {
      bedrockClient: { send },
      modelId: "fake-model",
    });

    expect(result).toBeNull();
  });

  it("clampea confidence fuera de [0,1] y usa string vacío si falta reasoning", async () => {
    const send = vi.fn().mockResolvedValue(toolUseResponse({ decision: "ESCALATE", confidence: 5 }));

    const result = await proposeModelDecision(sampleUnderstandOutput(), "pre_action", {
      bedrockClient: { send },
      modelId: "fake-model",
    });

    expect(result).toEqual({ decision: "ESCALATE", confidence: 1, reasoning: "" });
  });

  /** Regresión: el prompt de sistema de `post_action` describía ÚNICAMENTE
   * la forma de `EligibilityResult` -- un `DisputeVerificationResult` real
   * (campos `transactionFound`/`fraudSuspected`/`productBlocked`, sin
   * `productType`/`eligibility_score`/`score_zone`) le llegaba al modelo con
   * un prompt que no coincidía con lo que veía, empujándolo a ESCALATE por
   * la regla de desempate ante ambigüedad. Ver `buildSystemPrompt`. */
  it("el prompt de post_action describe también la forma de DisputeVerificationResult (no solo EligibilityResult)", async () => {
    const send = vi.fn().mockResolvedValue(toolUseResponse({ decision: "AUTO", confidence: 0.9, reasoning: "ok" }));

    const disputeResult = {
      caseId: "case-1",
      transactionFound: true,
      transactionId: "TXN-000001",
      fraudSuspected: false,
      productBlocked: true,
    };

    await proposeModelDecision(disputeResult, "post_action", {
      bedrockClient: { send },
      modelId: "fake-model",
    });

    const sentCommand = send.mock.calls[0][0] as { input: { system?: Array<{ text?: string }> } };
    const systemText = sentCommand.input.system?.[0]?.text ?? "";
    expect(systemText).toContain("DisputeVerificationResult");
    expect(systemText).toContain("transactionFound");
    expect(systemText).toContain("fraudSuspected");
  });

  /** Regresión: el prompt de sistema de `pre_action` listaba los intents
   * válidos sin `dispute_unrecognized_charge` y no describía las entidades
   * de disputa -- el modelo no tenía forma de reconocer ese intent/esas
   * entidades como un caso conocido y de bajo riesgo. */
  it("el prompt de pre_action reconoce el intent dispute_unrecognized_charge y sus entidades", async () => {
    const send = vi.fn().mockResolvedValue(toolUseResponse({ decision: "AUTO", confidence: 0.9, reasoning: "ok" }));

    await proposeModelDecision(sampleUnderstandOutput(), "pre_action", {
      bedrockClient: { send },
      modelId: "fake-model",
    });

    const sentCommand = send.mock.calls[0][0] as { input: { system?: Array<{ text?: string }> } };
    const systemText = sentCommand.input.system?.[0]?.text ?? "";
    expect(systemText).toContain("dispute_unrecognized_charge");
    expect(systemText).toContain("disputed_amount");
    expect(systemText).toContain("merchant");
  });
});
