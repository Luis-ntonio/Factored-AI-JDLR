import type { EligibilityResult } from "@banking-agent/shared";

/**
 * Resultado de leer/escribir el resultado de elegibilidad idempotente,
 * mismo criterio de tres estados que `CatalogLookupResult`
 * (`services/retrieval-agent/src/repository/types.ts`) pero adaptado a un
 * `Get`/`Put` puntual por clave exacta (no hay "not_found" ambiguo con
 * "vacío" para `putResult`, ver abajo):
 *
 *  - `getResult`:
 *      - `"found"`: ya existe un `EligibilityResult` persistido para este
 *        `caseId`+`turnId` -- es la ruta de idempotencia: NO se recalcula.
 *      - `"not_found"`: no hay resultado previo, hay que calcular.
 *      - `"unavailable"`: DynamoDB no respondió tras agotar los reintentos
 *        acotados -- fallo de infraestructura, distinto de "no existe".
 *  - `putResult`:
 *      - `"ok"`: se persistió correctamente.
 *      - `"unavailable"`: DynamoDB no respondió tras agotar los reintentos.
 *
 * IMPORTANTE (pilar Reliability, ver README.md de este servicio): a
 * diferencia de retrieval-agent (donde "unavailable" solo degrada una
 * respuesta informativa), acá SÍ importa que el caller nunca fabrique un
 * `EligibilityResult` cuando el estado es `"unavailable"` -- es una decisión
 * financiera, no un dato de catálogo.
 */
export type EligibilityGetResult =
  | { status: "found"; value: EligibilityResult }
  | { status: "not_found" }
  | { status: "unavailable"; reason: "dynamodb_read_failed" };

export type EligibilityPutResult = { status: "ok" } | { status: "unavailable"; reason: "dynamodb_write_failed" };

/**
 * Abstrae la persistencia idempotente de `EligibilityResult`. Ninguna
 * implementación puede lanzar una excepción no manejada -- los fallos de la
 * fuente de datos deben resolverse a `{ status: "unavailable" }`.
 */
export interface EligibilityStore {
  getResult(caseId: string, turnId: string): Promise<EligibilityGetResult>;
  putResult(result: EligibilityResult, turnId: string): Promise<EligibilityPutResult>;
}
