import { describe, expect, it, vi } from "vitest";
import type { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { emptyEntities } from "@banking-agent/shared";
import { DynamoDbEligibilityStore } from "../src/store/eligibility-store";
import { computeEligibility, EligibilityUnavailableError } from "../src/compute-eligibility";

function makeMockDocClient(sendImpl: (cmd: unknown) => Promise<unknown>) {
  return { send: vi.fn(sendImpl) } as unknown as DynamoDBDocumentClient;
}

const sampleItem = {
  pk: "CASE#case-1",
  sk: "RESULT#eligibility#turn-1",
  caseId: "case-1",
  productType: "personal_loan",
  eligibility_score: 90,
  score_zone: "approved",
};

describe("DynamoDbEligibilityStore — getResult", () => {
  it("éxito: devuelve found con el item mapeado", async () => {
    const docClient = makeMockDocClient(async (cmd) => {
      if (cmd instanceof GetCommand) return { Item: sampleItem };
      return {};
    });
    const store = new DynamoDbEligibilityStore({ tableName: "t", docClient, maxRetries: 1, baseDelayMs: 1 });

    const result = await store.getResult("case-1", "turn-1");

    expect(result.status).toBe("found");
    if (result.status !== "found") return;
    expect(result.value.eligibility_score).toBe(90);
    expect(result.value.score_zone).toBe("approved");
  });

  it("sin item -> not_found (nunca inventa un resultado)", async () => {
    const docClient = makeMockDocClient(async () => ({ Item: undefined }));
    const store = new DynamoDbEligibilityStore({ tableName: "t", docClient, maxRetries: 1, baseDelayMs: 1 });

    const result = await store.getResult("case-2", "turn-1");

    expect(result.status).toBe("not_found");
  });

  it("reintenta hasta maxRetries y tiene éxito si un intento posterior funciona", async () => {
    let calls = 0;
    const docClient = makeMockDocClient(async () => {
      calls += 1;
      if (calls < 3) throw new Error("throttled");
      return { Item: sampleItem };
    });
    const store = new DynamoDbEligibilityStore({ tableName: "t", docClient, maxRetries: 2, baseDelayMs: 1 });

    const result = await store.getResult("case-1", "turn-1");

    expect(result.status).toBe("found");
    expect(calls).toBe(3); // 1 intento inicial + 2 reintentos (acotado, nunca infinito)
  });

  it("agota los reintentos -> unavailable, nunca lanza una excepción sin manejar", async () => {
    const docClient = makeMockDocClient(async () => {
      throw new Error("dynamodb down");
    });
    const store = new DynamoDbEligibilityStore({ tableName: "t", docClient, maxRetries: 2, baseDelayMs: 1 });

    const result = await store.getResult("case-1", "turn-1");

    expect(result.status).toBe("unavailable");
    if (result.status !== "unavailable") return;
    expect(result.reason).toBe("dynamodb_read_failed");
  });
});

describe("DynamoDbEligibilityStore — putResult", () => {
  it("éxito -> ok", async () => {
    const docClient = makeMockDocClient(async (cmd) => {
      if (cmd instanceof PutCommand) return {};
      return {};
    });
    const store = new DynamoDbEligibilityStore({ tableName: "t", docClient, maxRetries: 1, baseDelayMs: 1 });

    const result = await store.putResult(
      { caseId: "case-1", productType: "personal_loan", eligibility_score: 90, score_zone: "approved" },
      "turn-1"
    );

    expect(result.status).toBe("ok");
  });

  it("agota los reintentos -> unavailable, nunca lanza una excepción sin manejar", async () => {
    const docClient = makeMockDocClient(async () => {
      throw new Error("dynamodb down");
    });
    const store = new DynamoDbEligibilityStore({ tableName: "t", docClient, maxRetries: 2, baseDelayMs: 1 });

    const result = await store.putResult(
      { caseId: "case-1", productType: "personal_loan", eligibility_score: 90, score_zone: "approved" },
      "turn-1"
    );

    expect(result.status).toBe("unavailable");
    if (result.status !== "unavailable") return;
    expect(result.reason).toBe("dynamodb_write_failed");
  });
});

/**
 * Idempotencia de extremo a extremo (`computeEligibility` +
 * `DynamoDbEligibilityStore` con un cliente DynamoDB mockeado, tal como pide
 * la tarea original): la SEGUNDA llamada con el mismo `caseId`+`turnId` NO
 * debe volver a calcular ni a escribir -- se asegura contando explícitamente
 * cuántas veces se envía cada comando al cliente mockeado (spy/contador de
 * invocaciones sobre `docClient.send`).
 */
describe("computeEligibility + DynamoDbEligibilityStore — idempotencia y fallback", () => {
  const baseInput = {
    caseId: "case-idem-1",
    turnId: "turn-idem-1",
    productType: "personal_loan" as const,
    entities: {
      ...emptyEntities(),
      employment_status: "employed" as const,
      income: 5000,
      requested_amount: 5000,
      existing_customer: true,
    },
  };
  const thresholds = { min: 55, max: 70 };

  it("segunda invocación con el mismo caseId+turnId no dispara un segundo PutCommand (no recalcula)", async () => {
    let storedItem: Record<string, unknown> | undefined;
    let getCalls = 0;
    let putCalls = 0;

    const docClient = makeMockDocClient(async (cmd) => {
      if (cmd instanceof GetCommand) {
        getCalls += 1;
        return { Item: storedItem };
      }
      if (cmd instanceof PutCommand) {
        putCalls += 1;
        storedItem = (cmd as PutCommand).input.Item as Record<string, unknown>;
        return {};
      }
      return {};
    });
    const store = new DynamoDbEligibilityStore({ tableName: "t", docClient, maxRetries: 1, baseDelayMs: 1 });

    const first = await computeEligibility(baseInput, { store, thresholds });
    const second = await computeEligibility(baseInput, { store, thresholds });

    expect(getCalls).toBe(2); // el chequeo de idempotencia SIEMPRE se hace
    expect(putCalls).toBe(1); // pero solo se calculó/escribió una vez
    expect(second).toEqual(first);
  });

  it("Dynamo caído en la lectura de idempotencia -> nunca fabrica un resultado, propaga error explícito", async () => {
    const docClient = makeMockDocClient(async () => {
      throw new Error("dynamodb down");
    });
    const store = new DynamoDbEligibilityStore({ tableName: "t", docClient, maxRetries: 1, baseDelayMs: 1 });

    await expect(computeEligibility(baseInput, { store, thresholds })).rejects.toBeInstanceOf(
      EligibilityUnavailableError
    );
  });

  it("Dynamo caído solo al persistir (get ok, put falla) -> propaga error explícito, no reporta éxito sin confirmar persistencia", async () => {
    const docClient = makeMockDocClient(async (cmd) => {
      if (cmd instanceof GetCommand) return { Item: undefined };
      if (cmd instanceof PutCommand) throw new Error("dynamodb down");
      return {};
    });
    const store = new DynamoDbEligibilityStore({ tableName: "t", docClient, maxRetries: 1, baseDelayMs: 1 });

    let caught: unknown;
    try {
      await computeEligibility(baseInput, { store, thresholds });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(EligibilityUnavailableError);
    expect((caught as EligibilityUnavailableError).reason).toBe("dynamodb_write_failed");
  });
});
