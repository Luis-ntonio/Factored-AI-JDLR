import { createHash, randomInt, timingSafeEqual } from "node:crypto";

/**
 * Generación/hash/verificación de códigos OTP de 6 dígitos -- lógica pura,
 * sin AWS, testeable sin mocks (mismo criterio que `../login.ts`).
 *
 * Nunca se guarda el código en texto plano (ni en DynamoDB ni en logs) --
 * solo su hash SHA-256. `codeMatches` compara con `timingSafeEqual`, nunca
 * `===`, para no filtrar por timing cuánto del código matcheó.
 */

const CODE_LENGTH = 6;

export function generateOtpCode(): string {
  const value = randomInt(0, 10 ** CODE_LENGTH);
  return value.toString().padStart(CODE_LENGTH, "0");
}

export function hashOtpCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

export function codeMatches(code: string, hash: string): boolean {
  const actual = Buffer.from(hashOtpCode(code), "hex");
  const expected = Buffer.from(hash, "hex");
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}
