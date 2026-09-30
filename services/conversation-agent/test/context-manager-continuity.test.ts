import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { GetCommand } from "@aws-sdk/lib-dynamodb";
import type { Entities } from "@banking-agent/shared";
import { emptyEntities } from "@banking-agent/shared";
import { ConversationStateStore } from "../src/context/state-store";
import { buildUnderstandOutput, resolveEffectiveIntent } from "../src/context/context-manager";
import { resetBedrockConfigCache } from "../src/understanding/ssm-config";

/**
 * Regresión de un bug real encontrado en QA E2E contra AWS real (Fase
 * Dispute 2): `lastIntent` se persistía en `ConversationStateItem` pero
 * nunca se leía de vuelta para decidir el intent del turno siguiente -- una
 * respuesta corta a una pregunta CLARIFY (ej. "Es de mi tarjeta de
 * crédito", respondiendo "¿qué tipo de producto?" de una disputa activa)
 * se reclasificaba desde cero como un intent nuevo ("product_info"),
 * pisando el flujo de disputa en curso aunque el dato SÍ llenaba el campo
 * pedido. Ver `resolveEffectiveIntent` en `../src/context/context-manager.ts`.
 */

function makeMockDocClient(sendImpl: (cmd: unknown) => Promise<unknown>) {
  return { send: vi.fn(sendImpl) } as unknown as DynamoDBDocumentClient;
}

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  resetBedrockConfigCache();
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  resetBedrockConfigCache();
});

describe("resolveEffectiveIntent (función pura)", () => {
  it("continúa el intent anterior si el mensaje llena un campo que estaba pendiente de CLARIFY", () => {
    const incoming: Entities = { ...emptyEntities(), product_type: "credit_card" };
    const result = resolveEffectiveIntent("product_info", incoming, "dispute_unrecognized_charge", ["product_type"]);
    expect(result).toBe("dispute_unrecognized_charge");
  });

  it("usa el intent nuevo si no había intent anterior", () => {
    const incoming: Entities = { ...emptyEntities(), product_type: "credit_card" };
    const result = resolveEffectiveIntent("product_info", incoming, null, []);
    expect(result).toBe("product_info");
  });

  it("usa el intent nuevo si el intent anterior NO tenía missing_fields pendientes (ya estaba resuelto)", () => {
    const incoming: Entities = { ...emptyEntities(), product_type: "credit_card" };
    const result = resolveEffectiveIntent("product_info", incoming, "dispute_unrecognized_charge", []);
    expect(result).toBe("product_info");
  });

  it("usa el intent nuevo si este mensaje NO aporta ninguno de los campos pendientes (cambio de tema real)", () => {
    const incoming: Entities = { ...emptyEntities(), income: 3000 };
    const result = resolveEffectiveIntent("eligibility_check", incoming, "dispute_unrecognized_charge", [
      "product_type",
    ]);
    expect(result).toBe("eligibility_check");
  });

  // Bug real encontrado en la verificación E2E contra AWS real de la fase
  // CLARIFY post-Act (ver docstring de resolveEffectiveIntent): una
  // pregunta post_action (candidatas ambiguas) deja missing_fields VACÍO
  // (product_type/document_id ya completos) -- sin este caso especial, un
  // mensaje corto respondiéndola ("Netflix") se reclasificaba como
  // `unknown`, perdiendo el intent en curso.
  it("selectedTransactionId continúa dispute_unrecognized_charge AUNQUE missing_fields esté vacío (respuesta a un CLARIFY post-Act)", () => {
    const incoming: Entities = emptyEntities(); // "Netflix" no aporta ninguna entity nueva por sí solo
    const result = resolveEffectiveIntent(
      "unknown",
      incoming,
      "dispute_unrecognized_charge",
      [], // missing_fields vacío -- ya estaba completo desde el turno anterior
      "TXN-000002"
    );
    expect(result).toBe("dispute_unrecognized_charge");
  });

  it("selectedTransactionId NO fuerza continuidad si el intent anterior no era una disputa", () => {
    const incoming: Entities = emptyEntities();
    const result = resolveEffectiveIntent("unknown", incoming, "eligibility_check", [], "TXN-000002");
    expect(result).toBe("unknown");
  });

  it("sin selectedTransactionId, el comportamiento de missing_fields vacío es exactamente el de antes (sin regresión)", () => {
    const incoming: Entities = emptyEntities();
    const result = resolveEffectiveIntent("unknown", incoming, "dispute_unrecognized_charge", []);
    expect(result).toBe("unknown");
  });
});

