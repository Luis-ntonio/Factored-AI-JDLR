import { describe, expect, it, vi } from "vitest";
import { generateNextUserMessage } from "../../src/simulation/user-simulator";
import { SIMULATION_PROFILES } from "../../src/simulation/profiles";
import { SIMULATION_OBJECTIVES } from "../../src/simulation/objectives";

const profile = SIMULATION_PROFILES.find((p) => p.id === "maría-premium-es") ?? SIMULATION_PROFILES[0];
const objective = SIMULATION_OBJECTIVES[0];

function toolUseResponse(input: Record<string, unknown>) {
  return {
    output: { message: { content: [{ toolUse: { name: "produce_next_user_message", input } }] } },
  };
}

describe("generateNextUserMessage", () => {
  it("extrae nextMessage/selectedTransactionId/isDone de la respuesta de Bedrock", async () => {
    const send = vi.fn().mockResolvedValue(
      toolUseResponse({
        next_message: "Fue el cargo de Netflix.",
        selected_transaction_id: "TXN-123",
        is_done: false,
      })
    );

    const result = await generateNextUserMessage(profile, objective, [], null, {
      bedrockClient: { send },
      modelId: "model-x",
    });

    expect(result).toEqual({ nextMessage: "Fue el cargo de Netflix.", selectedTransactionId: "TXN-123", isDone: false });
  });

  it("sin selected_transaction_id -> selectedTransactionId undefined", async () => {
    const send = vi.fn().mockResolvedValue(toolUseResponse({ next_message: "Gracias, listo.", is_done: true }));

    const result = await generateNextUserMessage(profile, objective, [], null, {
      bedrockClient: { send },
      modelId: "model-x",
    });

    expect(result).toEqual({ nextMessage: "Gracias, listo.", selectedTransactionId: undefined, isDone: true });
  });

  it("respuesta sin tool use -> null, nunca lanza", async () => {
    const send = vi.fn().mockResolvedValue({ output: { message: { content: [{ text: "no tool use" }] } } });

    const result = await generateNextUserMessage(profile, objective, [], null, {
      bedrockClient: { send },
      modelId: "model-x",
    });

    expect(result).toBeNull();
  });

  it("Bedrock no disponible tras reintentos -> null", async () => {
    const send = vi.fn().mockRejectedValue(new Error("ThrottlingException"));

    const result = await generateNextUserMessage(profile, objective, [], null, {
      bedrockClient: { send },
      modelId: "model-x",
      maxRetries: 0,
      baseDelayMs: 1,
    });

    expect(result).toBeNull();
  });
});
