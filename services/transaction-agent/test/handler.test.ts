import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { APIGatewayProxyEventV2 } from "aws-lambda";
import { emptyEntities } from "@banking-agent/shared";
import type { UnderstandOutput } from "@banking-agent/shared";

/**
 * Tests del handler de Lambda (`src/index.ts`), mismo criterio de
 * "nunca 5xx" que `services/retrieval-agent/test/handler.test.ts`. Se
 * mockea `../src/store/eligibility-store` para no requerir AWS real -- el
 * handler solo construye el cliente real si nadie lo mockeó, pero acá
 * inyectamos comportamiento a través de las variables de entorno + el mock
 * del módulo completo.
 */

vi.mock("../src/store/eligibility-store", async () => {
  const actual = await vi.importActual<typeof import("../src/store/eligibility-store")>(
    "../src/store/eligibility-store"
  );
  return {
    ...actual,
    buildDocClientFromEnv: () => ({ send: vi.fn() }),
  };
});

function makeEvent(body: unknown, isBase64Encoded = false): APIGatewayProxyEventV2 {
  return {
    body: typeof body === "string" ? body : JSON.stringify(body),
    isBase64Encoded,
  } as unknown as APIGatewayProxyEventV2;
}

function validInput(): UnderstandOutput {
  return {
    intent: "eligibility_check",
    language: "es",
    entities: {
      ...emptyEntities(),
      product_type: "personal_loan",
      income: 4000,
      employment_status: "employed",
      requested_amount: 4000,
      document_id: "12345678",
      document_type: "DNI",
      existing_customer: true,
    },
    missing_fields: [],
    context: {
      caseId: "case-handler-1",
      customerId: null,
      turnId: "turn-handler-1",
      degraded: false,
      degradedReason: "none",
      historyTurns: 0,
    },
  };
}

describe("transaction-agent Lambda handler", () => {
  const originalPolicyPath = process.env.POLICY_FILE_PATH;

  beforeEach(() => {
    vi.resetModules();
    process.env.POLICY_FILE_PATH = require("node:path").resolve(__dirname, "../../../policies.yaml");
  });

  afterEach(() => {
    process.env.POLICY_FILE_PATH = originalPolicyPath;
  });

  it("nunca devuelve 5xx: body vacío -> 200 con status 'unavailable'", async () => {
    const { handler } = await import("../src/index");
    const result = await handler(makeEvent(""));

    expect(result).toMatchObject({ statusCode: 200 });
    const parsed = JSON.parse((result as { body: string }).body);
    expect(parsed.status).toBe("unavailable");
  });

  it("body con forma inválida -> 200 con status 'unavailable', nunca crashea", async () => {
    const { handler } = await import("../src/index");
    const result = await handler(makeEvent({ foo: "bar" }));

    expect(result).toMatchObject({ statusCode: 200 });
    const parsed = JSON.parse((result as { body: string }).body);
    expect(parsed.status).toBe("unavailable");
  });

  it("intent distinto de eligibility_check -> 200 con status 'rejected' (transaction-agent solo actúa sobre eligibility_check)", async () => {
    const { handler } = await import("../src/index");
    const input = { ...validInput(), intent: "product_info" as const };
    const result = await handler(makeEvent(input));

    expect(result).toMatchObject({ statusCode: 200 });
    const parsed = JSON.parse((result as { body: string }).body);
    expect(parsed.status).toBe("rejected");
  });

  it("Dynamo no disponible (docClient.send siempre falla) -> 200 con status 'unavailable', nunca fabrica un EligibilityResult", async () => {
    vi.doMock("../src/store/eligibility-store", async () => {
      const actual = await vi.importActual<typeof import("../src/store/eligibility-store")>(
        "../src/store/eligibility-store"
      );
      return {
        ...actual,
        buildDocClientFromEnv: () => ({
          send: vi.fn().mockRejectedValue(new Error("dynamodb down")),
        }),
      };
    });
    const { handler } = await import("../src/index");
    const result = await handler(makeEvent(validInput()));

    expect(result).toMatchObject({ statusCode: 200 });
    const parsed = JSON.parse((result as { body: string }).body);
    expect(parsed.status).toBe("unavailable");
    expect(parsed.result).toBeUndefined();
  });
});
