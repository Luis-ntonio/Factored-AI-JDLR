import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { APIGatewayProxyEventV2 } from "aws-lambda";

/**
 * Tests de integración del handler completo con `@aws-sdk/client-ssm`
 * MOCKEADO a nivel de módulo (`vi.mock`) -- nunca pega a AWS real. Mismo
 * patrón que `services/policy-agent/src/handler.bedrock.test.ts`.
 */

const { ssmSend } = vi.hoisted(() => ({ ssmSend: vi.fn() }));

vi.mock("@aws-sdk/client-ssm", () => ({
  SSMClient: vi.fn().mockImplementation(() => ({ send: ssmSend })),
  GetParameterCommand: vi.fn().mockImplementation((input: unknown) => ({ input })),
}));

const ORIGINAL_ENV = { SESSION_TOKEN_SECRET_PARAM_NAME: process.env.SESSION_TOKEN_SECRET_PARAM_NAME };

function restoreEnv(): void {
  if (ORIGINAL_ENV.SESSION_TOKEN_SECRET_PARAM_NAME === undefined) {
    delete process.env.SESSION_TOKEN_SECRET_PARAM_NAME;
  } else {
    process.env.SESSION_TOKEN_SECRET_PARAM_NAME = ORIGINAL_ENV.SESSION_TOKEN_SECRET_PARAM_NAME;
  }
}

beforeEach(() => {
  ssmSend.mockReset();
  process.env.SESSION_TOKEN_SECRET_PARAM_NAME = "/dev/auth/session_token_secret";
});

afterEach(() => {
  restoreEnv();
  vi.resetModules();
});

function makeEvent(body: unknown): APIGatewayProxyEventV2 {
  return { body: JSON.stringify(body), isBase64Encoded: false } as unknown as APIGatewayProxyEventV2;
}

describe("auth-agent handler", () => {
  it("login exitoso con SSM disponible -> 200, ok:true, token presente", async () => {
    ssmSend.mockResolvedValue({ Parameter: { Value: "el-secreto-real" } });
    const { handler } = await import("../src/index");

    const result = await handler(
      makeEvent({ document_id: "LOTM900101MDFPRR09", first_name: "María Fernanda", last_name: "López Torres" })
    );

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body as string);
    expect(body.ok).toBe(true);
    expect(body.role).toBe("cliente_estrella");
    expect(typeof body.token).toBe("string");
  });

  it("credenciales inválidas -> 200, ok:false, reason invalid_credentials", async () => {
    ssmSend.mockResolvedValue({ Parameter: { Value: "el-secreto-real" } });
    const { handler } = await import("../src/index");

    const result = await handler(makeEvent({ document_id: "NO-EXISTE", first_name: "X", last_name: "Y" }));

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body as string)).toEqual({ ok: false, reason: "invalid_credentials" });
  });

  it("SSM no disponible tras reintentos -> 200, ok:false, nunca firma con un secreto inventado", async () => {
    ssmSend.mockRejectedValue(new Error("AccessDenied"));
    const { handler } = await import("../src/index");

    const result = await handler(
      makeEvent({ document_id: "LOTM900101MDFPRR09", first_name: "María Fernanda", last_name: "López Torres" })
    );

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body as string)).toEqual({ ok: false, reason: "invalid_request" });
  });

  it("body malformado -> 200, ok:false, nunca un 5xx/crash", async () => {
    ssmSend.mockResolvedValue({ Parameter: { Value: "el-secreto-real" } });
    const { handler } = await import("../src/index");

    const event = { body: "{not-json", isBase64Encoded: false } as unknown as APIGatewayProxyEventV2;
    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body as string).ok).toBe(false);
  });
});
