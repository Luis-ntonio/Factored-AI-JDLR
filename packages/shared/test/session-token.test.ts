import { describe, expect, it } from "vitest";
import { roleFromSegment, signSessionToken, verifySessionToken } from "../src/session-token";

const SECRET = "test-secret-never-use-in-prod";

function baseClaims() {
  return { customerId: "CUST-0001", documentId: "LOTM900101MDFPRR09", segment: "Premium", role: "cliente_estrella" as const };
}

describe("signSessionToken / verifySessionToken", () => {
  it("un token recién firmado verifica correctamente y devuelve los mismos claims", () => {
    const token = signSessionToken(baseClaims(), SECRET);
    const result = verifySessionToken(token, SECRET);
    expect(result).toMatchObject(baseClaims());
    expect(result?.exp).toBeGreaterThan(result?.iat ?? 0);
  });

  it("un token firmado con OTRO secreto falla la verificación (null, nunca lanza)", () => {
    const token = signSessionToken(baseClaims(), SECRET);
    expect(verifySessionToken(token, "otro-secreto")).toBeNull();
  });

  it("un token expirado (ttl negativo) devuelve null", () => {
    const token = signSessionToken(baseClaims(), SECRET, -10);
    expect(verifySessionToken(token, SECRET)).toBeNull();
  });

  it("un token con formato corrupto (sin punto separador) devuelve null, nunca lanza", () => {
    expect(verifySessionToken("no-es-un-token-valido", SECRET)).toBeNull();
  });

  it("un token con payload manipulado (firma no matchea) devuelve null", () => {
    const token = signSessionToken(baseClaims(), SECRET);
    const [payloadB64] = token.split(".");
    const tampered = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf-8"));
    tampered.role = "cliente_estrella";
    tampered.segment = "Basic"; // intento de escalar de "cliente" a "cliente_estrella" manipulando el payload
    const tamperedPayloadB64 = Buffer.from(JSON.stringify(tampered)).toString("base64url");
    const tamperedToken = `${tamperedPayloadB64}.${token.split(".")[1]}`;
    expect(verifySessionToken(tamperedToken, SECRET)).toBeNull();
  });

  it("string vacío o basura arbitraria nunca lanza, siempre null", () => {
    expect(verifySessionToken("", SECRET)).toBeNull();
    expect(verifySessionToken("...", SECRET)).toBeNull();
    expect(verifySessionToken("a.b.c.d", SECRET)).toBeNull();
  });
});

describe("roleFromSegment", () => {
  it("Premium -> cliente_estrella", () => {
    expect(roleFromSegment("Premium")).toBe("cliente_estrella");
  });

  it("Basic/Plus/Student -> cliente", () => {
    expect(roleFromSegment("Basic")).toBe("cliente");
    expect(roleFromSegment("Plus")).toBe("cliente");
    expect(roleFromSegment("Student")).toBe("cliente");
  });

  it("un segment desconocido degrada a cliente (nunca a cliente_estrella por default)", () => {
    expect(roleFromSegment("segment-inventado")).toBe("cliente");
  });
});
