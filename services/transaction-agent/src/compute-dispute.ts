import type { DisputeVerificationResult, Entities, LanguageCode } from "@banking-agent/shared";
import { CARD_PRODUCT_TYPES } from "./data/mock-core-banking";
import type { TransactionRepository } from "./repository/types";
import type { DisputeStore } from "./store/dispute-store-types";
import { baselineScore, modelScore, rankAndDecide, type EmbedFn } from "./matching/transaction-matcher";

export interface ComputeDisputeInput {
  caseId: string;
  /** Mismo `turnId` que `UnderstandOutput.context.turnId` del turno que
   * disparó el AUTO -- forma la `idempotencyKey` junto con `caseId`. */
  turnId: string;
  entities: Entities;
  /** `UnderstandOutput.language` del turno -- necesario para resolver
   * frases de fecha relativa (`entities.transaction_date`) en el matcher
   * de transacciones ambiguas, ver paso 6 del docstring de
   * `computeDisputeVerification`. */
  language: LanguageCode;
}

export interface ComputeDisputeDeps {
  store: DisputeStore;
  repository: TransactionRepository;
  /** Función de embeddings inyectable (real: Bedrock Titan, ver
   * `matching/bedrock-embeddings.ts#createRealEmbedFn`; tests: fake/mock).
   * Opcional -- si se omite, el matcher de candidatas ambiguas usa SOLO
   * `baselineScore` (nunca bloquea la disputa por falta de este
   * componente, ver paso 6). */
  embed?: EmbedFn;
  /** Inyectable para tests -- default `() => new Date().toISOString()`.
   * Referencia de "ahora" para resolver frases de fecha relativa. Nunca se
   * lee de `UnderstandContext` (ese contrato no tiene un timestamp de
   * turno hoy) -- usar el reloj del proceso es una simplificación
   * deliberada y documentada, el desfase de milisegundos/segundos entre el
   * turno real y esta invocación es irrelevante para resolver "la semana
   * pasada". */
  now?: () => string;
}

/**
 * Se lanza cuando el `DisputeStore` (DynamoDB) o el `TransactionRepository`
 * (core bancario simulado) fallan tras agotar sus reintentos acotados. NUNCA
 * se fabrica un `DisputeVerificationResult` en este caso -- el caller
 * (handler Lambda) debe capturar este error y decidir explícitamente
 * "reintentar" o "escalar a revisión humana", mismo criterio que
 * `EligibilityUnavailableError` (`./compute-eligibility.ts`).
 */
export class DisputeUnavailableError extends Error {
  constructor(
    public readonly reason: "dynamodb_read_failed" | "dynamodb_write_failed" | "repository_unavailable",
    caseId: string,
    turnId: string
  ) {
    super(
      `No se pudo calcular/persistir el resultado de disputa para caseId=${caseId} turnId=${turnId}: ${reason}`
    );
    this.name = "DisputeUnavailableError";
  }
}

function log(event: string, fields: Record<string, unknown>): void {
  // Logging estructurado correlacionado por caseId/turnId (pilar
  // Observability/Reliability, mismo criterio que compute-eligibility.ts) --
  // NUNCA loguea `entities` completas (podrían contener PII vía
  // `document_id`), solo campos puntuales no sensibles cuando hace falta.
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ service: "transaction-agent", event, ...fields }));
}

/** Resultado final "no encontrado" -- usado en múltiples puntos de salida
 * temprana (cliente no encontrado, sin tarjetas, sin candidatas, candidatas
 * ambiguas). Centralizado acá para que los cuatro caminos sean literalmente
 * el mismo objeto, no cuatro construcciones que puedan divergir con el
 * tiempo. */
function notFoundResult(caseId: string): DisputeVerificationResult {
  return { caseId, transactionFound: false, fraudSuspected: false, productBlocked: false };
}

