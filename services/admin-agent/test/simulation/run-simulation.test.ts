import { describe, expect, it, vi } from "vitest";
import { runSimulation, type RunSimulationDeps } from "../../src/simulation/run-simulation";
import type { SimulationRunItem } from "../../src/simulation/store";

/**
 * `fetchFn`/`docClient`/`bedrockClient` todos inyectados -- nunca pega a
 * AWS real ni a los endpoints públicos reales desde `npm test` (mismo
 * criterio que el resto del repo).
 */

function basePendingRun(overrides: Partial<SimulationRunItem> = {}): SimulationRunItem {
  const now = "2026-09-30T10:00:00.000Z";
  return {
    runId: "run-1",
    profileId: "maría-premium-es",
    objectiveId: "dispute-ambiguous",
    status: "pending",
    turns: [],
    expectedStatus: "ok",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function fakeDocClient(initialRun: SimulationRunItem) {
  let stored: SimulationRunItem = { ...initialRun };
  const send = vi.fn().mockImplementation(async (command: { input: Record<string, unknown> }) => {
    if (command.input.Item) {
      stored = command.input.Item as unknown as SimulationRunItem;
      return {};
    }
    if (command.input.Key) {
      return { Item: { pk: `SIM#${stored.runId}`, sk: "META", gsi1pk: "SIMULATIONS", ...stored } };
    }
    throw new Error("unexpected command shape in test fake");
  });
  return { send, getStored: () => stored };
}

function jsonFetchResponse(body: unknown) {
  return { json: async () => body };
}

function baseDeps(docClient: { send: ReturnType<typeof vi.fn> }, fetchFn: ReturnType<typeof vi.fn>): RunSimulationDeps {
  return {
    docClient,
    caseStoreTableName: "case-store",
    bedrockClient: { send: vi.fn() },
    bedrockModelId: "model-x",
    chatApiUrl: "https://api.example/chat",
    authLoginUrl: "https://api.example/auth/login",
    fetchFn: fetchFn as unknown as typeof fetch,
  };
}

describe("runSimulation", () => {
  it("resuelve en 1 turno (status ok) -> completed, passed=true", async () => {
    const run = basePendingRun();
    const docClient = fakeDocClient(run);

    const fetchFn = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes("/auth/login")) return jsonFetchResponse({ ok: true, token: "tok-1" });
      return jsonFetchResponse({ status: "ok" });
    });

    await runSimulation("run-1", baseDeps(docClient, fetchFn));

    const stored = docClient.getStored();
    expect(stored.status).toBe("completed");
    expect(stored.finalStatus).toBe("ok");
    expect(stored.passed).toBe(true);
    expect(stored.turns).toHaveLength(1);
  });

  it("loop de clarify: reenvía selectedTransactionId elegido por el simulador en el siguiente turno", async () => {
    const run = basePendingRun();
    const docClient = fakeDocClient(run);

    let chatCall = 0;
    const fetchFn = vi.fn().mockImplementation(async (url: string, init?: { body?: string }) => {
      if (url.includes("/auth/login")) return jsonFetchResponse({ ok: true, token: "tok-1" });
      chatCall += 1;
      if (chatCall === 1) {
        return jsonFetchResponse({
          status: "clarify",
          policyDecision: { askField: "dispute_candidate_selection", reason: "Hay varias candidatas." },
          ambiguousCandidates: [
            { transactionId: "TXN-A", merchant: "Netflix", amount: 219, date: "2026-09-01" },
            { transactionId: "TXN-B", merchant: "Disney Plus", amount: 219, date: "2026-09-02" },
          ],
        });
      }
      const body = init?.body ? (JSON.parse(init.body) as { selectedTransactionId?: string }) : {};
      expect(body.selectedTransactionId).toBe("TXN-A");
      return jsonFetchResponse({ status: "ok" });
    });

    const bedrockSend = vi.fn().mockResolvedValue({
      output: {
        message: {
          content: [
            {
              toolUse: {
                name: "produce_next_user_message",
                input: { next_message: "Fue el de Netflix.", selected_transaction_id: "TXN-A", is_done: false },
              },
            },
          ],
        },
      },
    });

    const deps = { ...baseDeps(docClient, fetchFn), bedrockClient: { send: bedrockSend } };
    await runSimulation("run-1", deps);

    const stored = docClient.getStored();
    expect(stored.status).toBe("completed");
    expect(stored.finalStatus).toBe("ok");
    expect(stored.passed).toBe(true);
    expect(stored.turns).toHaveLength(2);
    expect(chatCall).toBe(2);
  });

  it("login falla -> status failed, nunca llama al endpoint de chat", async () => {
    const run = basePendingRun();
    const docClient = fakeDocClient(run);

    const fetchFn = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes("/auth/login")) return jsonFetchResponse({ ok: false, reason: "invalid_credentials" });
      throw new Error("no debería llamar a /chat si el login falló");
    });

    await runSimulation("run-1", baseDeps(docClient, fetchFn));

    const stored = docClient.getStored();
    expect(stored.status).toBe("failed");
    expect(stored.error).toContain("login falló");
  });

  it("tope de turnos alcanzado sin resolver -> completed con passed=false (nunca entra en loop infinito)", async () => {
    const run = basePendingRun({ expectedStatus: "ok" });
    const docClient = fakeDocClient(run);

    const fetchFn = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes("/auth/login")) return jsonFetchResponse({ ok: true, token: "tok-1" });
      return jsonFetchResponse({ status: "clarify", policyDecision: { reason: "Falta un dato." } });
    });

    const bedrockSend = vi.fn().mockResolvedValue({
      output: {
        message: {
          content: [
            { toolUse: { name: "produce_next_user_message", input: { next_message: "Acá va otro dato.", is_done: false } } },
          ],
        },
      },
    });

    const deps = { ...baseDeps(docClient, fetchFn), bedrockClient: { send: bedrockSend }, maxTurns: 3 };
    await runSimulation("run-1", deps);

    const stored = docClient.getStored();
    expect(stored.status).toBe("completed");
    expect(stored.finalStatus).toBe("clarify");
    expect(stored.passed).toBe(false);
    expect(stored.turns).toHaveLength(3);
  });

  it("runId no existe en el store -> no lanza, no hace nada más", async () => {
    const docClient = { send: vi.fn().mockResolvedValue({}) };
    const fetchFn = vi.fn();

    await expect(runSimulation("missing-run", baseDeps(docClient, fetchFn))).resolves.toBeUndefined();
    expect(fetchFn).not.toHaveBeenCalled();
  });
});
