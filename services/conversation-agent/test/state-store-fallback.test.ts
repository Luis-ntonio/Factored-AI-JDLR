import { describe, expect, it, vi } from "vitest";
import type { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { GetCommand, PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { ConversationStateStore } from "../src/context/state-store";
import { buildUnderstandOutput } from "../src/context/context-manager";
import { emptyEntities } from "@banking-agent/shared";

function makeMockDocClient(sendImpl: (cmd: unknown) => Promise<unknown>) {
  return { send: vi.fn(sendImpl) } as unknown as DynamoDBDocumentClient;
}

describe("ConversationStateStore — reintentos acotados", () => {
  it("reintenta hasta maxRetries y tiene éxito si un intento posterior funciona", async () => {
    let calls = 0;
    const docClient = makeMockDocClient(async (cmd) => {
      calls += 1;
      if (cmd instanceof GetCommand && calls < 3) {
        throw new Error("throttled");
      }
      return { Item: undefined };
    });
    const store = new ConversationStateStore({ tableName: "t", docClient, maxRetries: 2, baseDelayMs: 1 });

    const result = await store.getState("case-1");

    expect(result.ok).toBe(true);
    expect(calls).toBe(3); // 1 intento inicial + 2 reintentos
  });

  it("agota los reintentos y devuelve ok:false sin lanzar excepción", async () => {
    const docClient = makeMockDocClient(async () => {
      throw new Error("dynamodb down");
    });
    const store = new ConversationStateStore({ tableName: "t", docClient, maxRetries: 2, baseDelayMs: 1 });

    const result = await store.getState("case-1");

    expect(result.ok).toBe(false);
  });
});

describe("buildUnderstandOutput — fallback de Reliability", () => {
  it("degrada a 'sin memoria de sesión' si la lectura de DynamoDB falla, sin crashear ni perder el turno", async () => {
    const docClient = makeMockDocClient(async (cmd) => {
      if (cmd instanceof GetCommand) throw new Error("read failed");
      return {};
    });
    const store = new ConversationStateStore({ tableName: "t", docClient, maxRetries: 1, baseDelayMs: 1 });

    const output = await buildUnderstandOutput(
      { caseId: "case-1", customerId: null, messageId: "msg-1", message: "Gano 2500 y trabajo en una empresa", role: "anonimo" },
      store
    );

    expect(output.context.degraded).toBe(true);
    expect(output.context.degradedReason).toBe("dynamodb_read_failed");
    // Igual procesa el turno con lo que se pudo extraer del mensaje actual.
    expect(output.entities.income).toBe(2500);
    expect(output.entities.employment_status).toBe("employed");
  });

  it("marca degraded por fallo de escritura, pero preserva entities ya leídos correctamente (no repregunta)", async () => {
    const existingState = {
      Item: {
        pk: "CASE#case-2",
        sk: "STATE#latest",
        caseId: "case-2",
        customerId: null,
        entities: { ...emptyEntities(), income: 3000, employment_status: "employed" },
        lastIntent: "eligibility_check",
        lastLanguage: "es",
        turnCount: 1,
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    };
    const docClient = makeMockDocClient(async (cmd) => {
      if (cmd instanceof GetCommand) return existingState;
      if (cmd instanceof PutCommand) throw new Error("write failed");
      return {};
    });
    const store = new ConversationStateStore({ tableName: "t", docClient, maxRetries: 1, baseDelayMs: 1 });

    const output = await buildUnderstandOutput(
      { caseId: "case-2", customerId: null, messageId: "msg-2", message: "Necesito 5000 para un préstamo personal", role: "anonimo" },
      store
    );

    expect(output.context.degraded).toBe(true);
    expect(output.context.degradedReason).toBe("dynamodb_write_failed");
    // No vuelve a preguntar income/employment_status ya conocidos por lectura exitosa.
    expect(output.entities.income).toBe(3000);
    expect(output.entities.employment_status).toBe("employed");
    expect(output.entities.requested_amount).toBe(5000);
    expect(output.entities.product_type).toBe("personal_loan");
  });

  it("camino feliz: sin degradación, calcula missing_fields correctamente para eligibility_check", async () => {
    const docClient = makeMockDocClient(async (cmd) => {
      if (cmd instanceof GetCommand) return { Item: undefined };
      return {};
    });
    const store = new ConversationStateStore({ tableName: "t", docClient, maxRetries: 1, baseDelayMs: 1 });

    const output = await buildUnderstandOutput(
      {
        caseId: "case-3",
        customerId: "cust-1",
        messageId: "msg-3",
        message: "Quiero saber si califico para una tarjeta de crédito",
        role: "anonimo",
      },
      store
    );

    expect(output.context.degraded).toBe(false);
    expect(output.context.degradedReason).toBe("none");
    expect(output.intent).toBe("eligibility_check");
    // Faltan todos los campos de elegibilidad excepto product_type (detectado en este turno).
    expect(output.missing_fields).toEqual(
      expect.arrayContaining(["income", "employment_status", "requested_amount", "document_id", "existing_customer"])
    );
    expect(output.missing_fields).not.toContain("product_type");
  });
});

describe("ConversationStateStore.countPastDisputeCases", () => {
  it("cuenta solo los STATE#latest con lastIntent=dispute_unrecognized_charge, vía el GSI by-customer", async () => {
    const docClient = makeMockDocClient(async (cmd) => {
      expect(cmd).toBeInstanceOf(QueryCommand);
      const input = (cmd as QueryCommand).input;
      expect(input.IndexName).toBe("by-customer");
      expect(input.ExpressionAttributeValues?.[":g"]).toBe("CUSTOMER#cust-1");
      return {
        Items: [
          { caseId: "case-old-1" },
          { caseId: "case-old-2" },
        ],
      };
    });
    const store = new ConversationStateStore({ tableName: "t", docClient, maxRetries: 1, baseDelayMs: 1 });

    const result = await store.countPastDisputeCases("cust-1", "case-current");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toBe(2);
  });

  it("pagina con ExclusiveStartKey/LastEvaluatedKey hasta agotar todas las páginas", async () => {
    let call = 0;
    const docClient = makeMockDocClient(async () => {
      call += 1;
      if (call === 1) return { Items: [{ caseId: "case-old-1" }], LastEvaluatedKey: { pk: "x" } };
      return { Items: [{ caseId: "case-old-2" }] };
    });
    const store = new ConversationStateStore({ tableName: "t", docClient, maxRetries: 1, baseDelayMs: 1 });

    const result = await store.countPastDisputeCases("cust-1", "case-current");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toBe(2);
    expect(call).toBe(2);
  });

  it("DynamoDB no disponible -> {ok: false}, nunca lanza", async () => {
    const docClient = makeMockDocClient(async () => {
      throw new Error("down");
    });
    const store = new ConversationStateStore({ tableName: "t", docClient, maxRetries: 0, baseDelayMs: 1 });

    const result = await store.countPastDisputeCases("cust-1", "case-current");

    expect(result.ok).toBe(false);
  });
});

describe("buildUnderstandOutput — context.priorDisputeCount", () => {
  it("customerId conocido: usa el conteo real devuelto por countPastDisputeCases", async () => {
    const docClient = makeMockDocClient(async (cmd) => {
      if (cmd instanceof GetCommand) return { Item: undefined };
      if (cmd instanceof QueryCommand) return { Items: [{ caseId: "case-old-1" }, { caseId: "case-old-2" }] };
      return {};
    });
    const store = new ConversationStateStore({ tableName: "t", docClient, maxRetries: 1, baseDelayMs: 1 });

    const output = await buildUnderstandOutput(
      { caseId: "case-4", customerId: "cust-2", messageId: "msg-4", message: "No reconozco un cargo de 100", role: "cliente" },
      store
    );

    expect(output.context.priorDisputeCount).toBe(2);
  });

  it("customerId null (anónimo): priorDisputeCount es null, nunca consulta el GSI", async () => {
    const send = vi.fn(async (cmd: unknown) => {
      if (cmd instanceof GetCommand) return { Item: undefined };
      return {};
    });
    const docClient = { send } as unknown as DynamoDBDocumentClient;
    const store = new ConversationStateStore({ tableName: "t", docClient, maxRetries: 1, baseDelayMs: 1 });

    const output = await buildUnderstandOutput(
      { caseId: "case-5", customerId: null, messageId: "msg-5", message: "No reconozco un cargo de 100", role: "anonimo" },
      store
    );

    expect(output.context.priorDisputeCount).toBeNull();
    expect(send).not.toHaveBeenCalledWith(expect.any(QueryCommand));
  });

  it("fallo del conteo de reincidencia: priorDisputeCount es null, pero NUNCA marca degraded (señal opcional, no core)", async () => {
    const docClient = makeMockDocClient(async (cmd) => {
      if (cmd instanceof GetCommand) return { Item: undefined };
      if (cmd instanceof QueryCommand) throw new Error("gsi down");
      return {};
    });
    const store = new ConversationStateStore({ tableName: "t", docClient, maxRetries: 0, baseDelayMs: 1 });

    const output = await buildUnderstandOutput(
      { caseId: "case-6", customerId: "cust-3", messageId: "msg-6", message: "No reconozco un cargo de 100", role: "cliente" },
      store
    );

    expect(output.context.priorDisputeCount).toBeNull();
    expect(output.context.degraded).toBe(false);
  });
});
