/**
 * Contrato de salida de la capa "Escalate" (`services/escalation-agent`),
 * la ÚLTIMA pieza del pipeline real (`banking-agent-dev-chat-orchestrator`)
 * antes de que un humano reciba (o no) información accionable sobre un caso
 * que no pudo resolverse 100% automáticamente.
 *
 * escalation-agent es invocado por la Step Function desde TRES orígenes
 * distintos (ver `EscalationOrigin` abajo) que terminan en el MISMO tipo de
 * resumen:
 *
 *  1. `"policy_decision"` — policy-agent decidió `ESCALATE` en
 *     `stage: pre_action` (`policies.yaml`), ANTES de intentar cualquier
 *     acción (retrieval-agent/transaction-agent nunca corrieron para este
 *     turno). Reemplaza el placeholder `RespondEscalate` del ASL
 *     (`terraform/modules/orchestration/asl/chat-orchestrator.asl.json.tftpl`),
 *     que hoy devuelve el `PolicyDecisionResult` crudo sin resumir.
 *  2. `"verification_failed"` — sí se intentó una acción (retrieval-agent o
 *     transaction-agent) en el camino AUTO, pero verification-agent
 *     (`packages/shared/src/contracts/verification-result.ts`) reportó
 *     `status: "pending_confirmation"` — no pudo confirmar activamente que
 *     el resultado fuera consistente.
 *  3. `"post_action_decision"` — a diferencia de los dos anteriores, acá SÍ
 *     se intentó y se completó una acción real (transaction-agent calculó
 *     elegibilidad) Y verification-agent SÍ confirmó que el resultado era
 *     internamente consistente (`verified: true`, sin `pending_confirmation`).
 *     La escalada ocurre en un paso posterior nuevo del ASL
 *     (`PostActionDecide`, entre `Verify` y `RespondAuto`, solo para
 *     `intent: eligibility_check`) que reinvoca a policy-agent en modo
 *     `stage: post_action` sobre el `EligibilityResult` ya verificado. Cuando
 *     esa segunda pasada de policy-agent decide `ESCALATE` (ej. regla
 *     `escalate-score-borderline` de `policies.yaml`, un score en zona
 *     límite), el motivo es una decisión de NEGOCIO posterior, no una falla
 *     de verificación ni una excepción previa a la acción — por eso no
 *     reutiliza la forma de `"policy_decision"` (que implicaría
 *     `attemptedActions: []`, engañoso acá) ni la de `"verification_failed"`
 *     (que asume una verificación no confirmada, que tampoco es el caso).
 *
 * Principio de diseño central (pedido explícito del challenge, "safe
 * escalation"): este NUNCA es el transcript/mensaje crudo del usuario ni un
 * volcado JSON crudo de `policyDecision`/`VerificationResult`. Es un resumen
 * estructurado, legible por un humano EN SEGUNDOS, que cubre exactamente 4
 * preguntas:
 *   - ¿Qué quería el usuario? -> `userRequestSummary` (+ `intent` crudo).
 *   - ¿Qué datos ya se conocen de este caso? -> `knownEntities` +
 *     `maskedDocumentId` (nunca `entities.document_id` crudo).
 *   - ¿Qué se intentó automáticamente y por qué no alcanzó? ->
 *     `attemptedActions` + `unresolvedReason`.
 *   - ¿Qué necesita decidir/hacer el humano ahora? -> `pendingQuestion`.
 *
 * Restricción de Security NO NEGOCIABLE (ver `policies.yaml`, sección
 * `security`, reglas `sec-no-raw-pii-in-reason` y
 * `sec-masked-identifier-for-escalation` — esta última quedaba
 * explícitamente "PENDIENTE de confirmar con escalation-agent cuando se
 * implemente"; este archivo/servicio es esa confirmación): el valor crudo de
 * `entities.document_id` NUNCA debe aparecer en NINGÚN campo de texto de
 * este objeto (ni `userRequestSummary`, ni `unresolvedReason`, ni
 * `pendingQuestion`, ni ningún otro string). El solicitante se referencia
 * SIEMPRE por `caseId`/`customerId` (identificadores internos, no-PII) y,
 * si hace falta mostrar el documento, por `maskedDocumentId` (ver criterio
 * de enmascarado exacto en `services/escalation-agent/src/mask.ts`: se
 * conservan los últimos 4 caracteres, el resto se reemplaza por `*`; si el
 * documento tiene 4 caracteres o menos, se enmascara por completo). El resto
 * de `Entities` (income, employment_status, requested_amount, document_type,
 * product_type, existing_customer) NO es PII directa según
 * `docs/CONTRACTS.md` sección 4.3, así que `knownEntities` los expone tal
 * cual (o `null` si todavía no se conocen).
 *
 * Productor:
 *  - `services/escalation-agent` (`buildEscalationSummary` / `handler`).
 *
 * Consumidor:
 *  - La Step Function real (`banking-agent-dev-chat-orchestrator`) — este
 *    objeto se devuelve tal cual al frontend/canal en el status
 *    `"escalate"` de la respuesta final al operador humano (nunca
 *    directamente al usuario final del chat).
 */

