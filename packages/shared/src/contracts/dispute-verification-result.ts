/**
 * Contrato de salida de la parte transaccional de la capa "Act" para el
 * flujo de disputa de cargos: `services/transaction-agent`
 * (`computeDisputeVerification`), invocado únicamente después de que
 * policy-agent autorizó `decision === "AUTO"` en `stage: pre_action` para
 * `intent: dispute_unrecognized_charge` (`policies.yaml`, reglas
 * `pre_action` de ese intent, sin que ninguna regla ESCALATE/CLARIFY de
 * excepción haya ganado — ver `evaluation_semantics.model:
 * most_conservative_match_wins`).
 *
 * Este archivo RESUELVE las 3 preguntas abiertas que `policies.yaml` deja
 * explícitas en `dispute_post_action_open_questions` (líneas ~802-839, justo
 * antes del borrador `dispute_post_action_rules_proposal`,
 * `dispute_post_action_contract_status: PROPOSAL_NOT_CONFIRMED`). policy-agent
 * debe copiar esta resolución literal al confirmar esas reglas — no
 * rediseñarla:
 *
 * (a) Shape del contrato: el definido más abajo
 * (`transactionFound`/`transactionId`/`fraudSuspected`/`productBlocked`,
 * más `caseId` para correlación). Se agregó `transactionId` (opcional,
 * presente solo si `transactionFound === true`) porque verification-agent lo
 * necesita para re-verificar ownership de forma independiente sin volver a
 * hacer el matching difuso (`TransactionCandidateFilters`) que ya hizo
 * transaction-agent — evita que verification-agent tenga que repetir una
 * búsqueda ambigua por comercio/monto, alcanza con validar el `transactionId`
 * puntual contra el mismo repositorio.
 *
 * (b) Umbral de fraude: **señal única y primaria `transaction.is_fraud ===
 * true`**, sin umbral secundario de `fraud_score`. Justificación: el mock de
 * `services/transaction-agent/src/data/mock-core-banking.ts` no tiene ningún
 * caso limítrofe que justifique un corte numérico -- el único
 * `is_fraud: true` tiene `fraud_score: 96.0`; el resto de las 24
 * transacciones del seed está entre 0.5 y 4.2. Agregar un umbral arbitrario
 * de `fraud_score` sin un caso real que lo ponga a prueba sería una regla no
 * verificable, así que se difiere hasta que exista una necesidad de negocio
 * concreta (ej. un caso real con `fraud_score` intermedio, ni claramente
 * fraude ni claramente legítimo).
 *
 * (c) Correlación por `caseId`/`turnId`: CONFIRMADA. Misma tabla real
 * `banking-agent-dev-case-store`, misma partición `pk = CASE#<caseId>` que ya
 * usa `EligibilityResult` (ver
 * `packages/shared/src/contracts/eligibility-result.ts`, resolución de su
 * propia pregunta abierta #3), con `sk = RESULT#dispute#<turnId>` (mismo
 * patrón que `RESULT#eligibility#<turnId>`, mismo
 * `idempotencyKey = "${caseId}:${turnId}"`). Ver
 * `services/transaction-agent/src/store/dispute-store.ts` para el detalle de
 * idempotencia/reintentos.
 *
 * Productor:
 *  - `services/transaction-agent` (`computeDisputeVerification`).
 *
 * Consumidores:
 *  - policy-agent (`evaluatePostAction` una vez que confirme
 *    `dispute_post_action_rules`, `stage: post_action` de `policies.yaml`) —
 *    decide AUTO/ESCALATE sobre el resultado.
 *  - verification-agent (fase posterior) — nunca se reporta este resultado
 *    directamente al usuario sin pasar antes por esa capa.
 */
export interface DisputeVerificationResult {
  /** Igual a `UnderstandOutput.context.caseId` del turno que disparó el
   * cálculo (correlación, ver resolución de la pregunta abierta (c)). */
  caseId: string;

  /** `true` si `computeDisputeVerification` pudo localizar EXACTAMENTE una
   * transacción real del cliente que matchee las pistas dadas
   * (`merchant`/`disputed_amount`), acotada además a productos tipo tarjeta
   * (`Credit Card`/`Debit Card`) que sí pertenecen al cliente. `false` si no
   * se encontró ninguna, si el cliente no existe, si no tiene tarjetas, o si
   * hubo más de una candidata ambigua (ver `compute-dispute.ts` para el
   * detalle completo de cada camino). */
  transactionFound: boolean;

  /** `Transaction.transaction_id` de la única transacción encontrada.
   * Presente SOLO si `transactionFound === true`. */
  transactionId?: string;

  /** Eco de `Transaction.is_fraud` de la transacción encontrada (ver
   * resolución de la pregunta abierta (b)). Siempre `false` si
   * `transactionFound === false` -- no se puede evaluar fraude sobre una
   * transacción que no se localizó. */
  fraudSuspected: boolean;

  /** `true` SOLO si se completó y "persistió" la acción de bloqueo (en este
   * mock, la acción queda representada por este mismo resultado persistido en
   * `DynamoDbDisputeStore` -- no hay una tabla de productos real que mutar,
   * ver `compute-dispute.ts`). Nunca `true` si `fraudSuspected === true` (la
   * revisión humana la dispara la regla `post_action` de policy-agent, no un
   * bloqueo automático) ni si `transactionFound === false`. */
  productBlocked: boolean;

  /**
   * Candidatas reales (ya filtradas por ownership) que el matcher de
   * `src/matching/transaction-matcher.ts` encontró pero NO pudo resolver
   * con confianza -- presente SOLO cuando `transactionFound === false` Y
   * hubo 2+ candidatas ambiguas (nunca cuando hubo 0 candidatas, ahí no hay
   * nada que ofrecer). Acotado a un máximo de 5 (top del ranking), nunca la
   * lista completa sin límite.
   *
   * Agregado para el flujo CLARIFY post-Act (`policies.yaml`, regla
   * `clarify-dispute-ambiguous-candidates`): en vez de escalar directo a un
   * humano ante ambigüedad, se le pregunta al cliente cuál es la
   * transacción correcta. El cliente responde con `selectedTransactionId`
   * (`UnderstandContext.selectedTransactionId`), que `compute-dispute.ts`
   * SIEMPRE revalida contra las candidatas reales recalculadas en ese
   * turno -- nunca se confía en el ID del cliente a ciegas.
   *
   * Nunca se interpola en un `reason` de `policies.yaml` (misma regla de
   * seguridad `sec-no-raw-dispute-fields-in-reason`) -- el frontend
   * renderiza esta lista desde el campo estructurado directamente.
   */
  ambiguousCandidates?: {
    transactionId: string;
    merchant: string | null;
    amount: number;
    /** `yyyy-mm-dd`, derivado de `Transaction.transaction_date`. */
    date: string;
  }[];
}
