/**
 * Contrato de salida de la capa "Act" — parte informativa (retrieval-agent):
 * catálogo de productos de crédito (tasas, requisitos, condiciones) y FAQs
 * asociadas. El cálculo de elegibilidad en sí (`eligibility_check`) NO vive
 * acá — lo produce transaction-agent con su propio contrato, ver
 * `EligibilityResult` en `./eligibility-result.ts` (dominio distinto: ese es
 * el contrato de elegibilidad, este es el de catálogo/FAQ).
 *
 * Productor:
 *  - `services/retrieval-agent` — lee `UnderstandOutput.intent` (solo
 *    `"product_info"` y `"faq"`, los dos únicos intents que policy-agent
 *    autoriza hacia esta pieza) y `UnderstandOutput.entities.product_type` /
 *    `UnderstandOutput.language`, y devuelve este contrato.
 *
 * Consumidores:
 *  - verification-agent (fase posterior) — revisa este resultado antes de
 *    que llegue al usuario cuando involucra datos específicos de
 *    cliente/cuenta (no aplica a FAQs genéricas de catálogo, que no
 *    dependen de ningún dato del cliente).
 *  - frontend-dev (`apps/web`, fase posterior) — renderiza `product`/`faqs`
 *    o el mensaje de "no disponible" cuando `found = false`.
 *
 * Principio de Reliability/Security no-negociable (docs/EVALUATION-CRITERIA.md,
 * pilar Reliability): retrieval-agent NUNCA inventa ni extrapola un dato que
 * no esté en la fuente (catálogo estático simulado, ver
 * `services/retrieval-agent/README.md` para la decisión de infra). Cada
 * `ProductCatalogEntry`/`FaqEntry` retornado lleva su propio campo `source`
 * explícito. Si el `productType`/idioma pedido no está en la fuente, o si la
 * fuente no pudo leerse (ej. fallo de DynamoDB tras agotar reintentos), la
 * respuesta es `found: false` con `notes` explicando el motivo — nunca una
 * alucinación ni una excepción sin manejar.
 *
 * Supuesto de moneda/unidad (mismo trade-off documentado para `income`/
 * `requested_amount` en `understand-output.ts`): `interestRateRange` es
 * porcentaje anual (no se resuelve TEA vs. TNA por producto más allá de la
 * FAQ que explica la diferencia en prosa) y `amountRange` son montos crudos
 * sin moneda explícita — se asume una única moneda implícita para la demo,
 * igual que el resto del pipeline.
 */

import type { DocumentType, EmploymentStatus, LanguageCode, ProductType } from "./understand-output";

/** Rango numérico simple [min, max] — reusado para tasa, plazo y monto. */
export interface NumericRange {
  min: number;
  max: number;
}

/** Rango de plazo del crédito, en meses. */
export interface TermRange {
  minMonths: number;
  maxMonths: number;
}

/**
 * Requisitos de elegibilidad DECLARADOS por el catálogo para un producto
 * (no es un veredicto de elegibilidad de un cliente concreto — eso lo hace
 * transaction-agent). Son las condiciones generales publicadas del producto.
 */
export interface ProductRequirements {
  /** Ingreso mensual mínimo declarado por el catálogo, misma unidad/moneda
   * implícita que `Entities.income` (sin resolución de moneda, ver arriba). */
  minIncome: number;
  acceptedDocumentTypes: DocumentType[];
  acceptedEmploymentStatus: EmploymentStatus[];
}

/** Una entrada completa de catálogo para un `ProductType` real (excluye
 * `"unknown"`, que no es un producto). */
export interface ProductCatalogEntry {
  productType: ProductType;
  /** % anual. Ver nota de moneda/unidad arriba. */
  interestRateRange: NumericRange;
  requirements: ProductRequirements;
  termRange: TermRange;
  amountRange: NumericRange;
  /** Identificador de la fuente exacta de este dato (ej.
   * `"internal_catalog_v1"`). Nunca vacío — es la trazabilidad mínima para
   * que nadie aguas abajo confunda esto con un dato inventado en runtime. */
  source: string;
}

/** Una FAQ del flujo de crédito, en UN idioma específico (no bilingüe en el
 * mismo objeto — cada idioma es una entrada separada con su propio `id`
 * lógico de tema, ver `services/retrieval-agent/src/data/catalog.ts`). */
export interface FaqEntry {
  /** Identificador estable del TEMA de la FAQ (compartido entre el par
   * es/pt de la misma pregunta, ej. `"faq-business-hours"`), no único por
   * idioma — útil para trazabilidad/telemetría cross-idioma. */
  id: string;
  language: LanguageCode;
  question: string;
  answer: string;
  source: string;
}

/**
 * Contrato de salida exacto de retrieval-agent. `intent` está restringido a
 * los dos únicos valores que policy-agent autoriza hacia esta pieza
 * (`auto-faq-always` y `auto-product-info-complete` en `policies.yaml`) —
 * `eligibility_check`/`escalation_request`/`unknown` nunca deberían llegar
 * acá, pero si llegaran (ej. bug de orquestación), `handleRetrieval` responde
 * `found: false` con una nota explícita en vez de crashear (ver
 * `services/retrieval-agent/src/handle-retrieval.ts`).
 */
export interface RetrievalResult {
  intent: "product_info" | "faq";
  language: LanguageCode;
  found: boolean;
  /** Presente solo si `intent === "product_info"` y `found === true`. */
  product?: ProductCatalogEntry;
  /** Presente solo si `intent === "faq"` y `found === true`. Puede ser un
   * array vacío en teoría (idioma sin FAQs cargadas) — se trata igual como
   * `found: false` con `notes`, ver lógica en `handle-retrieval.ts`. */
  faqs?: FaqEntry[];
  /** Explica por qué `found = false` (no en catálogo vs. fuente no
   * disponible), o cualquier aclaración relevante (ej. degradación). */
  notes?: string;
}
