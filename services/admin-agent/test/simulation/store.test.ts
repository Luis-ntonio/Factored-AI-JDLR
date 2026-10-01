import { describe, expect, it, vi } from "vitest";
import { getSimulationRun, listSimulationRuns, putSimulationRun, type SimulationRunItem } from "../../src/simulation/store";

const RUN: SimulationRunItem = {
  runId: "run-1",
  profileId: "maria-premium-es",
  objectiveId: "dispute-ambiguous",
  status: "completed",
  turns: [{ caseId: "sim-run-1", turnId: "t1", userMessage: "hola", status: "ok" }],
  expectedStatus: "ok",
  finalStatus: "ok",
  passed: true,
  createdAt: "2026-09-30T10:00:00.000Z",
  updatedAt: "2026-09-30T10:01:00.000Z",
};

describe("putSimulationRun", () => {
  it("escribe el item con pk/sk/gsi1pk derivados del runId", async () => {
    const send = vi.fn().mockResolvedValue({});
    const result = await putSimulationRun({ send }, "case-store", RUN);

    expect(result.ok).toBe(true);
    const input = send.mock.calls[0][0].input;
    expect(input.Item.pk).toBe("SIM#run-1");
    expect(input.Item.sk).toBe("META");
    expect(input.Item.gsi1pk).toBe("SIMULATIONS");
  });

  it("DynamoDB no disponible -> {ok: false}, nunca lanza", async () => {
    const send = vi.fn().mockRejectedValue(new Error("boom"));
    const result = await putSimulationRun({ send }, "case-store", RUN);
    expect(result.ok).toBe(false);
  });
});

describe("getSimulationRun", () => {
  it("devuelve el item reconstruido", async () => {
    const send = vi.fn().mockResolvedValue({ Item: { pk: "SIM#run-1", sk: "META", gsi1pk: "SIMULATIONS", ...RUN } });
    const result = await getSimulationRun({ send }, "case-store", "run-1");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value?.runId).toBe("run-1");
    expect(result.value?.passed).toBe(true);
  });

  it("runId inexistente -> {ok: true, value: null}", async () => {
    const send = vi.fn().mockResolvedValue({});
    const result = await getSimulationRun({ send }, "case-store", "nope");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toBeNull();
  });
});

describe("listSimulationRuns", () => {
  it("consulta el GSI by-customer con gsi1pk=SIMULATIONS y ordena por createdAt desc", async () => {
    const olderRun = { ...RUN, runId: "run-0", createdAt: "2026-09-29T00:00:00.000Z" };
    const send = vi.fn().mockResolvedValue({ Items: [olderRun, RUN] });
    const result = await listSimulationRuns({ send }, "case-store");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.map((r) => r.runId)).toEqual(["run-1", "run-0"]);
    const input = send.mock.calls[0][0].input;
    expect(input.IndexName).toBe("by-customer");
    expect(input.ExpressionAttributeValues[":g"]).toBe("SIMULATIONS");
  });

  it("DynamoDB no disponible -> {ok: false}", async () => {
    const send = vi.fn().mockRejectedValue(new Error("boom"));
    const result = await listSimulationRuns({ send }, "case-store");
    expect(result.ok).toBe(false);
  });
});
