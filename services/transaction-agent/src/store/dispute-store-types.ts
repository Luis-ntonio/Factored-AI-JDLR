import type { DisputeVerificationResult } from "@banking-agent/shared";

/**
 * Mismo patrón de tres estados que `EligibilityGetResult`/`EligibilityPutResult`
 * (`./types.ts`), aplicado a `DisputeVerificationResult`. Se deja en un
 * archivo separado (en vez de agregarlo a `./types.ts`) para no tocar los
 * tipos de elegibilidad ya existentes -- código aditivo, en paralelo (ver
 * README.md de este servicio, sección Reliability).
 *
 *  - `getResult`:
 *      - `"found"`: ya existe un `DisputeVerificationResult` persistido para
 *        este `caseId`+`turnId` -- es la ruta de idempotencia: NO se
 *        recalcula ni se re-busca ni se re-bloquea (evita duplicar la acción
 *        de bloqueo en reintentos).
 *      - `"not_found"`: no hay resultado previo, hay que calcular.
 *      - `"unavailable"`: DynamoDB no respondió tras agotar los reintentos
 *        acotados -- fallo de infraestructura, distinto de "no existe".
 *  - `putResult`:
 *      - `"ok"`: se persistió correctamente.
 *      - `"unavailable"`: DynamoDB no respondió tras agotar los reintentos.
 *
 * IMPORTANTE (pilar Reliability): el caller (`computeDisputeVerification`)
 * nunca fabrica un `DisputeVerificationResult` cuando el estado es
 * `"unavailable"` -- es una decisión que puede implicar bloquear un producto
 * financiero del cliente, no un dato de catálogo.
 */
export type DisputeGetResult =
  | { status: "found"; value: DisputeVerificationResult }
  | { status: "not_found" }
  | { status: "unavailable"; reason: "dynamodb_read_failed" };

export type DisputePutResult = { status: "ok" } | { status: "unavailable"; reason: "dynamodb_write_failed" };

/**
 * Abstrae la persistencia idempotente de `DisputeVerificationResult`. Ninguna
 * implementación puede lanzar una excepción no manejada -- los fallos de la
 * fuente de datos deben resolverse a `{ status: "unavailable" }`.
 */
export interface DisputeStore {
  getResult(caseId: string, turnId: string): Promise<DisputeGetResult>;
  putResult(result: DisputeVerificationResult, turnId: string): Promise<DisputePutResult>;
}
