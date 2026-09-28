import * as path from "node:path";
import type { DisputeVerificationResult, EligibilityResult, UnderstandOutput } from "@banking-agent/shared";
import { evaluatePostAction, evaluatePreAction, loadPolicyFile } from "./evaluator";
import type { PolicyDecisionResult, PolicyFile } from "./types";
import { getBedrockDeciderConfig } from "./bedrock/config";
import { proposeModelDecision } from "./bedrock/model-decider";
import type { DecisionStage, ModelProposal } from "./bedrock/model-decider";
import { applyModelGuardrail } from "./bedrock/guardrail";
import type { ExtendedPolicyDecisionResult } from "./bedrock/guardrail";

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
 *
 * Guardrail de Bedrock (capa "Decide" con modelo real, ver `./bedrock/`):
 * después de calcular `evaluatePreAction`/`evaluatePostAction` (SIN
 * CAMBIOS respecto de antes), este handler intenta obtener una propuesta
 * de decisión de Amazon Bedrock (`./bedrock/model-decider.ts`) y la combina
 * con el resultado del evaluador vía `./bedrock/guardrail.ts`
 * (`applyModelGuardrail`), que aplica "most-conservative-match-wins" (el
 * mismo mecanismo de `SEVERITY_ORDER` que ya usa `evaluateStage` para
 * combinar reglas entre sí) también entre la propuesta del modelo y la del
 * evaluador. Si Bedrock no está configurado (env vars de SSM ausentes),
 * no responde, o devuelve una `decision` fuera de enum, el resultado es
 * BIT-IDÉNTICO al que este handler devolvía antes de esta integración
 * (ver `applyModelGuardrail`, caso `modelProposal === null`). El `try/catch`
 * externo de más abajo (`fallbackDecision()`) sigue siendo la red de
 * seguridad de último recurso ante cualquier excepción no capturada; no
 * debería activarse por un fallo de Bedrock -- eso lo maneja
 * `./bedrock/model-decider.ts`/`./bedrock/guardrail.ts` internamente sin
 * lanzar nunca.
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
 * (Task "PostActionDecide"): un `EligibilityResult` (intent eligibility_check)
 * o `DisputeVerificationResult` (intent dispute_unrecognized_charge) completo,
 * con el campo adicional `stage: "post_action"` a nivel raíz como
 * discriminador. Cuál de los dos shapes es el real no se decide acá -- viaja
 * tal cual lo produjo transaction-agent hasta `evaluatePostAction`
 * (`PostActionResult`, `../evaluator.ts`), que sí distingue entre ambos en
 * runtime por presencia de campos (nunca por `instanceof`). */
export type PostActionEvent = (EligibilityResult | DisputeVerificationResult) & { stage: "post_action" };

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

/** Input que se le manda al modelo: el `EligibilityResult`/
 * `DisputeVerificationResult` completo (sin el campo `stage`, que es un
 * discriminador propio del contrato interno de este Lambda, no parte de
 * ninguno de los dos contratos) para post_action, o el `UnderstandOutput`
 * crudo para pre_action. */
function toModelInput(
  event: UnderstandOutput | PostActionEvent,
  stage: DecisionStage
): UnderstandOutput | EligibilityResult | DisputeVerificationResult {
  if (stage === "post_action") {
    const { stage: _stage, ...postActionResult } = event as PostActionEvent;
    return postActionResult;
  }
  return event as UnderstandOutput;
}

/** IDs de correlación para el log estructurado -- `caseId`/`turnId` de
 * `UnderstandOutput.context` en pre_action, `caseId` de `EligibilityResult`
 * en post_action (no tiene `turnId` propio, ver `../packages/shared`). */
function correlationIds(event: UnderstandOutput | PostActionEvent): { caseId?: string; turnId?: string } {
  if (isPostActionEvent(event)) {
    return { caseId: event.caseId };
  }
  const understandEvent = event as UnderstandOutput;
  return { caseId: understandEvent.context?.caseId, turnId: understandEvent.context?.turnId };
}

function logDecisionSource(
  event: UnderstandOutput | PostActionEvent,
  ruleResult: PolicyDecisionResult,
  modelProposal: ModelProposal | null,
  finalResult: ExtendedPolicyDecisionResult
): void {
  const winner: "rules" | "model" | "rules_only_bedrock_unavailable" =
    modelProposal === null ? "rules_only_bedrock_unavailable" : finalResult.decisionSource ?? "rules";
  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify({
      event: "policy_decision_source",
      ...correlationIds(event),
      ruleDecision: ruleResult.decision,
      modelDecision: modelProposal?.decision ?? null,
      modelConfidence: modelProposal?.confidence ?? null,
      finalDecision: finalResult.decision,
      winner,
    })
  );
}

/** Orquesta el guardrail de Bedrock alrededor de `ruleResult`, ya calculado
 * por `evaluatePreAction`/`evaluatePostAction` SIN CAMBIOS. Nunca lanza --
 * cualquier fallo de Bedrock/SSM se resuelve internamente (ver
 * `./bedrock/config.ts`/`./bedrock/model-decider.ts`) a "propuesta no
 * disponible", y `applyModelGuardrail` devuelve `ruleResult` tal cual en
 * ese caso. */
async function decideWithModelGuardrail(
  event: UnderstandOutput | PostActionEvent,
  stage: DecisionStage,
  ruleResult: PolicyDecisionResult
): Promise<ExtendedPolicyDecisionResult> {
  const bedrockConfig = await getBedrockDeciderConfig();

  let modelProposal: ModelProposal | null = null;
  if (bedrockConfig) {
    modelProposal = await proposeModelDecision(toModelInput(event, stage), stage, {
      bedrockClient: bedrockConfig.bedrockClient,
      modelId: bedrockConfig.modelId,
    });
  }

  const finalResult = applyModelGuardrail(ruleResult, modelProposal);
  logDecisionSource(event, ruleResult, modelProposal, finalResult);
  return finalResult;
}

export async function handler(
  event: UnderstandOutput | PostActionEvent
): Promise<PolicyDecisionResult> {
  try {
    const policy = getPolicy();
    if (isPostActionEvent(event)) {
      const ruleResult = evaluatePostAction(event, policy);
      return await decideWithModelGuardrail(event, "post_action", ruleResult);
    }
    const ruleResult = evaluatePreAction(event as UnderstandOutput, policy);
    return await decideWithModelGuardrail(event, "pre_action", ruleResult);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("policy-agent handler error", { error });
    return fallbackDecision();
  }
}