/**
 * Orquestación pura de la capa Act (parte transaccional) para el flujo de
 * disputa de cargos (`intent: dispute_unrecognized_charge`): identifica la
 * transacción real disputada del cliente (nunca contra `complaints` -- el
 * EDA del dataset LATAM Bank mostró que esa tabla no es verificable, ver
 * `./data/mock-core-banking.ts`), decide si hay sospecha de fraude, y simula
 * el bloqueo del producto cuando corresponde. Idempotencia obligatoria sobre
 * `DisputeStore`.
 *
 * Flujo (documentado paso a paso, mismo nivel de detalle que
 * `compute-eligibility.ts`):
 *
 *  1. IDEMPOTENCIA PRIMERO: `idempotencyKey = "${caseId}:${turnId}"` ->
 *     `store.getResult`.
 *     - `"found"` -> se devuelve tal cual, SIN recalcular, SIN volver a
 *       buscar al cliente/la transacción, SIN volver a "bloquear" el
 *       producto -- esto es lo que evita duplicar la acción en reintentos
 *       (requisito explícito de Reliability).
 *     - `"unavailable"` -> `DisputeUnavailableError("dynamodb_read_failed")`.
 *
 *  2. RESOLVER CLIENTE: `repository.findCustomerByDocumentNumber(entities.document_id)`.
 *     - `"not_found"` (incluye `document_id` inválido/inexistente en el
 *       mock) -> resultado final `notFoundResult` (ver abajo), PERSISTIDO
 *       igual que el camino feliz (la idempotencia debe cubrir también
 *       "cliente no encontrado", no solo el caso con transacción).
 *     - `"unavailable"` -> `DisputeUnavailableError("repository_unavailable")`.
 *       NOTA: `StaticTransactionRepository` (implementación de este
 *       checkpoint) nunca devuelve este estado hoy -- es puramente defensivo,
 *       para una futura implementación DynamoDB del repositorio que sí pueda
 *       fallar por red/infra.
 *
 *  3. ACOTAR PRODUCTOS DEL CLIENTE (el chequeo de ownership "hecho bien", a
 *     diferencia de `complaints` en el EDA real): `repository.listCustomerProducts`.
 *     De los productos devueltos, se conservan SOLO los que están en
 *     `CARD_PRODUCT_TYPES` (`["Credit Card", "Debit Card"]`) Y que además
 *     cumplen explícitamente `product.customer_id === customerId` --
 *     chequeo defensivo, no se confía ciegamente en que el repositorio ya
 *     filtró bien (aplicación deliberada del hallazgo del EDA: nunca asumir
 *     ownership, siempre verificarlo).
 *
 *     Mapeo de `entities.product_type` (`"credit_card"|"personal_loan"|
 *     "auto_loan"|"mortgage"|"unknown"`, contrato de
 *     `understand-output.ts`) al `ProductType` del mock
 *     (`"Credit Card"|"Debit Card"|...`, `mock-core-banking.ts`): NO hay un
 *     mapeo 1:1 confiable salvo `"credit_card" -> "Credit Card"`. Si
 *     `entities.product_type === "credit_card"`, se acota el set a
 *     productos `product_type === "Credit Card"`. Para cualquier otro valor
 *     (`"personal_loan"|"auto_loan"|"mortgage"|"unknown"`, o si el cliente no
 *     tiene ningún producto de tipo `"Credit Card"`), NO se acota por tipo --
 *     se usan TODOS los productos tarjeta del cliente (`Credit Card` +
 *     `Debit Card`) como candidatos. Esto es una LIMITACIÓN CONOCIDA, no un
 *     bug: el contrato `Entities` del flujo de crédito no tiene un valor
 *     `"debit_card"`, así que una disputa sobre una tarjeta de débito no
 *     puede acotarse por `product_type` hoy -- se resuelve solo vía
 *     `merchant`/`disputed_amount`. Cerrar este gap requeriría agregar
 *     valores al enum `ProductType` de `understand-output.ts`, fuera de
 *     scope de este checkpoint.
 *
 *     Si el set de productos tarjeta queda vacío (cliente sin ninguna
 *     tarjeta) -> `notFoundResult`, persistido y devuelto (mismo criterio
 *     que el paso 2).
 *
 *  4. BUSCAR TRANSACCIONES CANDIDATAS: `repository.findCandidateTransactions`
 *     con `merchant: entities.merchant ?? undefined` y
 *     `amount: entities.disputed_amount ?? undefined`. Deliberadamente NO se
 *     pasa `dateRange` a partir de `entities.transaction_date`: ese campo es
 *     texto libre SIN parsear (ver docstring de `Entities.transaction_date`
 *     en `understand-output.ts` -- "ayer", "la semana pasada", nunca ISO) y
 *     `TransactionCandidateFilters.dateRange` espera `{from, to}` en
 *     `yyyy-mm-dd`. Construir un rango de fechas a partir de texto libre
 *     (parseo de fechas relativas, ambigüedad de locale) está fuera de scope
 *     de este checkpoint -- decisión explícita, no una omisión.
 *
 *  5. FILTRAR CANDIDATAS POR OWNERSHIP REAL DE PRODUCTO (el paso que
 *     realmente "hace bien lo que `complaints` rompía" en el EDA real): de
 *     las transacciones candidatas devueltas, se conservan solo las que
 *     cumplen `ownedCardProductIds.has(t.product_id)` Y que además re-
 *     verifican explícitamente `t.customer_id === customerId` (doble chequeo
 *     defensivo, mismo criterio que el paso 3).
 *
 *  6. RESOLVER EL RESULTADO:
 *     - 0 transacciones tras el filtro -> `notFoundResult`.
 *     - 2+ transacciones -> AMBIGUO. Se rankean con el matcher de
 *       `./matching/transaction-matcher.ts` (baseline determinístico
 *       siempre; + embeddings reales de Bedrock si `deps.embed` está
 *       disponible) contra lo que el cliente recuerda (`merchant`,
 *       `disputed_amount`, `transaction_date` -- este último resuelto a un
 *       rango real de fechas por `./matching/resolve-relative-date.ts`,
 *       algo que el filtro del paso 4 deliberadamente NO hace). Si el
 *       ranker queda CONFIADO (mejor score sobre un umbral Y separado del
 *       segundo por un margen -- nunca elige "el menos malo" entre dos
 *       candidatas parecidas), se resuelve como si fuera la única
 *       candidata, sin fabricar nada (la transacción elegida ya pasó el
 *       filtro de ownership real del paso 5). Si NO está confiado, se
 *       preserva el comportamiento ORIGINAL: `notFoundResult`, nunca se
 *       elige al azar -- mejor no encontrar nada que bloquear la tarjeta
 *       equivocada.
 *     - Exactamente 1 (`tx`) -> `transactionId: tx.transaction_id`,
 *       `fraudSuspected: tx.is_fraud === true`.
 *         - Si `fraudSuspected === false`: se simula la acción,
 *           `productBlocked: true` (el mock es de solo lectura -- no hay
 *           ninguna otra tabla/producto que mutar de verdad; la "acción"
 *           queda representada por este mismo resultado persistido, mismo
 *           criterio que ya usa `compute-eligibility.ts` para su propio
 *           resultado -- NO se genera un item de DynamoDB separado para
 *           "disputa abierta").
 *         - Si `fraudSuspected === true`: `productBlocked: false` -- no se
 *           bloquea nada automáticamente; la revisión humana la dispara la
 *           regla `post_action` de policy-agent.
 *
 *  7. PERSISTIR SIEMPRE el resultado final (encontrado o no, con o sin
 *     fraude) vía `store.putResult` ANTES de devolverlo -- mismo criterio
 *     incondicional que `compute-eligibility.ts`.
 *     - `"unavailable"` -> `DisputeUnavailableError("dynamodb_write_failed")`.
 */
