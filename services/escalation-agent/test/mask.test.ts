import { describe, expect, it } from "vitest";
import { maskDocumentId, redactRawDocumentId } from "../src/mask";

describe("maskDocumentId", () => {
  it("null/undefined -> null", () => {
    expect(maskDocumentId(null)).toBeNull();
    expect(maskDocumentId(undefined)).toBeNull();
  });

  it("string vacío o solo espacios -> null", () => {
    expect(maskDocumentId("")).toBeNull();
    expect(maskDocumentId("   ")).toBeNull();
  });

  it("longitud <= 4 -> enmascarado por completo", () => {
    expect(maskDocumentId("1234")).toBe("****");
    expect(maskDocumentId("12")).toBe("**");
  });

  it("longitud > 4 -> mantiene los últimos 4 caracteres visibles", () => {
    expect(maskDocumentId("12345678900")).toBe("*******8900");
    expect(maskDocumentId("ABCDE")).toBe("*BCDE");
  });

  it("hace trim antes de enmascarar", () => {
    expect(maskDocumentId("  12345678900  ")).toBe("*******8900");
  });
});

describe("redactRawDocumentId", () => {
  it("reemplaza toda ocurrencia del valor crudo en strings anidados", () => {
    const value = {
      a: "documento 12345678900 detectado",
      nested: { b: ["ver 12345678900 otra vez", "sin match"] },
      c: 42,
      d: null,
    };
    const result = redactRawDocumentId(value, "12345678900", "*******8900");
    expect(result.a).toBe("documento *******8900 detectado");
    expect(result.nested.b[0]).toBe("ver *******8900 otra vez");
    expect(result.nested.b[1]).toBe("sin match");
    expect(result.c).toBe(42);
    expect(result.d).toBeNull();
  });

  it("no toca nada si rawDocumentId es null/undefined", () => {
    const value = { a: "algo" };
    expect(redactRawDocumentId(value, null, null)).toEqual(value);
    expect(redactRawDocumentId(value, undefined, null)).toEqual(value);
  });

  it("no redacta valores crudos demasiado cortos (por debajo del umbral mínimo)", () => {
    const value = { a: "el monto es 1234 pesos" };
    // "1234" tiene longitud 4, por debajo de MIN_REDACTABLE_LENGTH (5) --
    // deliberadamente no se toca para evitar falsos positivos sobre números
    // no relacionados.
    const result = redactRawDocumentId(value, "1234", "****");
    expect(result.a).toBe("el monto es 1234 pesos");
  });
});
