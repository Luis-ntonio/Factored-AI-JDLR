import { describe, expect, it, vi } from "vitest";
import { listConversations } from "../src/list-conversations";

/**
 * `docClient` inyectado directamente (objeto fake), no `vi.mock` de módulo
 * -- mismo criterio que otros tests de este repo que prefieren inyección
 * de dependencias sobre mockear el SDK completo.
 */

function fakeDocClient(pages: Array<{ Items: Record<string, unknown>[]; LastEvaluatedKey?: unknown }>) {
  let call = 0;
  return {
    send: vi.fn().mockImplementation(async () => {
      const page = pages[Math.min(call, pages.length - 1)];
      call += 1;
      return page;
    }),
  };
}

const ITEM_A = {
  caseId: "case-a",
  customerId: "CUST-0001",
  lastIntent: "dispute_unrecognized_charge",
  lastLanguage: "es",
  turnCount: 2,
  updatedAt: "2026-09-30T10:00:00.000Z",
};

const ITEM_B = {
  caseId: "case-b",
  customerId: null,
  lastIntent: "product_info",
  lastLanguage: "pt",
  turnCount: 1,
  updatedAt: "2026-09-30T12:00:00.000Z",
};

describe("listConversations", () => {
  it("devuelve los casos ordenados por updatedAt descendente (más reciente primero)", async () => {
    const client = fakeDocClient([{ Items: [ITEM_A, ITEM_B] }]);
    const result = await listConversations(client, "case-store-table");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.map((c) => c.caseId)).toEqual(["case-b", "case-a"]);
    expect(result.value[0]).toEqual({
      caseId: "case-b",
      customerId: null,
      lastIntent: "product_info",
      lastLanguage: "pt",
      turnCount: 1,
      updatedAt: "2026-09-30T12:00:00.000Z",
    });
  });

  it("pagina con ExclusiveStartKey/LastEvaluatedKey hasta agotar todas las páginas", async () => {
    const client = fakeDocClient([
      { Items: [ITEM_A], LastEvaluatedKey: { pk: "CASE#case-a", sk: "STATE#latest" } },
      { Items: [ITEM_B] },
    ]);
    const result = await listConversations(client, "case-store-table");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(2);
    expect(client.send).toHaveBeenCalledTimes(2);
  });

  it("Scan sin ningún item (tabla vacía) -> lista vacía, nunca un error", async () => {
    const client = fakeDocClient([{ Items: [] }]);
    const result = await listConversations(client, "case-store-table");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual([]);
  });

  it("DynamoDB no disponible -> {ok: false}, nunca lanza", async () => {
    const client = { send: vi.fn().mockRejectedValue(new Error("ProvisionedThroughputExceededException")) };
    const result = await listConversations(client, "case-store-table");

    expect(result.ok).toBe(false);
  });
});
