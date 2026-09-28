import type { OtpGetResult, OtpItem, OtpWriteResult } from "../../src/otp/store";

/** Fake en memoria de `DynamoDbOtpStore` -- typed estructuralmente (mismos
 * métodos/shapes), nunca toca AWS real. Mismo criterio que los fakes de
 * `store`/`repository` ya usados en `services/transaction-agent/test/`. */
export class FakeOtpStore {
  private items = new Map<string, OtpItem>();
  public failNextGet = false;
  public failNextPut = false;

  async get(documentId: string): Promise<OtpGetResult> {
    if (this.failNextGet) {
      this.failNextGet = false;
      return { status: "unavailable" };
    }
    const item = this.items.get(documentId);
    if (!item) return { status: "not_found" };
    return { status: "found", value: item };
  }

  async put(item: { documentId: string; codeHash: string; customerId: string; lastRequestedAt: number }): Promise<OtpWriteResult> {
    if (this.failNextPut) {
      this.failNextPut = false;
      return { status: "unavailable" };
    }
    const nowSeconds = Math.floor(item.lastRequestedAt / 1000);
    this.items.set(item.documentId, {
      documentId: item.documentId,
      codeHash: item.codeHash,
      expiresAt: nowSeconds + 10 * 60,
      attempts: 0,
      lastRequestedAt: item.lastRequestedAt,
      customerId: item.customerId,
    });
    return { status: "ok" };
  }

  async incrementAttempts(documentId: string): Promise<OtpWriteResult> {
    const item = this.items.get(documentId);
    if (item) item.attempts += 1;
    return { status: "ok" };
  }

  async delete(documentId: string): Promise<OtpWriteResult> {
    this.items.delete(documentId);
    return { status: "ok" };
  }

  /** Solo para tests -- inspecciona/fuerza el estado directamente. */
  setRaw(documentId: string, item: OtpItem): void {
    this.items.set(documentId, item);
  }

  getRaw(documentId: string): OtpItem | undefined {
    return this.items.get(documentId);
  }
}
