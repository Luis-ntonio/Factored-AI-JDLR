import { describe, expect, it, beforeAll } from "vitest";
import type { APIGatewayProxyEventV2 } from "aws-lambda";

// El handler construye un ConversationStateStore real desde env vars la
// primera vez que se invoca correctamente; para este test solo nos importa
// el camino de fallo ANTES de llegar a DynamoDB (body inválido / tabla no
// configurada), que debe devolver 200 + UnderstandOutput degradado, nunca
// una excepción sin manejar ni un 5xx.
delete process.env.CASE_STORE_TABLE_NAME;

import { handler } from "../src/index";

function makeEvent(body: unknown): APIGatewayProxyEventV2 {
  return {
    body: typeof body === "string" ? body : JSON.stringify(body),
  } as unknown as APIGatewayProxyEventV2;
}

describe("handler — nunca pierde el turno del usuario", () => {
  it("responde 200 con output degradado si falta 'message' en el body", async () => {
    const response = await handler(makeEvent({ caseId: "case-x" }));
    expect(response.statusCode).toBe(200);
    const parsed = JSON.parse(response.body as string);
    expect(parsed.intent).toBe("unknown");
    expect(parsed.context.degraded).toBe(true);
    expect(parsed.context.degradedReason).toBe("internal_error");
  });

  it("responde 200 con output degradado si CASE_STORE_TABLE_NAME no está configurada", async () => {
    const response = await handler(makeEvent({ message: "Hola, quiero un préstamo" }));
    expect(response.statusCode).toBe(200);
    const parsed = JSON.parse(response.body as string);
    expect(parsed.context.degraded).toBe(true);
  });
});
