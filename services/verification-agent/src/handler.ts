import * as path from "node:path";
import type { VerificationResult } from "@banking-agent/shared";
import { loadBorderlineThresholds, type BorderlineThresholds } from "./config/load-thresholds";
import { verifyResult } from "./verify";

/**
 * Handler de Lambda para la capa "Verify" del pipeline real (paso explícito
 * y visible entre ActRetrieval/ActTransaction y la respuesta comunicada al
 * usuario, ver `terraform/modules/orchestration/asl/chat-orchestrator.asl.json.tftpl`
 * -- ese wiring lo agrega devops, este servicio solo expone el handler).
 *
 * A DIFERENCIA de conversation-agent/retrieval-agent/transaction-agent (que
 * exponen un contrato `APIGatewayProxyEventV2`), y con el MISMO criterio que
 * `policy-agent`, verification-agent NUNCA se expone vía API Gateway -- solo
 * lo invoca la Step Function como un Task-a-Task interno. Por eso este
 * handler acepta y devuelve JSON PLANO, sin envoltura de API Gateway.
 *
 * Contrato:
 *   entrada: `VerificationInput` (ver `./types.ts`) -- `intent` +
 *            `result` (el body crudo, sin envoltura HTTP, de retrieval-agent
 *            o transaction-agent para ese intent).
 *   salida:  `VerificationResult` (`@banking-agent/shared`) -- SIEMPRE,
 *            nunca lanza.
 *
 * Variables de entorno:
 *  - POLICY_FILE_PATH: ruta absoluta a `policies.yaml`, default resuelto
 *    relativo a este archivo compilado (`dist/handler.js` -> raíz del
 *    monorepo, mismo criterio que transaction-agent). devops copia el
 *    `policies.yaml` real al empaquetar el Lambda.
 *
 * Sin acceso a DynamoDB ni a ningún otro recurso AWS -- este servicio solo
 * lee su copia empaquetada de `policies.yaml` y loguea a CloudWatch. El IAM
 * role de este Lambda debe ser el más mínimo posible (solo
 * `AWSLambdaBasicExecutionRole`, ver README.md).
 *
 * Reliability (no negociable, es el requisito central de esta pieza): este
 * handler NUNCA lanza una excepción sin manejar. Cualquier fallo (yaml
 * malformado, archivo no encontrado, bug no previsto en `verifyResult`) se
 * atrapa y se responde con `{ status: "pending_confirmation", verified:
 * false, reason: "verification_internal_error", data }` -- un fallo de
 * verification-agent JAMÁS se traduce en un resultado tratado como
 * verificado por defecto.
 */

let cachedThresholds: BorderlineThresholds | null = null;

function getThresholds(): BorderlineThresholds {
  if (cachedThresholds) return cachedThresholds;
  const policyPath = process.env.POLICY_FILE_PATH ?? path.resolve(__dirname, "../../../policies.yaml");
  cachedThresholds = loadBorderlineThresholds(policyPath);
  return cachedThresholds;
}

/** Mejor esfuerzo de eco del `result` de entrada cuando ni siquiera se pudo
 * completar la verificación (ej. `policies.yaml` falló al cargar) -- nunca
 * lanza, nunca asume una forma. */
function bestEffortEcho(event: unknown): unknown {
  if (typeof event !== "object" || event === null) return null;
  const v = event as Record<string, unknown>;
  return "result" in v ? v.result : null;
}

export async function handler(event: unknown): Promise<VerificationResult> {
  try {
    // `getThresholds` se pasa como función lazy: solo se invoca (y por lo
    // tanto solo puede lanzar) dentro de `verifyResult` si el camino de
    // `eligibility_check` efectivamente la necesita -- product_info/faq
    // nunca dependen de `policies.yaml`. Ver docstring de `verifyResult`.
    return verifyResult(event, getThresholds);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("verification-agent handler error", { error });
    return {
      status: "pending_confirmation",
      verified: false,
      reason: "verification_internal_error",
      data: bestEffortEcho(event),
    };
  }
}
