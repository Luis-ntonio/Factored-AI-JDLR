import type { DisputeVerificationResult, EligibilityResult, RetrievalResult } from "@banking-agent/shared";

/**
 * Input Task-a-Task esperado por verification-agent dentro de la Step
 * Function real (`banking-agent-dev-chat-orchestrator`). No es un
 * `UnderstandOutput` -- verification-agent recibe el `intent` ya resuelto
 * más el resultado crudo (sin envoltura API Gateway) que produjo
 * retrieval-agent o transaction-agent para ese intent.
 */
export interface VerificationInput {
  intent: "product_info" | "faq" | "eligibility_check" | "dispute_unrecognized_charge";
  /**
   * - `intent` en `"product_info"`/`"faq"`: un `RetrievalResult`
   *   (`@banking-agent/shared`) tal cual lo devuelve el body de
   *   retrieval-agent, SIN envoltura adicional.
   * - `intent === "eligibility_check"`: el `EligibilityHandlerResponse`
   *   COMPLETO tal cual lo devuelve el body de transaction-agent (ver
   *   `EligibilityHandlerResponseLike` abajo) -- el `EligibilityResult` real
   *   vive adentro de `result.result`, solo si `result.status === "ok"`.
   * - `intent === "dispute_unrecognized_charge"`: el `DisputeHandlerResponse`
   *   COMPLETO tal cual lo devuelve el body de transaction-agent (ver
   *   `DisputeHandlerResponseLike` abajo) -- el `DisputeVerificationResult`
   *   real vive adentro de `result.result`, solo si `result.status === "ok"`.
   */
  result: unknown;
  /**
   * `entities.document_id` del turno, tal cual lo resolvió conversation-agent
   * (ver `UnderstandOutput.entities`, `@banking-agent/shared`). Solo lo puebla
   * la Step Function para `intent === "dispute_unrecognized_charge"` -- es lo
   * mínimo necesario para que verification-agent pueda re-derivar el cliente
   * de forma independiente (`CUSTOMERS.find(...)`, ver `./verify.ts`) sin
   * recibir el objeto `entities` completo (minimiza PII en tránsito hacia este
   * servicio). Ausente/`null`/`undefined` para el resto de los intents.
   */
  documentId?: string | null;
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

/**
 * Mirror LOCAL (no importado) de `DisputeHandlerResponse`
 * (`services/transaction-agent/src/index.ts`), MISMO criterio que
 * `EligibilityHandlerResponseLike` de arriba -- solo se copia el shape del
 * envoltorio `{status, result, reason}`. El `DisputeVerificationResult` en sí
 * SÍ se importa de `@banking-agent/shared` (es un contrato compartido
 * confirmado, no un tipo interno de transaction-agent), mismo criterio que
 * `EligibilityResult`.
 */
export interface DisputeHandlerResponseLike {
  status: "ok" | "unavailable" | "rejected";
  result?: DisputeVerificationResult;
  reason?: string;
}

/** Re-exportado por conveniencia para quien importe solo desde `./types`. */
export type { DisputeVerificationResult, EligibilityResult, RetrievalResult };
