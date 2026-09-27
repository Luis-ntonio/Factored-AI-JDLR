import type { EligibilityResult, RetrievalResult } from "@banking-agent/shared";

/**
 * Input Task-a-Task esperado por verification-agent dentro de la Step
 * Function real (`banking-agent-dev-chat-orchestrator`). No es un
 * `UnderstandOutput` -- verification-agent recibe el `intent` ya resuelto
 * más el resultado crudo (sin envoltura API Gateway) que produjo
 * retrieval-agent o transaction-agent para ese intent.
 */
export interface VerificationInput {
  intent: "product_info" | "faq" | "eligibility_check";
  /**
   * - `intent` en `"product_info"`/`"faq"`: un `RetrievalResult`
   *   (`@banking-agent/shared`) tal cual lo devuelve el body de
   *   retrieval-agent, SIN envoltura adicional.
   * - `intent === "eligibility_check"`: el `EligibilityHandlerResponse`
   *   COMPLETO tal cual lo devuelve el body de transaction-agent (ver
   *   `EligibilityHandlerResponseLike` abajo) -- el `EligibilityResult` real
   *   vive adentro de `result.result`, solo si `result.status === "ok"`.
   */
  result: unknown;
}

/**
 * Mirror LOCAL (no importado) de `EligibilityHandlerResponse`
 * (`services/transaction-agent/src/index.ts`). Deliberado: verification-agent
 * no depende de `@banking-agent/transaction-agent` como paquete (mismo
 * criterio documentado en `./config/load-thresholds.ts` -- cada servicio de
 * `services/*` es su propio paquete Lambda independiente). Si el contrato
 * real de transaction-agent cambia, este mirror debe actualizarse a mano
 * (limitación conocida, ver README.md).
 */
export interface EligibilityHandlerResponseLike {
  status: "ok" | "unavailable" | "rejected";
  result?: EligibilityResult;
  reason?: string;
}

/** Re-exportado por conveniencia para quien importe solo desde `./types`. */
export type { EligibilityResult, RetrievalResult };
