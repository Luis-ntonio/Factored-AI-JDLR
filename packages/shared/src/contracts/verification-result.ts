/**
 * Contrato de salida de la capa "Verify" (`services/verification-agent`),
 * invocada como Task-a-Task de la Step Function real
 * (`banking-agent-dev-chat-orchestrator`) inmediatamente después de
 * ActRetrieval (`retrieval-agent`, intents `product_info`/`faq`) o
 * ActTransaction (`transaction-agent`, intent `eligibility_check`), y ANTES
 * de que cualquier resultado se comunique como exitoso al usuario final.
 *
 * verification-agent hace una SEGUNDA verificación INDEPENDIENTE del
 * resultado ya producido por retrieval-agent/transaction-agent -- nunca un
 * passthrough. Ver `services/verification-agent/README.md` para el detalle
 * completo de la lógica (recálculo independiente de `score_zone` contra
 * `policies.yaml`, chequeo de `source` no vacío en catálogo/FAQs, etc.).
 *
 * Principio de Reliability no-negociable de este checkpoint (equivalente al
 * mismo principio que ya rige policy-agent/transaction-agent/retrieval-agent):
 * ante CUALQUIER duda o fallo interno, el resultado se reporta como
 * `"pending_confirmation"` -- NUNCA `"verified"` por default. `verified:
 * true` solo ocurre cuando verification-agent pudo confirmar activamente la
 * consistencia del resultado.
 *
 * Restricción de diseño explícita (Security, mismo criterio que
 * `EligibilityResult`/`RetrievalResult`): `reason` es un mensaje legible por
 * humanos/logs sobre el MOTIVO de la verificación/no-verificación (ej. "zona
 * de score no coincide", "producto sin campo source") -- NUNCA debe incluir
 * datos crudos de `entities` (en particular, nunca `entities.document_id` ni
 * ningún otro campo de PII). Ninguno de los resultados que verification-agent
 * consume (`EligibilityResult`, `RetrievalResult`) contiene PII directamente,
 * así que esta restricción debería cumplirse naturalmente, pero se deja
 * documentada de forma explícita para que ningún cambio futuro la viole por
 * accidente.
 *
 * Productor:
 *  - `services/verification-agent` (`verifyResult`).
 *
 * Consumidores:
 *  - La Step Function real (`banking-agent-dev-chat-orchestrator`) -- decide
 *    si comunica el resultado al usuario (`status === "verified"`) o lo
 *    deriva a una capa de confirmación/espera.
 *  - `escalation-agent` (fase posterior a esta, `docs/PLAN.md` "Días 5-6 —
 *    Verify + Escalate") -- consume específicamente los casos
 *    `status === "pending_confirmation"` para decidir cómo escalar.
 */

/** `data` es un eco SIN modificar del resultado original ya verificado (o
 * mejor esfuerzo de eco si la verificación no pudo completarse):
 * `RetrievalResult` para `product_info`/`faq`, o el `EligibilityResult`
 * desenvuelto (no el `EligibilityHandlerResponse` completo) para
 * `eligibility_check`. Genérico para que cada consumidor tipado pueda anotar
 * el tipo exacto que espera sin un cast adicional. */
export interface VerificationResult<T = unknown> {
  /** `"verified"` solo cuando verification-agent confirmó activamente la
   * consistencia del resultado. `"pending_confirmation"` en cualquier otro
   * caso, incluyendo fallos internos de verification-agent mismo -- nunca
   * hay un tercer estado ni un default implícito a "verified". */
  status: "verified" | "pending_confirmation";

  /** Redundante a propósito respecto de `status` (`=== "verified"`), para
   * que consumidores no-TS/JSON (ej. una expresión de Step Functions
   * `ASL`/JSONPath) puedan filtrar sin parsear el string de `status`. */
  verified: boolean;

  /** Motivo legible por humanos/logs cuando `status === "pending_confirmation"`.
   * Ver restricción de PII en el docstring de cabecera de este archivo.
   * Ausente cuando `status === "verified"` (no hay nada que explicar). */
  reason?: string;

  /** Eco del resultado original -- ver docstring del tipo. */
  data: T;
}
