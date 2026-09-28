import type { Customer, Product, Transaction } from "../data/mock-core-banking";

/**
 * Contrato de repositorio para el flujo NUEVO y aditivo de
 * "transaction-dispute intake" (ver `hacka-info/EDA_LATAM_Bank_resumen.md`,
 * secciones 3 y 5). Es código independiente del flujo EXISTENTE de
 * elegibilidad crediticia (`compute-eligibility.ts`, `store/`) -- no lo
 * toca, no lo importa, no lo modifica.
 *
 * Mismo patrón que `services/retrieval-agent/src/repository/types.ts`:
 * un resultado discriminado en vez de `T | null`, porque para el pilar
 * Reliability (docs/EVALUATION-CRITERIA.md) hay una diferencia semántica
 * entre:
 *
 *  - `"found"`: el dato existe en la fuente, se devuelve tal cual.
 *  - `"not_found"`: la fuente respondió correctamente, pero el
 *    cliente/producto/transacción pedido genuinamente no existe (o, para
 *    los métodos de lista, ninguna fila cumple el filtro) -- nunca se
 *    inventa un valor para este caso.
 *  - `"unavailable"`: la fuente no pudo leerse (ej. DynamoDB no respondió
 *    tras agotar los reintentos acotados) -- es un fallo de
 *    infraestructura, no "no existe". El futuro Lambda de Act (fuera del
 *    alcance de esta tarea) debe construir un mensaje distinto para este
 *    caso, en vez de confundirlo con "no encontrado".
 *
 * Nota de diseño sobre los métodos que devuelven listas
 * (`listCustomerProducts`, `findCandidateTransactions`): se usa el mismo
 * discriminador de tres casos, con la convención de que un array VACÍO se
 * normaliza a `"not_found"` en vez de `{ status: "found", value: [] }`.
 * Esto evita la ambigüedad de un "found" con lista vacía (¿encontró algo o
 * no?) y hace que el caller (`verification-agent`/futuro Lambda de Act)
 * pueda ramificar con un solo `switch` sobre `status`, igual que con los
 * métodos de valor único.
 */
export type LookupResult<T> =
  | { status: "found"; value: T }
  | { status: "not_found" }
  | { status: "unavailable"; reason: string };

export type ListLookupResult<T> =
  | { status: "found"; value: readonly T[] }
  | { status: "not_found" }
  | { status: "unavailable"; reason: string };

/**
 * Filtros de matching difuso para identificar la transacción disputada a
 * partir de lo que el cliente recuerda (nunca un ID exacto de transacción --
 * si el cliente lo tuviera, no habría disputa que investigar). Los tres
 * campos son opcionales y combinables; ver `static-transaction-repository.ts`
 * para la tolerancia exacta de cada uno.
 */
export interface TransactionCandidateFilters {
  /** Substring, case-insensitive, contra `Transaction.merchant_name`. */
  merchant?: string;
  /** Monto aproximado que el cliente recuerda; se compara con tolerancia
   * (no exacto) contra `Transaction.amount`. */
  amount?: number;
  /** Rango de fechas inclusive, comparado contra la parte de fecha (sin
   * hora) de `Transaction.transaction_date`. Formato `yyyy-mm-dd`. */
  dateRange?: { from: string; to: string };
}

/**
 * Repositorio de datos del "core bancario" simulado (clientes, productos,
 * transacciones) -- abstrae la fuente concreta (`StaticTransactionRepository`
 * para este checkpoint; una futura implementación DynamoDB para cuando
 * devops provisione esas tablas, mismo patrón `CATALOG_BACKEND` que ya usa
 * retrieval-agent -- NO implementada acá, es trabajo de infra/fase de Act).
 * Ninguna implementación puede lanzar una excepción no manejada: los fallos
 * de la fuente de datos deben resolverse a `{ status: "unavailable" }`,
 * nunca a un `throw` que se propague al handler.
 */
export interface TransactionRepository {
  /** Búsqueda de cliente por documento de identidad (`document_number` en
   * el data dictionary real) -- primer paso típico del flujo antes de poder
   * buscar transacciones de ese cliente. */
  findCustomerByDocumentNumber(documentNumber: string): Promise<LookupResult<Customer>>;

  /** Productos/tarjetas del cliente -- lo que una futura acción de "bloquear
   * tarjeta" necesita para identificar qué producto bloquear. */
  listCustomerProducts(customerId: string): Promise<ListLookupResult<Product>>;

  /** Transacciones candidatas a ser la disputada por el cliente. El
   * matching es intencionalmente difuso (ver `TransactionCandidateFilters`)
   * porque el cliente rara vez recuerda un ID de transacción exacto -- solo
   * un comercio, un monto aproximado y/o una fecha aproximada. Si no se pasa
   * ningún filtro, devuelve todas las transacciones del cliente (útil para
   * que el cliente las revise y elija). */
  findCandidateTransactions(
    customerId: string,
    filters?: TransactionCandidateFilters
  ): Promise<ListLookupResult<Transaction>>;
}
