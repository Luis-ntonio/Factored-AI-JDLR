import { afterEach, describe, expect, it, vi } from "vitest";
import { getBedrockDeciderConfig, resetBedrockDeciderConfigCacheForTests } from "./config";

/**
 * Tests de `getBedrockDeciderConfig` -- nunca pega a AWS real: cuando las
 * env vars están ausentes, ni siquiera se construye un `SSMClient` (se
 * corta antes); cuando están presentes, se inyecta un `ssmClient` fake
 * (`{ send: vi.fn() }`).
 */

const ORIGINAL_MODEL_PARAM = process.env.BEDROCK_MODEL_ID_PARAM_NAME;
const ORIGINAL_REGION_PARAM = process.env.BEDROCK_REGION_PARAM_NAME;

afterEach(() => {
  if (ORIGINAL_MODEL_PARAM === undefined) delete process.env.BEDROCK_MODEL_ID_PARAM_NAME;
  else process.env.BEDROCK_MODEL_ID_PARAM_NAME = ORIGINAL_MODEL_PARAM;

  if (ORIGINAL_REGION_PARAM === undefined) delete process.env.BEDROCK_REGION_PARAM_NAME;
  else process.env.BEDROCK_REGION_PARAM_NAME = ORIGINAL_REGION_PARAM;

  resetBedrockDeciderConfigCacheForTests();
});

describe("getBedrockDeciderConfig", () => {
  it("devuelve null sin llamar a SSM cuando las env vars no están seteadas", async () => {
    delete process.env.BEDROCK_MODEL_ID_PARAM_NAME;
    delete process.env.BEDROCK_REGION_PARAM_NAME;

    const send = vi.fn();
    const result = await getBedrockDeciderConfig({ ssmClient: { send } });

    expect(result).toBeNull();
    expect(send).not.toHaveBeenCalled();
  });

  it("resuelve modelId/bedrockClient cuando SSM devuelve ambos parámetros", async () => {
    process.env.BEDROCK_MODEL_ID_PARAM_NAME = "/dev/bedrock/model_id";
    process.env.BEDROCK_REGION_PARAM_NAME = "/dev/bedrock/region";

    const send = vi.fn().mockImplementation((command: { input: { Name: string } }) => {
      if (command.input.Name === "/dev/bedrock/model_id") {
        return Promise.resolve({ Parameter: { Value: "us.anthropic.claude-sonnet-4-6" } });
      }
      return Promise.resolve({ Parameter: { Value: "us-east-1" } });
    });

    const result = await getBedrockDeciderConfig({ ssmClient: { send } });

    expect(result).not.toBeNull();
    expect(result?.modelId).toBe("us.anthropic.claude-sonnet-4-6");
    expect(result?.bedrockClient).toBeDefined();
  });

  it("cachea el resultado -- una segunda llamada no vuelve a invocar SSM", async () => {
    process.env.BEDROCK_MODEL_ID_PARAM_NAME = "/dev/bedrock/model_id";
    process.env.BEDROCK_REGION_PARAM_NAME = "/dev/bedrock/region";

    const send = vi.fn().mockResolvedValue({ Parameter: { Value: "cached-value" } });

    await getBedrockDeciderConfig({ ssmClient: { send } });
    await getBedrockDeciderConfig({ ssmClient: { send } });

    expect(send).toHaveBeenCalledTimes(2); // 1 llamada por parámetro, solo en la primera invocación.
  });

  it("devuelve null (Bedrock no disponible) si SSM falla tras agotar los reintentos", async () => {
    process.env.BEDROCK_MODEL_ID_PARAM_NAME = "/dev/bedrock/model_id";
    process.env.BEDROCK_REGION_PARAM_NAME = "/dev/bedrock/region";

    const send = vi.fn().mockRejectedValue(new Error("AccessDenied"));

    const result = await getBedrockDeciderConfig({ ssmClient: { send }, baseDelayMs: 1 });

    expect(result).toBeNull();
  });
});
