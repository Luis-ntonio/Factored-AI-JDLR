import { describe, expect, it } from "vitest";
import { codeMatches, generateOtpCode, hashOtpCode } from "../src/otp/code";

describe("otp/code", () => {
  it("generateOtpCode siempre produce 6 dígitos numéricos (con padding de ceros a la izquierda)", () => {
    for (let i = 0; i < 50; i++) {
      const code = generateOtpCode();
      expect(code).toMatch(/^\d{6}$/);
    }
  });

  it("hashOtpCode es determinístico para el mismo código", () => {
    expect(hashOtpCode("123456")).toBe(hashOtpCode("123456"));
  });

  it("hashOtpCode nunca devuelve el código en texto plano", () => {
    expect(hashOtpCode("123456")).not.toContain("123456");
  });

  it("codeMatches: true para el código correcto, false para cualquier otro", () => {
    const hash = hashOtpCode("654321");
    expect(codeMatches("654321", hash)).toBe(true);
    expect(codeMatches("000000", hash)).toBe(false);
    expect(codeMatches("65432", hash)).toBe(false);
  });
});
