import type { DisputeVerificationResult } from "@banking-agent/shared";
import type { DisputeGetResult, DisputePutResult, DisputeStore } from "./dispute-store-types";

/**
 * Test double en memoria, mismo criterio que `InMemoryEligibilityStore`
 * (`./in-memory-eligibility-store.ts`): NUNCA se usa desde `src/index.ts` (el
 * handler de Lambda) -- ahí solo se usa `DynamoDbDisputeStore`. Sirve para
 * ejercitar `computeDisputeVerification` (incluida la rama de idempotencia)
 * sin depender de AWS real ni de mockear `@aws-sdk/lib-dynamodb` a mano en
 * cada test.
 */
export class InMemoryDisputeStore implements DisputeStore {
  private readonly items = new Map<string, DisputeVerificationResult>();
  /** Contador de invocaciones a `getResult`, expuesto para que los tests
   * puedan asertar explícitamente que la segunda llamada con el mismo
   * `caseId`+`turnId` no dispara un nuevo cálculo/búsqueda/bloqueo aguas
   * arriba. */
  public getResultCalls = 0;

  private key(caseId: string, turnId: string): string {
    return `${caseId}:${turnId}`;
  }

  async getResult(caseId: string, turnId: string): Promise<DisputeGetResult> {
    this.getResultCalls += 1;
    const existing = this.items.get(this.key(caseId, turnId));
    if (!existing) return { status: "not_found" };
    return { status: "found", value: existing };
  }

  async putResult(result: DisputeVerificationResult, turnId: string): Promise<DisputePutResult> {
    this.items.set(this.key(result.caseId, turnId), result);
    return { status: "ok" };
  }
}
