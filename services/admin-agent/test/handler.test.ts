import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { APIGatewayProxyEventV2 } from "aws-lambda";

/**
 * Tests de integración del handler completo con los SDKs de AWS MOCKEADOS
 * a nivel de módulo (`vi.mock`) -- nunca pega a AWS real. Mismo patrón que
 * `services/auth-agent/test/handler.test.ts`.
 */

const { ssmSend, dynamoSend, logsSend } = vi.hoisted(() => ({
  ssmSend: vi.fn(),
  dynamoSend: vi.fn(),
  logsSend: vi.fn(),
}));

vi.mock("@aws-sdk/client-ssm", () => ({
  SSMClient: vi.fn().mockImplementation(() => ({ send: ssmSend })),
  GetParameterCommand: vi.fn().mockImplementation((input: unknown) => ({ input })),
}));

vi.mock("@aws-sdk/client-dynamodb", () => ({
  DynamoDBClient: vi.fn().mockImplementation(() => ({})),
}));

vi.mock("@aws-sdk/lib-dynamodb", () => ({
  DynamoDBDocumentClient: { from: vi.fn().mockImplementation(() => ({ send: dynamoSend })) },
  ScanCommand: vi.fn().mockImplementation((input: unknown) => ({ input, kind: "scan" })),
}));

vi.mock("@aws-sdk/client-cloudwatch-logs", () => ({
  CloudWatchLogsClient: vi.fn().mockImplementation(() => ({ send: logsSend })),
  FilterLogEventsCommand: vi.fn().mockImplementation((input: unknown) => ({ input, kind: "filter" })),
}));

const ORIGINAL_ENV = {
  ADMIN_API_KEY_PARAM_NAME: process.env.ADMIN_API_KEY_PARAM_NAME,
  CASE_STORE_TABLE_NAME: process.env.CASE_STORE_TABLE_NAME,
  STATE_MACHINE_LOG_GROUP_NAME: process.env.STATE_MACHINE_LOG_GROUP_NAME,
};

function restoreEnv(): void {
  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

beforeEach(() => {
  ssmSend.mockReset();
  dynamoSend.mockReset();
  logsSend.mockReset();
  process.env.ADMIN_API_KEY_PARAM_NAME = "/dev/admin/api_key";
  process.env.CASE_STORE_TABLE_NAME = "dev-case-store";
  process.env.STATE_MACHINE_LOG_GROUP_NAME = "/aws/vendedlogs/states/dev-orchestrator";
  ssmSend.mockResolvedValue({ Parameter: { Value: "real-admin-key" } });
});

afterEach(() => {
  restoreEnv();
  vi.resetModules();
});

function makeEvent(rawPath: string, adminKey?: string): APIGatewayProxyEventV2 {
  return {
    rawPath,
    headers: adminKey ? { "x-admin-key": adminKey } : {},
  } as unknown as APIGatewayProxyEventV2;
}

describe("admin-agent handler", () => {
  it("sin x-admin-key -> 401, nunca toca DynamoDB/CloudWatch Logs", async () => {
    const { resetAdminConfigCacheForTests } = await import("../src/config");
    resetAdminConfigCacheForTests();
    const { handler } = await import("../src/index");

    const result = await handler(makeEvent("/admin/conversations"));

    expect(result.statusCode).toBe(401);
    expect(dynamoSend).not.toHaveBeenCalled();
  });

  it("x-admin-key incorrecta -> 401", async () => {
    const { resetAdminConfigCacheForTests } = await import("../src/config");
    resetAdminConfigCacheForTests();
    const { handler } = await import("../src/index");

    const result = await handler(makeEvent("/admin/conversations", "wrong-key"));

    expect(result.statusCode).toBe(401);
  });

  it("GET /admin/conversations con key correcta -> 200 con la lista", async () => {
    const { resetAdminConfigCacheForTests } = await import("../src/config");
    resetAdminConfigCacheForTests();
    dynamoSend.mockResolvedValue({
      Items: [
        {
          caseId: "case-a",
          customerId: "CUST-0001",
          lastIntent: "faq",
          lastLanguage: "es",
          turnCount: 1,
          updatedAt: "2026-09-30T10:00:00.000Z",
        },
      ],
    });
    const { handler } = await import("../src/index");

    const result = await handler(makeEvent("/admin/conversations", "real-admin-key"));

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body as string);
    expect(body.ok).toBe(true);
    expect(body.conversations).toHaveLength(1);
  });

  it("GET /admin/conversations/{caseId}/trace con key correcta -> 200 con la traza", async () => {
    const { resetAdminConfigCacheForTests } = await import("../src/config");
    resetAdminConfigCacheForTests();
    logsSend.mockResolvedValue({
      events: [
        {
          message: JSON.stringify({
            id: "1",
            type: "ExecutionStarted",
            event_timestamp: "1000",
            execution_arn: "arn:exec-1",
            details: { input: JSON.stringify({ caseId: "case-a", turnId: "turn-1", message: "hola" }) },
          }),
        },
      ],
    });
    const { handler } = await import("../src/index");

    const result = await handler(makeEvent("/admin/conversations/case-a/trace", "real-admin-key"));

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body as string);
    expect(body.ok).toBe(true);
    expect(body.turns).toHaveLength(1);
    expect(body.turns[0].userMessage).toBe("hola");
  });

  it("ruta desconocida -> 404", async () => {
    const { resetAdminConfigCacheForTests } = await import("../src/config");
    resetAdminConfigCacheForTests();
    const { handler } = await import("../src/index");

    const result = await handler(makeEvent("/admin/does-not-exist", "real-admin-key"));

    expect(result.statusCode).toBe(404);
  });

  it("SSM no disponible -> 500 con body, nunca lanza sin capturar", async () => {
    const { resetAdminConfigCacheForTests } = await import("../src/config");
    resetAdminConfigCacheForTests();
    ssmSend.mockRejectedValue(new Error("AccessDenied"));
    const { handler } = await import("../src/index");

    const result = await handler(makeEvent("/admin/conversations", "any-key"));

    expect(result.statusCode).toBe(500);
    const body = JSON.parse(result.body as string);
    expect(body.ok).toBe(false);
  });
});