import type { Entities, EntityKey, Intent, LanguageCode } from "./understand-output";

/** Cuál de los tres orígenes disparó esta escalación — ver docstring de
 * cabecera. Determina qué campos de `EscalationInput` estaban disponibles,
 * pero el `EscalationSummary` resultante tiene siempre la misma forma. */
export type EscalationOrigin = "policy_decision" | "verification_failed" | "post_action_decision";

/**
 * Subconjunto de `Entities` conocidas hasta el momento, ya filtrado de PII
 * directa: NO incluye `document_id` (ver `EscalationSummary.maskedDocumentId`
 * para la versión enmascarada). El resto de las keys de `Entities` se exponen
 * tal cual las conoce la conversación (`null` = todavía no provisto por el
 * usuario en ningún turno de este case, misma convención que
 * `understand-output.ts`).
 */
export type KnownEntitiesSummary = Omit<Entities, "document_id">;

/** Nombres de campo de `KnownEntitiesSummary` (para quien necesite iterar). */
export const KNOWN_ENTITIES_KEYS: readonly Exclude<EntityKey, "document_id">[] = [
  "income",
  "employment_status",
  "requested_amount",
  "document_type",
  "product_type",
  "existing_customer",
  "disputed_amount",
  "merchant",
  "transaction_date",
  "dispute_reason",
];

/**
 * Contrato de salida exacto de escalation-agent. Ver docstring de cabecera
 * de este archivo para el detalle de cada campo y la restricción de
 * Security no-negociable sobre `document_id` crudo.
 */
export interface EscalationSummary {
  /** Igual a `UnderstandOutput.context.caseId` del turno escalado. */
  caseId: string;
  /** Igual a `UnderstandOutput.context.customerId`. `null` si el turno
   * todavía no tiene un customer identificado. */
  customerId: string | null;
  /** Idioma detectado para el turno escalado (para que el humano sepa en
   * qué idioma responder, si corresponde). */
  language: LanguageCode;
  /** Intención detectada del turno escalado (valor crudo del enum, además
   * de la narrativa humana en `userRequestSummary`). */
  intent: Intent;
  /** Cuál de los tres orígenes disparó esta escalación. */
  origin: EscalationOrigin;

  /**
   * Narrativa humana corta (1 oración, texto generado por reglas/templates
   * determinísticos en ESPAÑOL — ver limitación de i18n en
   * `services/escalation-agent/README.md`) derivada de `intent` + las
   * `Entities` no sensibles ya conocidas. Ejemplo: "El usuario pidió evaluar
   * elegibilidad para un préstamo personal de 10000." NUNCA interpola
   * `entities.document_id`.
   */
  userRequestSummary: string;

  /** Datos ya conocidos/verificados durante la conversación, sin PII directa. */
  knownEntities: KnownEntitiesSummary;

  /** Versión ENMASCARADA de `entities.document_id` (últimos 4 caracteres
   * visibles, resto reemplazado por `*`), o `null` si no se conoce todavía
   * ningún documento para este case. NUNCA el valor crudo — ver
   * `services/escalation-agent/src/mask.ts`. */
  maskedDocumentId: string | null;

  /**
   * Qué se intentó automáticamente antes de llegar a esta capa. SIEMPRE
   * vacío (`[]`) cuando `origin === "policy_decision"` (ESCALATE ocurrió en
   * `pre_action`, antes de invocar retrieval-agent/transaction-agent). Tiene
   * al menos una entrada cuando `origin === "verification_failed"`,
   * describiendo la acción intentada y por qué verification-agent no pudo
   * confirmarla (ej. "transaction-agent calculó elegibilidad, pero
   * verification-agent no pudo confirmar la zona de score."). También tiene
   * al menos una entrada cuando `origin === "post_action_decision"`,
   * describiendo que la acción SÍ se completó y SÍ se confirmó, pero
   * policy-agent decidió igual escalar en `post_action` por una regla de
   * negocio (ej. "transaction-agent calculó elegibilidad y verification-agent
   * confirmó la consistencia del resultado, pero policy-agent [...] decidió
   * que requiere revisión humana.").
   */
  attemptedActions: string[];

  /** Motivo por el cual el caso no se resolvió automáticamente — derivado de
   * `PolicyDecisionResult.reason` (orígenes `policy_decision` y
   * `post_action_decision`, mismo campo en dos momentos distintos del
   * pipeline) o de `VerificationResult.reason` (origen
   * `verification_failed`). Nunca interpola datos crudos de `entities`. */
  unresolvedReason: string;

  /**
   * Pregunta o acción específica pendiente para el humano — derivada de
   * `PolicyDecisionResult.askField` cuando existe, o una acción genérica
   * razonable en caso contrario (ej. "Revisar el caso y decidir si se
   * aprueba/rechaza manualmente."). `string | null` por contrato general,
   * pero el camino de fallback ante error interno de escalation-agent NUNCA
   * lo deja en `null` (ver README de ese servicio, sección Reliability) —
   * un humano siempre recibe algo accionable.
   */
  pendingQuestion: string | null;
}
