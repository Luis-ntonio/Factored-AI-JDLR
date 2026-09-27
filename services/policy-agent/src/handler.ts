import * as path from "node:path";
import type { EligibilityResult, UnderstandOutput } from "@banking-agent/shared";
import { evaluatePostAction, evaluatePreAction, loadPolicyFile } from "./evaluator";
import type { PolicyDecisionResult, PolicyFile } from "./types";

/**
 * Handler de Lambda para la capa "Decide" (paso "Decide" del pipeline real).
 *
 * A DIFERENCIA de conversation-agent/retrieval-agent/transaction-agent (que
 * exponen un contrato tipo `APIGatewayProxyEventV2` con `event.body` como
 * JSON string, porque conversation-agent está detrás de API Gateway y los
 * otros dos replican ese contrato por consistencia), policy-agent NUNCA se
 * expone vía API Gateway -- solo lo invoca la Step Function internamente
 * como un Task de Lambda. Por eso este handler acepta y devuelve JSON PLANO,
 * sin envoltura de API Gateway (`event.body`/`isBase64Encoded`): sería una
 * capa de indirección innecesaria para una invocación Task-a-Task dentro de
 * la misma Step Function.
 *
 * Contrato:
 *   entrada:  DOS formas posibles, discriminadas por la presencia (o no) de
 *             un campo `stage: "post_action"` a nivel raíz del Payload:
 *
 *             1. Sin `stage` (o `stage !== "post_action"`): `UnderstandOutput`
 *                crudo (contrato de @banking-agent/shared, producido por
 *                conversation-agent -- capa "Understand"). Es el Payload que
 *                envía el Task "Decide" existente de la Step Function, que
 *                NO cambia y sigue sin campo `stage`. Se evalúa con
 *                `evaluatePreAction` (stage `pre_action` de policies.yaml).
 *
 *             2. `stage: "post_action"`: un `EligibilityResult` (contrato de
 *                @banking-agent/shared, producido por transaction-agent --
 *                `computeEligibility`) con el campo adicional `stage:
 *                "post_action"` agregado a nivel raíz por la Step Function.
 *                Es el Payload que envía el nuevo Task "PostActionDecide",
 *                ejecutado después de "Verify", para reevaluar el resultado
 *                de elegibilidad ya calculado. Se evalúa con
 *                `evaluatePostAction` (stage `post_action` de
 *                policies.yaml).
 *
 *   salida:   PolicyDecisionResult (ver ./types) -- SIEMPRE, nunca lanza,
 *             para ambos modos.
 *
 * Este mismo Lambda (`banking-agent-dev-policy-agent`) es invocado por la
 * Step Function DOS veces en flujos de elegibilidad: una vez como el Task
 * "Decide" (pre_action, antes de autorizar retrieval-agent/
 * transaction-agent) y otra vez como el Task "PostActionDecide" (post_action,
 * después de "Verify", para decidir si el resultado de elegibilidad ya
 * calculado se puede comunicar al usuario tal cual -- AUTO -- o requiere
 * revisión humana -- ESCALATE, ej. score en zona borderline). El campo
 * `stage` en el Payload es el único discriminador entre ambos modos; el
 * contrato de cada uno (`UnderstandOutput` vs. `EligibilityResult`) no se
 * mezcla ni se infiere por otra heurística.
 *
 * Variables de entorno:
 *  - POLICY_FILE_PATH: ruta absoluta a `policies.yaml`, default resuelto
 *    relativo a este archivo compilado (`dist/handler.js` -> `dist/
 *    policies.yaml`). Devops copia el `policies.yaml` real de la raíz del
 *    monorepo ahí al empaquetar el Lambda (mismo criterio que
 *    `services/transaction-agent/src/index.ts`).
 *
 * Reliability: este handler NUNCA lanza una excepción sin manejar ni deja
 * que el Lambda "crashee" -- cualquier fallo (yaml malformado, archivo no
 * encontrado, error inesperado) se atrapa y se responde con un
 * `PolicyDecisionResult` de fallback conservador (`ESCALATE`, nunca `AUTO`
 * por defecto -- mismo criterio que el fallback-por-defecto ya documentado
 * en `evaluateStage`/`policies.yaml`). Mismo criterio de Reliability que los
 * otros 3 servicios: siempre una respuesta válida, nunca un crash.
 */

let cachedPolicy: PolicyFile | null = null;

function getPolicy(): PolicyFile {
  if (cachedPolicy) return cachedPolicy;
  const policyPath = process.env.POLICY_FILE_PATH ?? path.resolve(__dirname, "./policies.yaml");
  cachedPolicy = loadPolicyFile(policyPath);
  return cachedPolicy;
}

function fallbackDecision(): PolicyDecisionResult {
  return {
    decision: "ESCALATE",
    matchedRules: [],
    winningRuleId: null,
    reason:
      "policy-agent no pudo evaluar policies.yaml (fallo interno) — escalado conservador por defecto.",
  };
}

/** Tipo del Payload que envía la Step Function en la segunda invocación
 * (Task "PostActionDecide"): un `EligibilityResult` completo con el campo
 * adicional `stage: "post_action"` a nivel raíz como discriminador. */
export type PostActionEvent = EligibilityResult & { stage: "post_action" };

/** Guard que distingue el Payload de `PostActionDecide` (post_action) del
 * `UnderstandOutput` crudo que sigue enviando el Task "Decide" existente
 * (pre_action, sin campo `stage`). No usa `instanceof` ni valida el resto de
 * la forma del objeto -- el único contrato fijo, diseñado por el
 * coordinador para el ASL de la Step Function, es la presencia de
 * `stage === "post_action"` a nivel raíz. */
function isPostActionEvent(event: unknown): event is PostActionEvent {
  return (
    typeof event === "object" &&
    event !== null &&
    (event as Record<string, unknown>).stage === "post_action"
  );
}

export async function handler(
  event: UnderstandOutput | PostActionEvent
): Promise<PolicyDecisionResult> {
  try {
    const policy = getPolicy();
    if (isPostActionEvent(event)) {
      return evaluatePostAction(event, policy);
    }
    return evaluatePreAction(event as UnderstandOutput, policy);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("policy-agent handler error", { error });
    return fallbackDecision();
  }
}
