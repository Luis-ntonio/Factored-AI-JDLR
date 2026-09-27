import type { FaqEntry, LanguageCode, ProductCatalogEntry, ProductType } from "@banking-agent/shared";

/**
 * Resultado de una consulta al catálogo que distingue explícitamente TRES
 * casos (en vez de solo `T | null`), porque para el pilar Reliability
 * (docs/EVALUATION-CRITERIA.md) hay una diferencia semántica importante entre:
 *
 *  - `"found"`: el dato existe en la fuente, se devuelve tal cual (con su
 *    `source`).
 *  - `"not_found"`: la fuente respondió correctamente, pero el
 *    producto/idioma pedido genuinamente no está catalogado — nunca se
 *    inventa un valor para este caso.
 *  - `"unavailable"`: la fuente no pudo leerse (ej. DynamoDB no respondió
 *    tras agotar los reintentos acotados) — es un fallo de infraestructura,
 *    no "no existe". `handle-retrieval.ts` construye un mensaje distinto
 *    ("no disponible ahora") para este caso, en vez de confundirlo con
 *    "no está en el catálogo".
 */
export type CatalogLookupResult<T> =
  | { status: "found"; value: T }
  | { status: "not_found" }
  | { status: "unavailable"; reason: string };

/**
 * Repositorio de catálogo — abstrae la fuente de datos concreta
 * (`StaticCatalogRepository` para este checkpoint, `DynamoDbCatalogRepository`
 * para el modelo de infra real, ver README.md de este servicio). Ninguna
 * implementación puede lanzar una excepción no manejada: los fallos de la
 * fuente de datos deben resolverse a `{ status: "unavailable" }`, nunca a un
 * `throw` que se propague al handler.
 */
export interface CatalogRepository {
  getProduct(productType: ProductType): Promise<CatalogLookupResult<ProductCatalogEntry>>;
  listFaqs(language: LanguageCode): Promise<CatalogLookupResult<FaqEntry[]>>;
}
