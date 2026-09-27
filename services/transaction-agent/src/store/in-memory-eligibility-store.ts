import type { EligibilityResult } from "@banking-agent/shared";
import type { EligibilityGetResult, EligibilityPutResult, EligibilityStore } from "./types";

/**
 * DESVIACIÓN DOCUMENTADA respecto al listado de archivos sugerido en la
 * tarea original (que solo pedía `src/store/eligibility-store.ts`): se
 * agrega este archivo adicional como test double en memoria, NO como pieza
 * de producción. Razón: `test/pipeline-integration.test.ts` necesita
 * ejercitar `computeEligibility` (incluida la rama de idempotencia) sin
 * depender de AWS real ni de mockear `@aws-sdk/lib-dynamodb` a mano en cada
 * test de integración -- mismo espíritu que
 * `services/retrieval-agent/src/repository/static-catalog-repository.ts`
 * (un backend simple, explícito, sin AWS, para poder probar la lógica de
 * negocio). Este store NUNCA se usa desde `src/index.ts` (el handler de
 * Lambda) -- ahí solo se usa `DynamoDbEligibilityStore`.
 */
export class InMemoryEligibilityStore implements EligibilityStore {
  private readonly items = new Map<string, EligibilityResult>();
  /** Contador de invocaciones a `getResult`, expuesto para que los tests
   * puedan asertar explícitamente que la segunda llamada con el mismo
   * `caseId`+`turnId` no dispara un nuevo cálculo aguas arriba. */
  public getResultCalls = 0;

  private key(caseId: string, turnId: string): string {
    return `${caseId}:${turnId}`;
  }

  async getResult(caseId: string, turnId: string): Promise<EligibilityGetResult> {
    this.getResultCalls += 1;
    const existing = this.items.get(this.key(caseId, turnId));
    if (!existing) return { status: "not_found" };
    return { status: "found", value: existing };
  }

  async putResult(result: EligibilityResult, turnId: string): Promise<EligibilityPutResult> {
    this.items.set(this.key(result.caseId, turnId), result);
    return { status: "ok" };
  }
}
