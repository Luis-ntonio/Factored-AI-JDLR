import { describe, expect, it, vi } from "vitest";
import { getConversationTrace } from "../src/get-trace";

/**
 * Fixtures de log MODELADAS a mano sobre el shape REAL confirmado contra
 * CloudWatch real de esta cuenta antes de escribir `get-trace.ts` (ver
 * docs/STATUS.md, fase del dashboard de admin) -- no inventadas: mismos
 * campos (`details.input`/`output`/`name`, `id`, `type`, `event_timestamp`,
 * `execution_arn`) que un log real de
 * `/aws/vendedlogs/states/banking-agent-dev-chat-orchestrator`.
 */

const EXECUTION_ARN = "arn:aws:states:us-east-1:111111111111:express:orch:exec-1:uuid-1";
const CASE_ID = "case-fixture-1";

function logLine(fields: Record<string, unknown>) {
  return { message: JSON.stringify(fields) };
}

const RAW_EVENTS = [
  logLine({
    id: "1",
    type: "ExecutionStarted",
    event_timestamp: "1000",
    execution_arn: EXECUTION_ARN,
    details: {
      input: JSON.stringify({
        caseId: CASE_ID,
        turnId: "turn-1",
        message: "hola",
        sessionToken: "eyFAKE.SIGNED.TOKEN",
      }),
    },
  }),
  logLine({
    id: "2",
    type: "TaskStateEntered",
    event_timestamp: "1000",
    execution_arn: EXECUTION_ARN,
    details: {
      name: "Understand",
      input: JSON.stringify({ caseId: CASE_ID, message: "hola", sessionToken: "eyFAKE.SIGNED.TOKEN" }),
    },
  }),
  logLine({
    id: "3",
    type: "TaskStateExited",
    event_timestamp: "1500",
    execution_arn: EXECUTION_ARN,
    details: { name: "Understand", output: JSON.stringify({ understand: { intent: "faq" } }) },
  }),
  logLine({
    id: "4",
    type: "TaskStateEntered",
    event_timestamp: "1500",
    execution_arn: EXECUTION_ARN,
    details: { name: "Decide", input: JSON.stringify({ understand: { intent: "faq" } }) },
  }),
  logLine({
    id: "5",
    type: "TaskStateExited",
    event_timestamp: "1650",
    execution_arn: EXECUTION_ARN,
    details: { name: "Decide", output: JSON.stringify({ decideResult: { Payload: { decision: "AUTO" } } }) },
  }),
];

function fakeLogsClient(events: Array<{ message: string }>, pages = 1) {
  let call = 0;
  return {
    send: vi.fn().mockImplementation(async () => {
      call += 1;
      return { events, nextToken: call < pages ? "next" : undefined };
    }),
  };
}

describe("getConversationTrace", () => {
  it("reconstruye los pasos en orden, con duración calculada y sessionToken redactado", async () => {
    const client = fakeLogsClient(RAW_EVENTS);
    const result = await getConversationTrace(client, "log-group", CASE_ID);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(1);

    const turn = result.value[0];
    expect(turn.turnId).toBe("turn-1");
    expect(turn.userMessage).toBe("hola");
    expect(turn.steps.map((s) => s.name)).toEqual(["Understand", "Decide"]);
    expect(turn.steps[0].durationMs).toBe(500);
    expect(turn.steps[1].durationMs).toBe(150);
    expect(turn.steps[0].stateType).toBe("Task");

    // El sessionToken del input crudo de "Understand" nunca se expone tal cual.
    const understandInput = turn.steps[0].input as { sessionToken?: string };
    expect(understandInput.sessionToken).toBe("[redacted]");
  });

  it("finalOutput es el output del ÚLTIMO paso de la ejecución", async () => {
    const client = fakeLogsClient(RAW_EVENTS);
    const result = await getConversationTrace(client, "log-group", CASE_ID);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value[0].finalOutput).toEqual({ decideResult: { Payload: { decision: "AUTO" } } });
  });

  it("caseId con caracteres fuera del charset seguro -> {ok: false}, nunca arma un filterPattern sin validar", async () => {
    const client = fakeLogsClient(RAW_EVENTS);
    const result = await getConversationTrace(client, "log-group", 'case"; malicious');

    expect(result.ok).toBe(false);
    expect(client.send).not.toHaveBeenCalled();
  });

  it("pagina con nextToken hasta agotar todas las páginas", async () => {
    const client = fakeLogsClient(RAW_EVENTS, 3);
    const result = await getConversationTrace(client, "log-group", CASE_ID);

    expect(result.ok).toBe(true);
    expect(client.send).toHaveBeenCalledTimes(3);
  });

  it("CloudWatch Logs no disponible -> {ok: false}, nunca lanza", async () => {
    const client = { send: vi.fn().mockRejectedValue(new Error("ThrottlingException")) };
    const result = await getConversationTrace(client, "log-group", CASE_ID);

    expect(result.ok).toBe(false);
  });

  it("líneas de log que no son JSON válido se ignoran, nunca rompen toda la traza", async () => {
    const client = fakeLogsClient([{ message: "not json" }, ...RAW_EVENTS]);
    const result = await getConversationTrace(client, "log-group", CASE_ID);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(1);
  });
});
