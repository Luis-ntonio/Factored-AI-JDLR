import { describe, expect, it } from "vitest";
import { emptyEntities } from "@banking-agent/shared";
import { buildUserRequestSummary } from "../src/narrative";

describe("buildUserRequestSummary — dispute_unrecognized_charge", () => {
  it("es, con merchant y disputed_amount: interpola ambos", () => {
    const entities = { ...emptyEntities(), merchant: "Amazon", disputed_amount: 150 };
    const summary = buildUserRequestSummary("dispute_unrecognized_charge", entities, "es");

    expect(summary).toContain("Amazon");
    expect(summary).toContain("150");
    expect(summary.toLowerCase()).toContain("no reconoce");
  });

  it("es, sin merchant ni disputed_amount: narrativa genérica", () => {
    const entities = emptyEntities();
    const summary = buildUserRequestSummary("dispute_unrecognized_charge", entities, "es");

    expect(summary).toBe("El usuario reportó un cargo no reconocido o indebido en su cuenta/tarjeta.");
  });

  it("pt, con merchant e valor: interpola ambos em português natural", () => {
    const entities = { ...emptyEntities(), merchant: "Amazon", disputed_amount: 150 };
    const summary = buildUserRequestSummary("dispute_unrecognized_charge", entities, "pt");

    expect(summary).toContain("Amazon");
    expect(summary).toContain("150");
    expect(summary.toLowerCase()).toContain("não reconhece");
    expect(summary).not.toMatch(/no reconoce/i);
  });

  it("pt, sem merchant nem valor: narrativa genérica", () => {
    const entities = emptyEntities();
    const summary = buildUserRequestSummary("dispute_unrecognized_charge", entities, "pt");

    expect(summary).toBe("O usuário reportou uma cobrança não reconhecida ou indevida na sua conta/cartão.");
  });

  it("nunca interpola entities.document_id, ni siquiera si viene poblado", () => {
    const entities = {
      ...emptyEntities(),
      document_id: "POISONED-DOC-ID-999",
      merchant: "Amazon",
      disputed_amount: 150,
    };
    const summaryEs = buildUserRequestSummary("dispute_unrecognized_charge", entities, "es");
    const summaryPt = buildUserRequestSummary("dispute_unrecognized_charge", entities, "pt");

    expect(summaryEs).not.toContain("POISONED-DOC-ID-999");
    expect(summaryPt).not.toContain("POISONED-DOC-ID-999");
  });
});
