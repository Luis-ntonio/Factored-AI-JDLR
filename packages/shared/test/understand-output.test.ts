import { describe, expect, it } from "vitest";
import {
  emptyEntities,
  isUnderstandOutput,
  INTENTS,
  REQUIRED_ENTITIES_BY_INTENT,
  UnderstandOutput,
} from "../src/contracts/understand-output";

function validOutput(): UnderstandOutput {
  return {
    intent: "faq",
    language: "es",
    entities: emptyEntities(),
    missing_fields: [],
    context: {
      caseId: "case-1",
      customerId: null,
      turnId: "msg-1",
      degraded: false,
      degradedReason: "none",
      historyTurns: 0,
    },
  };
}

describe("isUnderstandOutput", () => {
  it("acepta un output válido", () => {
    expect(isUnderstandOutput(validOutput())).toBe(true);
  });

  it("rechaza un intent fuera del enum", () => {
    const bad = { ...validOutput(), intent: "make_transfer" };
    expect(isUnderstandOutput(bad)).toBe(false);
  });

  it("rechaza un idioma no soportado", () => {
    const bad = { ...validOutput(), language: "en" };
    expect(isUnderstandOutput(bad)).toBe(false);
  });

  it("rechaza missing_fields con una key que no es de Entities", () => {
    const bad = { ...validOutput(), missing_fields: ["not_a_real_field"] };
    expect(isUnderstandOutput(bad)).toBe(false);
  });

  it("rechaza si falta context.caseId", () => {
    const bad = validOutput();
    // @ts-expect-error -- prueba deliberada de forma inválida
    delete bad.context.caseId;
    expect(isUnderstandOutput(bad)).toBe(false);
  });

  it("acepta dispute_unrecognized_charge como intent válido", () => {
    const output = { ...validOutput(), intent: "dispute_unrecognized_charge" as const };
    expect(isUnderstandOutput(output)).toBe(true);
  });
});

describe("emptyEntities", () => {
  it("incluye los 4 campos nuevos de disputa, todos en null", () => {
    const entities = emptyEntities();
    expect(entities.disputed_amount).toBeNull();
    expect(entities.merchant).toBeNull();
    expect(entities.transaction_date).toBeNull();
    expect(entities.dispute_reason).toBeNull();
  });
});

describe("REQUIRED_ENTITIES_BY_INTENT", () => {
  it("incluye dispute_unrecognized_charge en el enum de intents", () => {
    expect(INTENTS).toContain("dispute_unrecognized_charge");
  });

  it("exige exactamente product_type y document_id para dispute_unrecognized_charge (la regla OR de monto/comercio/fecha es responsabilidad de policy-agent, no de esta matriz)", () => {
    expect(REQUIRED_ENTITIES_BY_INTENT.dispute_unrecognized_charge).toEqual(["product_type", "document_id"]);
  });
});
