import { describe, expect, it } from "vitest";
import { verifySessionToken } from "@banking-agent/shared";
import { CUSTOMERS } from "@banking-agent/transaction-agent/dist/data/mock-core-banking";
import { attemptLogin } from "../src/login";

const SECRET = "test-secret";

// CUST-0001 real del mock: María Fernanda López Torres, CURP
// LOTM900101MDFPRR09, segment "Premium" -- ver
// services/transaction-agent/src/data/mock-core-banking.ts.
const MARIA_DOCUMENT = "LOTM900101MDFPRR09";

describe("attemptLogin", () => {
  it("documento + nombre + apellido correctos (Premium) -> token válido, role cliente_estrella", () => {
    const result = attemptLogin(
      { document_id: MARIA_DOCUMENT, first_name: "María Fernanda", last_name: "López Torres" },
      CUSTOMERS,
      SECRET
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    expect(result.role).toBe("cliente_estrella");
    expect(result.customerName).toContain("López Torres");

    const payload = verifySessionToken(result.token, SECRET);
    expect(payload?.role).toBe("cliente_estrella");
    expect(payload?.segment).toBe("Premium");
  });

  it("nombre/apellido en minúsculas y con espacios extra igual matchea (case-insensitive, trim)", () => {
    const result = attemptLogin(
      { document_id: MARIA_DOCUMENT, first_name: "  maría fernanda  ", last_name: "lópez torres" },
      CUSTOMERS,
      SECRET
    );
    expect(result.ok).toBe(true);
  });

  it("documento correcto pero nombre NO matchea -> invalid_credentials (nunca revela cuál campo falló)", () => {
    const result = attemptLogin(
      { document_id: MARIA_DOCUMENT, first_name: "Otro", last_name: "Nombre" },
      CUSTOMERS,
      SECRET
    );
    expect(result).toEqual({ ok: false, reason: "invalid_credentials" });
  });

  it("documento inexistente -> invalid_credentials (mismo mensaje que nombre no matchea, no enumeración)", () => {
    const result = attemptLogin(
      { document_id: "DOC-QUE-NO-EXISTE", first_name: "Nadie", last_name: "Real" },
      CUSTOMERS,
      SECRET
    );
    expect(result).toEqual({ ok: false, reason: "invalid_credentials" });
  });

  it("campos faltantes -> invalid_request (no llega a buscar en CUSTOMERS)", () => {
    expect(attemptLogin({}, CUSTOMERS, SECRET)).toEqual({ ok: false, reason: "invalid_request" });
    expect(attemptLogin({ document_id: MARIA_DOCUMENT }, CUSTOMERS, SECRET)).toEqual({
      ok: false,
      reason: "invalid_request",
    });
    expect(attemptLogin({ document_id: MARIA_DOCUMENT, first_name: "  " }, CUSTOMERS, SECRET)).toEqual({
      ok: false,
      reason: "invalid_request",
    });
  });

  it("un cliente Basic/Plus/Student resuelve role: cliente (no cliente_estrella)", () => {
    const nonPremium = CUSTOMERS.find((c) => c.segment !== "Premium");
    if (!nonPremium) throw new Error("el mock necesita al menos un cliente no-Premium para este test");

    const result = attemptLogin(
      { document_id: nonPremium.document_number, first_name: nonPremium.first_name, last_name: nonPremium.last_name },
      CUSTOMERS,
      SECRET
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    expect(result.role).toBe("cliente");
  });
});
