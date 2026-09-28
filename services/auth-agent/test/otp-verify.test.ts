import { describe, expect, it } from "vitest";
import { verifySessionToken } from "@banking-agent/shared";
import { CUSTOMERS } from "@banking-agent/transaction-agent/dist/data/mock-core-banking";
import { hashOtpCode } from "../src/otp/code";
import { attemptOtpVerify } from "../src/otp/verify";
import { MAX_VERIFY_ATTEMPTS } from "../src/otp/store";
import { FakeOtpStore } from "./fakes/fake-otp-store";

const SECRET = "test-secret";
const MARIA_DOCUMENT = "LOTM900101MDFPRR09";
const MARIA_CUSTOMER_ID = "CUST-0001";

function seedValidCode(store: FakeOtpStore, code: string, overrides: Partial<Parameters<FakeOtpStore["setRaw"]>[1]> = {}) {
  const now = Date.now();
  store.setRaw(MARIA_DOCUMENT, {
    documentId: MARIA_DOCUMENT,
    codeHash: hashOtpCode(code),
    expiresAt: Math.floor(now / 1000) + 600,
    attempts: 0,
    lastRequestedAt: now,
    customerId: MARIA_CUSTOMER_ID,
    ...overrides,
  });
}

describe("attemptOtpVerify", () => {
  it("código correcto -> token válido con el mismo role/shape que attemptLogin, y consume el código (un solo uso)", async () => {
    const store = new FakeOtpStore();
    seedValidCode(store, "123456");

    const result = await attemptOtpVerify(
      { document_id: MARIA_DOCUMENT, code: "123456" },
      { customers: CUSTOMERS, store: store as unknown as Parameters<typeof attemptOtpVerify>[1]["store"], sessionSecret: SECRET }
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    expect(result.role).toBe("cliente_estrella");
    expect(result.customerName).toContain("López Torres");

    const payload = verifySessionToken(result.token, SECRET);
    expect(payload?.role).toBe("cliente_estrella");

    // Consumido -- una segunda verificación con el mismo código ya no encuentra nada.
    expect(store.getRaw(MARIA_DOCUMENT)).toBeUndefined();
  });

  it("ningún código pendiente para ese documento -> invalid_or_expired", async () => {
    const store = new FakeOtpStore();
    const result = await attemptOtpVerify(
      { document_id: MARIA_DOCUMENT, code: "123456" },
      { customers: CUSTOMERS, store: store as unknown as Parameters<typeof attemptOtpVerify>[1]["store"], sessionSecret: SECRET }
    );
    expect(result).toEqual({ ok: false, reason: "invalid_or_expired" });
  });

  it("código incorrecto -> invalid_or_expired (mismo mensaje genérico) e incrementa attempts", async () => {
    const store = new FakeOtpStore();
    seedValidCode(store, "123456");

    const result = await attemptOtpVerify(
      { document_id: MARIA_DOCUMENT, code: "000000" },
      { customers: CUSTOMERS, store: store as unknown as Parameters<typeof attemptOtpVerify>[1]["store"], sessionSecret: SECRET }
    );

    expect(result).toEqual({ ok: false, reason: "invalid_or_expired" });
    expect(store.getRaw(MARIA_DOCUMENT)?.attempts).toBe(1);
  });

  it("código expirado -> invalid_or_expired, sin importar que matchee", async () => {
    const store = new FakeOtpStore();
    seedValidCode(store, "123456", { expiresAt: Math.floor(Date.now() / 1000) - 10 });

    const result = await attemptOtpVerify(
      { document_id: MARIA_DOCUMENT, code: "123456" },
      { customers: CUSTOMERS, store: store as unknown as Parameters<typeof attemptOtpVerify>[1]["store"], sessionSecret: SECRET }
    );
    expect(result).toEqual({ ok: false, reason: "invalid_or_expired" });
  });

  it(`${MAX_VERIFY_ATTEMPTS} intentos fallidos previos -> too_many_attempts, ni siquiera compara el código`, async () => {
    const store = new FakeOtpStore();
    seedValidCode(store, "123456", { attempts: MAX_VERIFY_ATTEMPTS });

    const result = await attemptOtpVerify(
      { document_id: MARIA_DOCUMENT, code: "123456" }, // código CORRECTO, igual debe bloquear
      { customers: CUSTOMERS, store: store as unknown as Parameters<typeof attemptOtpVerify>[1]["store"], sessionSecret: SECRET }
    );
    expect(result).toEqual({ ok: false, reason: "too_many_attempts" });
  });

  it("document_id/code faltante -> invalid_request", async () => {
    const store = new FakeOtpStore();
    const result = await attemptOtpVerify(
      { document_id: MARIA_DOCUMENT },
      { customers: CUSTOMERS, store: store as unknown as Parameters<typeof attemptOtpVerify>[1]["store"], sessionSecret: SECRET }
    );
    expect(result).toEqual({ ok: false, reason: "invalid_request" });
  });
});
