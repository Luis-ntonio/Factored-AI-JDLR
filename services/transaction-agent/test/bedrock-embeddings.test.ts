import { describe, expect, it, vi } from "vitest";
import { getEmbedding } from "../src/matching/bedrock-embeddings";

/**
 * Cliente de Bedrock MOCKEADO a nivel de objeto inyectado (no `vi.mock` de
 * módulo) -- mismo criterio que otros tests de este repo que inyectan un
 * cliente fake en vez de mockear el paquete completo del SDK.
 */

function fakeClient(response: { embedding?: unknown } | null, shouldThrow = false) {
  return {
    send: vi.fn().mockImplementation(async () => {
      if (shouldThrow) throw new Error("AccessDeniedException");
      return { body: Buffer.from(JSON.stringify(response ?? {})) };
    }),
  };
}

const CONFIG = { modelId: "amazon.titan-embed-text-v2:0", region: "us-east-1" };

describe("getEmbedding", () => {
  it("respuesta válida -> devuelve el vector de embedding", async () => {
    const client = fakeClient({ embedding: [0.1, 0.2, 0.3] });
    const result = await getEmbedding("Netflix", CONFIG, client);
    expect(result).toEqual([0.1, 0.2, 0.3]);
  });

  it("texto vacío -> null, nunca llama a Bedrock", async () => {
    const client = fakeClient({ embedding: [0.1, 0.2, 0.3] });
    const result = await getEmbedding("   ", CONFIG, client);
    expect(result).toBeNull();
    expect(client.send).not.toHaveBeenCalled();
  });

  it("Bedrock lanza (AccessDenied, red, etc.) -> null, nunca propaga la excepción", async () => {
    const client = fakeClient(null, true);
    const result = await getEmbedding("Netflix", CONFIG, client);
    expect(result).toBeNull();
  });

  it("respuesta sin campo 'embedding' -> null", async () => {
    const client = fakeClient({});
    const result = await getEmbedding("Netflix", CONFIG, client);
    expect(result).toBeNull();
  });

  it("respuesta con 'embedding' que no es un array de números -> null", async () => {
    const client = fakeClient({ embedding: ["no", "numbers"] });
    const result = await getEmbedding("Netflix", CONFIG, client);
    expect(result).toBeNull();
  });
});
