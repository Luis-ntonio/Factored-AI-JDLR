import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { signSessionToken } from "@banking-agent/shared";
import { resolveRole } from "../src/auth/resolve-role";
import { resetSessionSecretCache } from "../src/auth/session-config";

/**
 * Tests de `resolveRole` con `@aws-sdk/client-ssm` MOCKEADO a nivel de
 * módulo -- nunca pega a AWS real. Mismo patrón que `understand-backend.test.ts`.
 */

const { ssmSend } = vi.hoisted(() => ({ ssmSend: vi.fn() }));

vi.mock("@aws-sdk/client-ssm", () => ({
  SSMClient: vi.fn().mockImplementation(() => ({ send: ssmSend })),
  GetParameterCommand: vi.fn().mockImplementation((input: unknown) => ({ input })),
}));

const SECRET = "el-secreto-real";
const ORIGINAL_PARAM_NAME = process.env.SESSION_TOKEN_SECRET_PARAM_NAME;

beforeEach(() => {
  ssmSend.mockReset();
  resetSessionSecretCache();
  process.env.SESSION_TOKEN_SECRET_PARAM_NAME = "/dev/auth/session_token_secret";
});

afterEach(() => {
  if (ORIGINAL_PARAM_NAME === undefined) delete process.env.SESSION_TOKEN_SECRET_PARAM_NAME;
  else process.env.SESSION_TOKEN_SECRET_PARAM_NAME = ORIGINAL_PARAM_NAME;
});

describe("resolveRole", () => {
  it("sin sessionToken -> anonimo, nunca llama a SSM", async () => {
    const result = await resolveRole(null);
    expect(result).toEqual({ role: "anonimo", customerId: null });
    expect(ssmSend).not.toHaveBeenCalled();
  });

  it("token real firmado con el secreto correcto -> resuelve role/customerId reales", async () => {
    ssmSend.mockResolvedValue({ Parameter: { Value: SECRET } });
    const token = signSessionToken(
      { customerId: "CUST-0001", documentId: "LOTM900101MDFPRR09", segment: "Premium", role: "cliente_estrella" },
      SECRET
    );

    const result = await resolveRole(token);
    expect(result).toEqual({ role: "cliente_estrella", customerId: "CUST-0001" });
  });

  it("token firmado con OTRO secreto -> degrada a anonimo, nunca lanza", async () => {
    ssmSend.mockResolvedValue({ Parameter: { Value: SECRET } });
    const token = signSessionToken(
      { customerId: "CUST-0001", documentId: "doc", segment: "Basic", role: "cliente" },
      "secreto-equivocado"
    );

    const result = await resolveRole(token);
    expect(result).toEqual({ role: "anonimo", customerId: null });
  });

  it("SSM no disponible -> degrada a anonimo (nunca bloquea el turno)", async () => {
    ssmSend.mockRejectedValue(new Error("AccessDenied"));
    const token = signSessionToken(
      { customerId: "CUST-0001", documentId: "doc", segment: "Premium", role: "cliente_estrella" },
      SECRET
    );

    const result = await resolveRole(token);
    expect(result).toEqual({ role: "anonimo", customerId: null });
  });

  it("token con formato basura -> anonimo, nunca lanza", async () => {
    ssmSend.mockResolvedValue({ Parameter: { Value: SECRET } });
    const result = await resolveRole("esto-no-es-un-token");
    expect(result).toEqual({ role: "anonimo", customerId: null });
  });
});
