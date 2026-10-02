import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { APIGatewayProxyEventV2 } from "aws-lambda";

/**
 * Tests de integración del handler completo con `@aws-sdk/client-ssm`
 * MOCKEADO a nivel de módulo (`vi.mock`) -- nunca pega a AWS real. Mismo
 * patrón que `services/policy-agent/src/handler.bedrock.test.ts`.
 */

const { ssmSend, dynamoSend } = vi.hoisted(() => ({ ssmSend: vi.fn(), dynamoSend: vi.fn() }));

vi.mock("@aws-sdk/client-ssm", () => ({
  SSMClient: vi.fn().mockImplementation(() => ({ send: ssmSend })),
  GetParameterCommand: vi.fn().mockImplementation((input: unknown) => ({ input })),
}));

vi.mock("@aws-sdk/client-dynamodb", () => ({
  DynamoDBClient: vi.fn().mockImplementation(() => ({})),
}));

vi.mock("@aws-sdk/lib-dynamodb", () => ({
  DynamoDBDocumentClient: { from: vi.fn().mockImplementation(() => ({ send: dynamoSend })) },
  GetCommand: vi.fn().mockImplementation((input: unknown) => ({ input, kind: "get" })),
  PutCommand: vi.fn().mockImplementation((input: unknown) => ({ input, kind: "put" })),
  UpdateCommand: vi.fn().mockImplementation((input: unknown) => ({ input, kind: "update" })),
  DeleteCommand: vi.fn().mockImplementation((input: unknown) => ({ input, kind: "delete" })),
}));

const ORIGINAL_ENV = {
  SESSION_TOKEN_SECRET_PARAM_NAME: process.env.SESSION_TOKEN_SECRET_PARAM_NAME,
  RESEND_API_KEY_PARAM_NAME: process.env.RESEND_API_KEY_PARAM_NAME,
  RESEND_FROM_EMAIL: process.env.RESEND_FROM_EMAIL,
  OTP_TABLE_NAME: process.env.OTP_TABLE_NAME,
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
  process.env.SESSION_TOKEN_SECRET_PARAM_NAME = "/dev/auth/session_token_secret";
  process.env.RESEND_API_KEY_PARAM_NAME = "/dev/auth/resend_api_key";
  process.env.RESEND_FROM_EMAIL = "no-reply@phonance.com";
  process.env.OTP_TABLE_NAME = "dev-otp-codes";
});

afterEach(() => {
  restoreEnv();
  vi.resetModules();
  vi.unstubAllGlobals();
});

function makeEvent(body: unknown, rawPath?: string): APIGatewayProxyEventV2 {
  return { body: JSON.stringify(body), isBase64Encoded: false, rawPath } as unknown as APIGatewayProxyEventV2;
}

describe("auth-agent handler -- paso 1 de login (/auth/login y /auth/otp/request, mismo comportamiento)", () => {
  it.each(["/auth/login", "/auth/otp/request", undefined] as const)(
    "documento + nombre + apellido correctos en %s -> 200, ok:true (NUNCA un token acá -- dispara el código por email)",
    async (rawPath) => {
      ssmSend.mockResolvedValue({ Parameter: { Value: "el-secreto-real" } });
      dynamoSend.mockImplementation(async (cmd: { kind: string }) => {
        if (cmd.kind === "get") return { Item: undefined };
        return {};
      });
      const fetchMock = vi.fn().mockResolvedValue({ ok: true });
      vi.stubGlobal("fetch", fetchMock);
      const { handler } = await import("../src/index");

      const result = await handler(
        makeEvent({ document_id: "LOTM900101MDFPRR09", first_name: "María Fernanda", last_name: "López Torres" }, rawPath)
      );

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body as string);
      expect(body).toEqual({ ok: true });
      expect(fetchMock).toHaveBeenCalledWith("https://api.resend.com/emails", expect.anything());
    }
  );

  it("credenciales inválidas -> 200, ok:true IGUAL (anti-enumeración), pero sin disparar ningún email", async () => {
    ssmSend.mockResolvedValue({ Parameter: { Value: "el-secreto-real" } });
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    const { handler } = await import("../src/index");

    const result = await handler(makeEvent({ document_id: "NO-EXISTE", first_name: "X", last_name: "Y" }));

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body as string)).toEqual({ ok: true });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("campos faltantes -> 200, ok:false, invalid_request", async () => {
    ssmSend.mockResolvedValue({ Parameter: { Value: "el-secreto-real" } });
    const { handler } = await import("../src/index");

    const result = await handler(makeEvent({ document_id: "LOTM900101MDFPRR09" }));

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

  it("sin RESEND_API_KEY_PARAM_NAME configurada -> 200, ok:false, nunca finge haber enviado un email", async () => {
    delete process.env.RESEND_API_KEY_PARAM_NAME;
    ssmSend.mockResolvedValue({ Parameter: { Value: "el-secreto-real" } });

    const { handler } = await import("../src/index");
    const result = await handler(
      makeEvent({ document_id: "LOTM900101MDFPRR09", first_name: "María Fernanda", last_name: "López Torres", language: "es" })
    );

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body as string)).toEqual({ ok: false, reason: "invalid_request" });
  });
});

describe("auth-agent handler -- paso 2 de login (/auth/otp/verify, único paso que mintea un token)", () => {
  it("POST /auth/otp/verify con código correcto -> 200, ok:true, token presente", async () => {
    ssmSend.mockResolvedValue({ Parameter: { Value: "el-secreto-real" } });
    const { hashOtpCode } = await import("../src/otp/code");
    const codeHash = hashOtpCode("111111");

    dynamoSend.mockImplementation(async (cmd: { kind: string }) => {
      if (cmd.kind === "get") {
        return {
          Item: {
            pk: "LOTM900101MDFPRR09",
            codeHash,
            expiresAt: Math.floor(Date.now() / 1000) + 600,
            attempts: 0,
            lastRequestedAt: Date.now(),
            customerId: "CUST-0001",
          },
        };
      }
      return {};
    });

    const { handler } = await import("../src/index");
    const result = await handler(makeEvent({ document_id: "LOTM900101MDFPRR09", code: "111111" }, "/auth/otp/verify"));

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body as string);
    expect(body.ok).toBe(true);
    expect(typeof body.token).toBe("string");
  });

  it("POST /auth/otp/verify con código incorrecto -> 200, ok:false, invalid_or_expired", async () => {
    ssmSend.mockResolvedValue({ Parameter: { Value: "el-secreto-real" } });
    const { hashOtpCode } = await import("../src/otp/code");

    dynamoSend.mockImplementation(async (cmd: { kind: string }) => {
      if (cmd.kind === "get") {
        return {
          Item: {
            pk: "LOTM900101MDFPRR09",
            codeHash: hashOtpCode("111111"),
            expiresAt: Math.floor(Date.now() / 1000) + 600,
            attempts: 0,
            lastRequestedAt: Date.now(),
            customerId: "CUST-0001",
          },
        };
      }
      return {};
    });

    const { handler } = await import("../src/index");
    const result = await handler(makeEvent({ document_id: "LOTM900101MDFPRR09", code: "999999" }, "/auth/otp/verify"));

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body as string)).toEqual({ ok: false, reason: "invalid_or_expired" });
  });
});
