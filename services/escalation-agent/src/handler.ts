import { isUnderstandOutput, type EscalationSummary } from "@banking-agent/shared";
import { buildEscalationSummary } from "./build-summary";
import { bestEffortFallback } from "./fallback";
import type { EscalationInput } from "./types";

/**
 * Handler de Lambda para la capa "Escalate" del pipeline real (última pieza
 * antes de que un humano reciba, o no, un resumen accionable). Reemplaza el
 * placeholder `RespondEscalate` de
 * `terraform/modules/orchestration/asl/chat-orchestrator.asl.json.tftpl`
 * (que hoy devuelve el `PolicyDecisionResult` crudo de policy-agent sin
 * resumir) -- ese wiring de Terraform/ASL lo hace devops, este servicio solo
 * expone el handler.
 *
 * Es invocado desde DOS orígenes distintos por la misma Step Function (ver
 * `EscalationInput` en `./types.ts` y el docstring de cabecera de
 * `packages/shared/src/contracts/escalation-summary.ts`):
 *   - `origin: "policy_decision"` -- policy-agent decidió ESCALATE en
 *     `pre_action`, antes de intentar cualquier acción.
 *   - `origin: "verification_failed"` -- se intentó una acción (retrieval-agent
 *     o transaction-agent) pero verification-agent la marcó
 *     `status: "pending_confirmation"`.
 *
 * A DIFERENCIA de conversation-agent/retrieval-agent/transaction-agent (que
 * exponen un contrato `APIGatewayProxyEventV2`), y con el MISMO criterio que
 * `policy-agent`/`verification-agent`, escalation-agent NUNCA se expone vía
 * API Gateway -- solo lo invoca la Step Function como un Task-a-Task interno.
 * Por eso este handler acepta y devuelve JSON PLANO, sin envoltura de API
 * Gateway.
 *
 * Contrato:
 *   entrada: `EscalationInput` (ver `./types.ts`).
 *   salida:  `EscalationSummary` (`@banking-agent/shared`) -- SIEMPRE, nunca
 *            lanza.
 *
 * Variables de entorno: NINGUNA. Este servicio no lee `policies.yaml` ni
 * ningún otro archivo -- es pura transformación de datos ya recolectados por
 * las capas anteriores del pipeline (Understand/Decide/Act/Verify), que le
 * llegan completos en el propio `EscalationInput`.
 *
 * Sin acceso a DynamoDB ni a ningún otro recurso AWS. El IAM role de este
 * Lambda debe ser el más mínimo posible (solo `AWSLambdaBasicExecutionRole`,
 * ver README.md).
 *
 * Reliability (AÚN MÁS crítico que en el resto del pipeline -- ver README.md,
 * esta es la ÚLTIMA capa antes de que un humano reciba, o no, información
 * accionable): este handler NUNCA lanza una excepción sin manejar.
 *   - Si `event.understand` no cumple la forma mínima de `UnderstandOutput`
 *     (`isUnderstandOutput`, `@banking-agent/shared`) -- incluyendo `event`
 *     no siendo un objeto, o `understand` ausente -- se responde
 *     directamente con `bestEffortFallback(event)` (ver `./fallback.ts`),
 *     sin siquiera intentar `buildEscalationSummary`.
 *   - Cualquier excepción inesperada dentro de `buildEscalationSummary`
 *     (bug no previsto, forma inesperada de `policyDecision`/
 *     `attemptedAction` más allá de lo que TS garantiza en runtime) se
 *     atrapa y también responde `bestEffortFallback(event)`.
 * En ambos casos, `bestEffortFallback` nunca expone `document_id` crudo y
 * nunca deja `pendingQuestion` en `null`.
 */
export async function handler(event: unknown): Promise<EscalationSummary> {
  try {
    if (typeof event !== "object" || event === null) {
      return bestEffortFallback(event);
    }
    const maybeInput = event as { understand?: unknown };
    if (!isUnderstandOutput(maybeInput.understand)) {
      return bestEffortFallback(event);
    }
    return buildEscalationSummary(event as EscalationInput);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("escalation-agent handler error", { error });
    return bestEffortFallback(event);
  }
}
