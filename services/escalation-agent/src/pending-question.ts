import type { LanguageCode } from "@banking-agent/shared";
import type { AttemptedActionIntent, PolicyDecisionResultLike } from "./types";

/** `pendingQuestion` SÍ se le muestra al cliente final (sección "Qué sigue"/
 * "Próximos passos" de `apps/web/src/components/EscalationCard.tsx`) --
 * a diferencia de `attemptedActions`/`unresolvedReason` derivados de acá
 * (que quedan solo en `EscalationSummary` para auditoría, no se renderizan
 * hoy), por eso este texto SÍ está bifurcado por `language`, mismo patrón
 * `Record<LanguageCode, ...>` que `./narrative.ts`. */

/** Motivo/pregunta pendiente por defecto cuando policy-agent no dio un
 * `askField` específico (ej. la mayoría de las reglas ESCALATE de
 * `policies.yaml` no tienen `ask_field` -- ese campo se usa sobre todo para
 * CLARIFY). Sigue siendo una acción concreta y accionable para el humano. */
const DEFAULT_POLICY_PENDING_QUESTION: Record<LanguageCode, string> = {
  es: "Revisar el caso manualmente y decidir cómo proceder (aprobar, rechazar, o solicitar más información directamente al usuario).",
  pt: "Revisar o caso manualmente e decidir como proceder (aprovar, rejeitar ou solicitar mais informações diretamente ao solicitante).",
};

/** `pendingQuestion` para `origin === "policy_decision"`/`"post_action_decision"`
 * -- derivado de `policyDecision.askField` si viene presente y no vacío, o el
 * default genérico de arriba. Nunca interpola `entities.*` (solo el NOMBRE
 * del campo, `askField`, que es una key técnica en inglés como
 * "product_type" -- no un valor de dato personal). */
export function buildPolicyPendingQuestion(
  policyDecision: PolicyDecisionResultLike | undefined,
  language: LanguageCode,
): string {
  const askField = policyDecision?.askField;
  if (typeof askField === "string" && askField.trim() !== "") {
    return language === "pt"
      ? `Confirmar/completar manualmente o dado '${askField.trim()}' diretamente com o solicitante antes de continuar.`
      : `Confirmar/completar manualmente el dato '${askField.trim()}' directamente con el solicitante antes de continuar.`;
  }
  return DEFAULT_POLICY_PENDING_QUESTION[language];
}

/** Descripción de "qué se intentó automáticamente" para `attemptedActions`
 * cuando `origin === "verification_failed"`. Una entrada por intent conocido
 * -- `escalation_request`/`unknown` nunca llegan acá (nunca pasan por
 * "Act"). */
export function buildAttemptedActionDescription(intent: AttemptedActionIntent | undefined): string {
  switch (intent) {
    case "eligibility_check":
      return "transaction-agent calculó elegibilidad, pero verification-agent no pudo confirmar la zona de score.";
    case "product_info":
      return "retrieval-agent devolvió información del producto, pero verification-agent no pudo confirmar la fuente (source) de los datos.";
    case "faq":
      return "retrieval-agent devolvió respuestas de FAQ, pero verification-agent no pudo confirmar la fuente (source) de una o más respuestas.";
    case "dispute_unrecognized_charge":
      return "transaction-agent intentó verificar la disputa del cargo contra las transacciones reales del cliente, pero verification-agent no pudo confirmar el resultado.";
    default:
      return "Se intentó ejecutar una acción automática, pero verification-agent no pudo confirmar el resultado.";
  }
}

/** Descripción de "qué se intentó automáticamente" para `attemptedActions`
 * cuando `origin === "post_action_decision"` -- a diferencia de
 * `buildAttemptedActionDescription`, acá la acción SÍ se completó y
 * verification-agent SÍ la confirmó; lo que faltó fue la aprobación de una
 * regla de negocio posterior (`stage: post_action` de policy-agent). Hoy el
 * único intent que llega a este origen es `eligibility_check` (el paso nuevo
 * `PostActionDecide` del ASL solo corre para ese intent), pero esta función
 * no lo asume rígidamente -- degrada a una descripción genérica si llegara
 * otro valor. */
export function buildPostActionAttemptedActionDescription(intent: AttemptedActionIntent | undefined): string {
  switch (intent) {
    case "eligibility_check":
      return "transaction-agent calculó elegibilidad y verification-agent confirmó la consistencia del resultado, pero policy-agent (regla de negocio en la revisión post_action) decidió que requiere revisión humana antes de comunicarlo.";
    case "dispute_unrecognized_charge":
      return "transaction-agent verificó la disputa contra las transacciones reales del cliente y verification-agent confirmó la consistencia del resultado, pero policy-agent (regla de negocio en la revisión post_action) decidió que requiere revisión humana antes de comunicarlo (ej. transacción no localizada o sospecha de fraude).";
    default:
      return "Se completó y confirmó una acción automática, pero policy-agent (regla de negocio en la revisión post_action) decidió que requiere revisión humana antes de comunicar el resultado.";
  }
}

const VERIFICATION_PENDING_QUESTIONS: Record<LanguageCode, Record<AttemptedActionIntent | "default", string>> = {
  es: {
    eligibility_check: "Revisar el caso y decidir manualmente si se aprueba o rechaza la solicitud de crédito.",
    product_info: "Revisar y confirmar manualmente la información del producto antes de comunicarla al usuario.",
    faq: "Revisar y confirmar manualmente las respuestas de FAQ antes de comunicarlas al usuario.",
    dispute_unrecognized_charge:
      "Revisar el caso y confirmar manualmente la transacción disputada antes de bloquear la tarjeta o abrir la disputa.",
    default: "Revisar el caso manualmente antes de comunicar cualquier resultado al usuario.",
  },
  pt: {
    eligibility_check: "Revisar o caso e decidir manualmente se a solicitação de crédito é aprovada ou rejeitada.",
    product_info: "Revisar e confirmar manualmente as informações do produto antes de comunicá-las ao usuário.",
    faq: "Revisar e confirmar manualmente as respostas do FAQ antes de comunicá-las ao usuário.",
    dispute_unrecognized_charge:
      "Revisar o caso e confirmar manualmente a transação disputada antes de bloquear o cartão ou abrir a disputa.",
    default: "Revisar o caso manualmente antes de comunicar qualquer resultado ao usuário.",
  },
};

/** `pendingQuestion` para `origin === "verification_failed"` -- una acción
 * concreta acorde al tipo de acción que quedó sin confirmar. */
export function buildVerificationPendingQuestion(
  intent: AttemptedActionIntent | undefined,
  language: LanguageCode,
): string {
  const byLanguage = VERIFICATION_PENDING_QUESTIONS[language];
  if (intent && intent in byLanguage) {
    return byLanguage[intent];
  }
  return byLanguage.default;
}