export async function computeDisputeVerification(
  input: ComputeDisputeInput,
  deps: ComputeDisputeDeps
): Promise<DisputeVerificationResult> {
  const { caseId, turnId, entities, language } = input;
  const { store, repository, embed, now = () => new Date().toISOString() } = deps;

  log("idempotency_check_start", { caseId, turnId });
  const existing = await store.getResult(caseId, turnId);

  if (existing.status === "unavailable") {
    log("idempotency_check_failed", { caseId, turnId, reason: existing.reason });
    throw new DisputeUnavailableError(existing.reason, caseId, turnId);
  }

  if (existing.status === "found") {
    log("idempotency_hit_no_recompute", {
      caseId,
      turnId,
      transactionFound: existing.value.transactionFound,
    });
    return existing.value;
  }

  async function persist(result: DisputeVerificationResult): Promise<DisputeVerificationResult> {
    const putOutcome = await store.putResult(result, turnId);
    if (putOutcome.status === "unavailable") {
      log("persist_failed", { caseId, turnId, reason: putOutcome.reason });
      throw new DisputeUnavailableError(putOutcome.reason, caseId, turnId);
    }
    log("computed_and_persisted", {
      caseId,
      turnId,
      transactionFound: result.transactionFound,
      fraudSuspected: result.fraudSuspected,
      productBlocked: result.productBlocked,
    });
    return result;
  }

  log("resolving_customer", { caseId, turnId });
  const documentNumber = entities.document_id ?? "";
  const customerLookup = await repository.findCustomerByDocumentNumber(documentNumber);

  if (customerLookup.status === "unavailable") {
    log("repository_unavailable", { caseId, turnId, step: "findCustomerByDocumentNumber" });
    throw new DisputeUnavailableError("repository_unavailable", caseId, turnId);
  }
  if (customerLookup.status === "not_found") {
    log("customer_not_found", { caseId, turnId });
    return persist(notFoundResult(caseId));
  }

  const customer = customerLookup.value;

  log("resolving_owned_card_products", { caseId, turnId });
  const productsLookup = await repository.listCustomerProducts(customer.customer_id);

  if (productsLookup.status === "unavailable") {
    log("repository_unavailable", { caseId, turnId, step: "listCustomerProducts" });
    throw new DisputeUnavailableError("repository_unavailable", caseId, turnId);
  }

  const allOwnedCardProducts =
    productsLookup.status === "found"
      ? productsLookup.value.filter(
          (p) => CARD_PRODUCT_TYPES.includes(p.product_type) && p.customer_id === customer.customer_id
        )
      : [];

  // Ver docstring de esta función, paso 3, para la justificación completa
  // del mapeo (limitación conocida sobre "debit_card" ausente del contrato).
  const creditCardProducts = allOwnedCardProducts.filter((p) => p.product_type === "Credit Card");
  const scopedProducts =
    entities.product_type === "credit_card" && creditCardProducts.length > 0
      ? creditCardProducts
      : allOwnedCardProducts;

  const ownedCardProductIds = new Set(scopedProducts.map((p) => p.product_id));

  if (ownedCardProductIds.size === 0) {
    log("customer_has_no_card_products", { caseId, turnId });
    return persist(notFoundResult(caseId));
  }

  log("searching_candidate_transactions", { caseId, turnId });
  const candidatesLookup = await repository.findCandidateTransactions(customer.customer_id, {
    merchant: entities.merchant ?? undefined,
    amount: entities.disputed_amount ?? undefined,
  });

  if (candidatesLookup.status === "unavailable") {
    log("repository_unavailable", { caseId, turnId, step: "findCandidateTransactions" });
    throw new DisputeUnavailableError("repository_unavailable", caseId, turnId);
  }

  const candidates = candidatesLookup.status === "found" ? candidatesLookup.value : [];

  const ownedCandidates = candidates.filter(
    (t) => ownedCardProductIds.has(t.product_id) && t.customer_id === customer.customer_id
  );

  if (ownedCandidates.length === 0) {
    log("no_matching_transaction", { caseId, turnId });
    return persist(notFoundResult(caseId));
  }

  let resolvedTx = ownedCandidates[0];

  if (ownedCandidates.length > 1) {
    // Matcher de transacciones ambiguas (ver services/transaction-agent/src/
    // matching/): antes, CUALQUIER ambigüedad se trataba como "no
    // encontrado" sin intentar desambiguar. Ahora se rankean las
    // candidatas -- baseline (lo que el sistema ya hacía, formalizado
    // como score) vs modelo (embeddings reales de Bedrock + señales
    // continuas de monto/fecha). Si el ranker está CONFIADO (top score
    // sobre el umbral Y separado con margen del segundo), se resuelve
    // como si fuera la única candidata -- mismo camino de abajo, sin
    // fabricar nada: la transacción elegida es una candidata REAL que ya
    // pasó el filtro de ownership. Si no está confiado, se preserva el
    // comportamiento EXACTO de antes (notFoundResult -> CLARIFY/ESCALATE
    // vía policies.yaml, sin cambios ahí).
    const query = {
      merchant: entities.merchant,
      disputedAmount: entities.disputed_amount,
      transactionDateText: entities.transaction_date,
      referenceDateIso: now(),
      language,
    };

    const decision = embed
      ? await rankAndDecide(ownedCandidates, query, (candidate, q) => modelScore(candidate, q, embed))
      : await rankAndDecide(ownedCandidates, query, baselineScore);

    if (!decision.confident) {
      log("ambiguous_candidates_unresolved", {
        caseId,
        turnId,
        count: ownedCandidates.length,
        topScore: decision.top.score,
        usedModel: Boolean(embed),
      });
      return persist(notFoundResult(caseId));
    }

    log("ambiguous_candidates_resolved_by_matcher", {
      caseId,
      turnId,
      count: ownedCandidates.length,
      topScore: decision.top.score,
      usedModel: Boolean(embed),
    });
    resolvedTx = decision.top.transaction;
  }

  const tx = resolvedTx;
  const fraudSuspected = tx.is_fraud === true;
  const result: DisputeVerificationResult = {
    caseId,
    transactionFound: true,
    transactionId: tx.transaction_id,
    fraudSuspected,
    productBlocked: !fraudSuspected,
  };

  return persist(result);
}
