import { describe, expect, it, afterEach } from "vitest";
import type { APIGatewayProxyEventV2 } from "aws-lambda";
import type { UnderstandOutput } from "@banking-agent/shared";
import { emptyEntities } from "@banking-agent/shared";

function makeEvent(body: unknown, isBase64Encoded = false): APIGatewayProxyEventV2 {
  return {
    body: typeof body === "string" ? body : JSON.stringify(body),
    isBase64Encoded,
  } as unknown as APIGatewayProxyEventV2;
}

describe("retrieval-agent Lambda handler", () => {
  afterEach(() => {
    delete process.env.CATALOG_BACKEND;
  });

  // Nota: los tres tests de este archivo usan (implícita o explícitamente)
  // el backend "static" por defecto, así que el `cachedRepo` interno del
  // handler (creado en el primer `handler()` invocado dentro de este
  // archivo, dado el cache de módulos de Node/vitest) es siempre correcto
  // para estos casos. El comportamiento de `CATALOG_BACKEND=dynamodb` se
  // cubre por separado en `dynamodb-catalog-repository.test.ts`.

  it("nunca devuelve 5xx: body vacío -> 200 con RetrievalResult found:false", async () => {
    const { handler } = await import("../src/index");
    const result = await handler(makeEvent(""));
    expect(result.statusCode).toBe(200);
    const parsed = JSON.parse((result as { body: string }).body);
    expect(parsed.found).toBe(false);
  });

  it("body con forma inválida (no es un UnderstandOutput) -> 200 con found:false, nunca crashea", async () => {
    const { handler } = await import("../src/index");
    const result = await handler(makeEvent({ hello: "world" }));
    expect(result.statusCode).toBe(200);
    const parsed = JSON.parse((result as { body: string }).body);
    expect(parsed.found).toBe(false);
  });

  it("body válido (product_info, backend static por defecto) -> 200 con el producto real del catálogo", async () => {
    process.env.CATALOG_BACKEND = "static";
    const { handler } = await import("../src/index");

    const input: UnderstandOutput = {
      intent: "product_info",
      language: "es",
      entities: { ...emptyEntities(), product_type: "credit_card" },
      missing_fields: [],
      context: {
        caseId: "c1",
        customerId: null,
        turnId: "t1",
        degraded: false,
        degradedReason: "none",
        historyTurns: 0,
      },
    };

    const result = await handler(makeEvent(input));
    expect(result.statusCode).toBe(200);
    const parsed = JSON.parse((result as { body: string }).body);
    expect(parsed.found).toBe(true);
    expect(parsed.product.productType).toBe("credit_card");
    expect(parsed.product.source).toBeTruthy();
  });
});
