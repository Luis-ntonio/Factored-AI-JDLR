import { describe, expect, it } from "vitest";
import { CUSTOMERS } from "@banking-agent/transaction-agent/dist/data/mock-core-banking";
import { findVerifiedCustomer } from "../src/login";

// CUST-0001 real del mock: María Fernanda López Torres, CURP
// LOTM900101MDFPRR09, segment "Premium" -- ver
// services/transaction-agent/src/data/mock-core-banking.ts.
const MARIA_DOCUMENT = "LOTM900101MDFPRR09";

describe("findVerifiedCustomer", () => {
  it("documento + nombre + apellido correctos -> devuelve el Customer real", () => {
    const customer = findVerifiedCustomer(
      { document_id: MARIA_DOCUMENT, first_name: "María Fernanda", last_name: "López Torres" },
      CUSTOMERS
    );
    expect(customer?.customer_id).toBe("CUST-0001");
    expect(customer?.segment).toBe("Premium");
  });

  it("nombre/apellido en minúsculas y con espacios extra igual matchea (case-insensitive, trim)", () => {
    const customer = findVerifiedCustomer(
      { document_id: MARIA_DOCUMENT, first_name: "  maría fernanda  ", last_name: "lópez torres" },
      CUSTOMERS
    );
    expect(customer).not.toBeNull();
  });

  it("nombre/apellido SIN tildes igual matchea (bug real encontrado en smoke test manual -- usuario tipeando sin acentos)", () => {
    const customer = findVerifiedCustomer(
      { document_id: MARIA_DOCUMENT, first_name: "Maria Fernanda", last_name: "Lopez Torres" },
      CUSTOMERS
    );
    expect(customer).not.toBeNull();
  });

  it("documento correcto pero nombre NO matchea -> null (nunca revela cuál campo falló)", () => {
    const customer = findVerifiedCustomer(
      { document_id: MARIA_DOCUMENT, first_name: "Otro", last_name: "Nombre" },
      CUSTOMERS
    );
    expect(customer).toBeNull();
  });

  it("documento inexistente -> null (mismo resultado que nombre no matchea, no enumeración)", () => {
    const customer = findVerifiedCustomer(
      { document_id: "DOC-QUE-NO-EXISTE", first_name: "Nadie", last_name: "Real" },
      CUSTOMERS
    );
    expect(customer).toBeNull();
  });

  it("campos faltantes -> null (no llega a buscar en CUSTOMERS)", () => {
    expect(findVerifiedCustomer({}, CUSTOMERS)).toBeNull();
    expect(findVerifiedCustomer({ document_id: MARIA_DOCUMENT }, CUSTOMERS)).toBeNull();
    expect(findVerifiedCustomer({ document_id: MARIA_DOCUMENT, first_name: "  " }, CUSTOMERS)).toBeNull();
  });

  it("resuelve un cliente Basic/Plus/Student no-Premium igual que uno Premium", () => {
    const nonPremium = CUSTOMERS.find((c) => c.segment !== "Premium");
    if (!nonPremium) throw new Error("el mock necesita al menos un cliente no-Premium para este test");

    const customer = findVerifiedCustomer(
      { document_id: nonPremium.document_number, first_name: nonPremium.first_name, last_name: nonPremium.last_name },
      CUSTOMERS
    );
    expect(customer?.customer_id).toBe(nonPremium.customer_id);
  });
});
