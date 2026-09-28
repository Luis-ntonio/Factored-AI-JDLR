import type { Entities, KnownEntitiesSummary } from "@banking-agent/shared";

/**
 * Proyecta `Entities` -> `KnownEntitiesSummary`, excluyendo explícitamente
 * `document_id` (PII directa -- ver `EscalationSummary.maskedDocumentId` para
 * la versión enmascarada, `src/mask.ts`). El resto de los campos de
 * `Entities` no es PII directa según `docs/CONTRACTS.md` sección 4.3, así
 * que se exponen tal cual (o `null` si todavía no se conocen).
 */
export function summarizeKnownEntities(entities: Entities): KnownEntitiesSummary {
  return {
    income: entities.income ?? null,
    employment_status: entities.employment_status ?? null,
    requested_amount: entities.requested_amount ?? null,
    document_type: entities.document_type ?? null,
    product_type: entities.product_type ?? null,
    existing_customer: entities.existing_customer ?? null,
    disputed_amount: entities.disputed_amount ?? null,
    merchant: entities.merchant ?? null,
    transaction_date: entities.transaction_date ?? null,
    dispute_reason: entities.dispute_reason ?? null,
  };
}

/** Valor por defecto cuando no hay ninguna `Entities` disponible (camino de
 * mejor esfuerzo ante input malformado, ver `src/fallback.ts`). */
export function emptyKnownEntities(): KnownEntitiesSummary {
  return {
    income: null,
    employment_status: null,
    requested_amount: null,
    document_type: null,
    product_type: null,
    existing_customer: null,
    disputed_amount: null,
    merchant: null,
    transaction_date: null,
    dispute_reason: null,
  };
}
