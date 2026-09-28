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

// NOTA: `DynamoDbDisputeStore` (`./compute-dispute` -> `./store/dispute-store`)
// se construye en `src/index.ts` usando el MISMO `buildDocClientFromEnv`
// importado de `../src/store/eligibility-store` -- el mock de arriba ya
// cubre ambos stores, no hace falta un segundo `vi.mock`.

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

/** Cliente real del seed `mock-core-banking.ts` (CUST-0001, María Fernanda
 * López Torres), con una transacción real Amazon MX ($1,299 MXN,
 * TXN-000001, sin fraude) -- usado para ejercitar la rama nueva
 * `dispute_unrecognized_charge` del handler contra `StaticTransactionRepository`
 * real (`getRepository()`), no un mock. */
function validDisputeInput(): UnderstandOutput {
  return {
    intent: "dispute_unrecognized_charge",
    language: "es",
    entities: {
      ...emptyEntities(),
      document_id: "LOTM900101MDFPRR09",
      product_type: "credit_card",
      merchant: "amazon",
    },
    missing_fields: [],
    context: {
      caseId: "case-handler-dispute-1",
      customerId: null,
      turnId: "turn-handler-dispute-1",
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

  it("intent desconocido (ej. product_info) -> 200 con status 'rejected', mensaje menciona ambos intents soportados", async () => {
    const { handler } = await import("../src/index");
    const input = { ...validInput(), intent: "product_info" as const };
    const result = await handler(makeEvent(input));

    expect(result).toMatchObject({ statusCode: 200 });
    const parsed = JSON.parse((result as { body: string }).body);
    expect(parsed.status).toBe("rejected");
    expect(parsed.reason).toContain("eligibility_check");
    expect(parsed.reason).toContain("dispute_unrecognized_charge");
  });

  it("intent dispute_unrecognized_charge, éxito -> 200 con status 'ok' y transactionFound true (TXN-000001, Amazon MX)", async () => {
    // A diferencia del mock por defecto (`send: vi.fn()`, que no resuelve
    // ningún comando -- suficiente para los caminos "rejected" tempranos de
    // arriba), este camino SÍ llega hasta `DynamoDbDisputeStore`, así que
    // necesita un docClient que responda `GetCommand`/`PutCommand` como lo
    // haría DynamoDB real (sin item previo, put exitoso).
    vi.doMock("../src/store/eligibility-store", async () => {
      const actual = await vi.importActual<typeof import("../src/store/eligibility-store")>(
        "../src/store/eligibility-store"
      );
      return {
        ...actual,
        buildDocClientFromEnv: () => ({ send: vi.fn().mockResolvedValue({ Item: undefined }) }),
      };
    });
    const { handler } = await import("../src/index");
    const result = await handler(makeEvent(validDisputeInput()));

    expect(result).toMatchObject({ statusCode: 200 });
    const parsed = JSON.parse((result as { body: string }).body);
    expect(parsed.status).toBe("ok");
    expect(parsed.result).toMatchObject({
      transactionFound: true,
      transactionId: "TXN-000001",
      fraudSuspected: false,
      productBlocked: true,
    });
  });

  it("intent dispute_unrecognized_charge sin document_id -> 200 con status 'rejected'", async () => {
    const { handler } = await import("../src/index");
    const input = { ...validDisputeInput(), entities: { ...validDisputeInput().entities, document_id: null } };
    const result = await handler(makeEvent(input));

    expect(result).toMatchObject({ statusCode: 200 });
    const parsed = JSON.parse((result as { body: string }).body);
    expect(parsed.status).toBe("rejected");
    expect(parsed.reason).toContain("document_id");
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
