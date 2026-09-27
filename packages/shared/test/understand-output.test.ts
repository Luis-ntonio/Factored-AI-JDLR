import { describe, expect, it } from "vitest";
import { emptyEntities, isUnderstandOutput, UnderstandOutput } from "../src/contracts/understand-output";

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
});