describe("buildUnderstandOutput — continuidad de intent a través de turnos (integración con estado persistido)", () => {
  it("respuesta corta a un CLARIFY de disputa activa continúa dispute_unrecognized_charge, no se reclasifica", async () => {
    process.env.UNDERSTANDING_BACKEND = "heuristic";

    const persistedState = {
      caseId: "case-continuity-1",
      customerId: null,
      entities: {
        ...emptyEntities(),
        disputed_amount: 1299,
        merchant: "Amazon MX",
        transaction_date: "hace unos dias",
        dispute_reason: "unrecognized_charge",
        document_id: "LOTM900101MDFPRR09",
        document_type: "other",
      },
      lastIntent: "dispute_unrecognized_charge",
      lastLanguage: "es",
      turnCount: 1,
      updatedAt: "2026-09-28T00:00:00.000Z",
    };

    const docClient = makeMockDocClient(async (cmd) =>
      cmd instanceof GetCommand ? { Item: persistedState } : {}
    );
    const store = new ConversationStateStore({ tableName: "t", docClient, maxRetries: 1, baseDelayMs: 1 });

    const output = await buildUnderstandOutput(
      { caseId: "case-continuity-1", customerId: null, messageId: "msg-2", message: "Es de mi tarjeta de credito", role: "anonimo" },
      store
    );

    expect(output.intent).toBe("dispute_unrecognized_charge");
    expect(output.entities.product_type).toBe("credit_card");
    // Los datos ya conocidos del turno anterior se conservan (no se pierden
    // al continuar el intent).
    expect(output.entities.merchant).toBe("Amazon MX");
    expect(output.entities.disputed_amount).toBe(1299);
    expect(output.missing_fields).toEqual([]);
  });

  it("mensaje que NO responde el campo pendiente SÍ permite un cambio de tema real (no fuerza continuidad)", async () => {
    process.env.UNDERSTANDING_BACKEND = "heuristic";

    const persistedState = {
      caseId: "case-continuity-2",
      customerId: null,
      entities: emptyEntities(),
      lastIntent: "dispute_unrecognized_charge",
      lastLanguage: "es",
      turnCount: 1,
      updatedAt: "2026-09-28T00:00:00.000Z",
    };

    const docClient = makeMockDocClient(async (cmd) =>
      cmd instanceof GetCommand ? { Item: persistedState } : {}
    );
    const store = new ConversationStateStore({ tableName: "t", docClient, maxRetries: 1, baseDelayMs: 1 });

    const output = await buildUnderstandOutput(
      { caseId: "case-continuity-2", customerId: null, messageId: "msg-2", message: "Gano 2500 y trabajo en una empresa", role: "anonimo" },
      store
    );

    // Este mensaje no aporta ninguno de los campos de disputa pendientes --
    // el cambio de intent real (a eligibility_check, por los datos de
    // ingreso/empleo) no debe bloquearse por la continuidad.
    expect(output.intent).not.toBe("dispute_unrecognized_charge");
  });

  it("selectedTransactionId (respuesta a un CLARIFY post-Act de disputa ambigua) pasa tal cual a context.selectedTransactionId", async () => {
    process.env.UNDERSTANDING_BACKEND = "heuristic";
    const docClient = makeMockDocClient(async (cmd) => (cmd instanceof GetCommand ? { Item: undefined } : {}));
    const store = new ConversationStateStore({ tableName: "t", docClient, maxRetries: 1, baseDelayMs: 1 });

    const output = await buildUnderstandOutput(
      {
        caseId: "case-selection-1",
        customerId: null,
        messageId: "msg-1",
        message: "Netflix",
        role: "cliente",
        selectedTransactionId: "TXN-000002",
      },
      store
    );

    expect(output.context.selectedTransactionId).toBe("TXN-000002");
  });

  it("selectedTransactionId ausente -> context.selectedTransactionId queda undefined (nunca null/string vacío)", async () => {
    process.env.UNDERSTANDING_BACKEND = "heuristic";
    const docClient = makeMockDocClient(async (cmd) => (cmd instanceof GetCommand ? { Item: undefined } : {}));
    const store = new ConversationStateStore({ tableName: "t", docClient, maxRetries: 1, baseDelayMs: 1 });

    const output = await buildUnderstandOutput(
      { caseId: "case-selection-2", customerId: null, messageId: "msg-1", message: "Hola", role: "anonimo" },
      store
    );

    expect(output.context.selectedTransactionId).toBeUndefined();
  });
});
