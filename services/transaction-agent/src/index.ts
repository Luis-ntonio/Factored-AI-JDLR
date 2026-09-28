import * as path from "node:path";
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import type { EligibilityResult, UnderstandOutput } from "@banking-agent/shared";
import { isUnderstandOutput } from "@banking-agent/shared";
import { computeEligibility, EligibilityUnavailableError } from "./compute-eligibility";
import { loadBorderlineThresholds } from "./config/load-thresholds";
import { buildDocClientFromEnv, DynamoDbEligibilityStore } from "./store/eligibility-store";
import type { EligibilityStore } from "./store/types";

export { computeEligibility, EligibilityUnavailableError } from "./compute-eligibility";
export * from "./scoring/compute-score";
export * from "./scoring/score-zone";
export * from "./config/load-thresholds";
export * from "./store";

// --- Flujo NUEVO y aditivo: transaction-dispute intake --------------------
// (ver hacka-info/EDA_LATAM_Bank_resumen.md). Repositorio de solo LECTURA
// contra el "core bancario" simulado (clientes/productos/transacciones),
// para que un futuro Lambda de Act (fuera del alcance de este checkpoint)
// identifique la transacción disputada y los productos/tarjetas del
// cliente. No interfiere con el flujo de elegibilidad de arriba.
export * from "./data/mock-core-banking";
export * from "./repository";

/**
 * Handler de Lambda para la parte transaccional de la capa "Act"
 * (cálculo de elegibilidad, `intent: eligibility_check`). NO conectado a
 * API Gateway/Terraform en este checkpoint (mismo criterio que
 * conversation-agent/policy-agent/retrieval-agent).
 *
 * Body esperado (JSON): un `UnderstandOutput` completo (contrato de
 * `@banking-agent/shared`), con `intent === "eligibility_check"`, tal como
 * lo produce conversation-agent y ya evaluado por policy-agent. Este
 * handler NO vuelve a evaluar `policies.yaml` -- asume que quien lo invoca
 * ya obtuvo `decision === "AUTO"` de `evaluatePreAction` (ver limitación de
 * orquestación en README.md: hoy esa garantía es un contrato probado por
 * test, no forzado en runtime -- mismo criterio que retrieval-agent).
 *
 * Variables de entorno:
 *  - CASE_STORE_TABLE_NAME: nombre de la tabla DynamoDB real, default
 *    "banking-agent-dev-case-store".
 *  - POLICY_FILE_PATH: ruta absoluta a `policies.yaml`, default resuelto
 *    relativo a este archivo (raíz del monorepo).
 *  - AWS_REGION: la inyecta Lambda automáticamente.
 *
 * Reliability: este handler NUNCA devuelve un 5xx -- cualquier excepción
 * (body malformado, `EligibilityUnavailableError` por fallo del backend
 * simulado tras agotar reintentos, o cualquier otro error no anticipado) se
 * atrapa y se responde igual con un envelope `{ status, ... }` válido,
 * `statusCode: 200`, mismo patrón que conversation-agent/retrieval-agent.
 * NUNCA se fabrica un `EligibilityResult` de reemplazo cuando el cálculo no
 * pudo confirmarse -- ver `compute-eligibility.ts`.
 */

export interface EligibilityHandlerResponse {
  status: "ok" | "unavailable" | "rejected";
  result?: EligibilityResult;
  /** Motivo cuando `status !== "ok"` -- nunca incluye datos crudos de
   * `entities` (evita fuga de PII vía `document_id`, mismo criterio de
   * seguridad que `policies.yaml`, sección `security`). */
  reason?: string;
}

let cachedStore: EligibilityStore | null = null;
let cachedThresholds: { min: number; max: number } | null = null;

function getStore(): EligibilityStore {
  if (cachedStore) return cachedStore;
  const tableName = process.env.CASE_STORE_TABLE_NAME ?? "banking-agent-dev-case-store";
  cachedStore = new DynamoDbEligibilityStore({
    tableName,
    docClient: buildDocClientFromEnv(process.env.AWS_REGION),
  });
  return cachedStore;
}

function getThresholds(): { min: number; max: number } {
  if (cachedThresholds) return cachedThresholds;
  const policyPath = process.env.POLICY_FILE_PATH ?? path.resolve(__dirname, "../../../policies.yaml");
  cachedThresholds = loadBorderlineThresholds(policyPath);
  return cachedThresholds;
}

function parseBody(event: APIGatewayProxyEventV2): UnderstandOutput {
  if (!event.body) {
    throw new Error("body vacío");
  }
  const raw = event.isBase64Encoded ? Buffer.from(event.body, "base64").toString("utf-8") : event.body;
  const parsed = JSON.parse(raw) as unknown;
  if (!isUnderstandOutput(parsed)) {
    throw new Error("body no cumple la forma de UnderstandOutput (@banking-agent/shared)");
  }
  return parsed;
}

function respond(body: EligibilityHandlerResponse): APIGatewayProxyResultV2 {
  return {
    statusCode: 200,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  };
}

export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  try {
    const input = parseBody(event);

    // Rechazo defensivo: transaction-agent SOLO actúa sobre eligibility_check
    // ya autorizado AUTO por policy-agent (ver docstring de este archivo).
    // No hay orquestador real todavía que impida esta llamada en runtime
    // (misma limitación que retrieval-agent) -- esta es la última línea de
    // defensa en código, no un chequeo redundante de `policies.yaml`.
    if (input.intent !== "eligibility_check") {
      return respond({
        status: "rejected",
        reason: `intent "${input.intent}" no corresponde a transaction-agent (solo eligibility_check)`,
      });
    }
    if (input.entities.product_type === null) {
      return respond({ status: "rejected", reason: "entities.product_type ausente" });
    }

    const store = getStore();
    const thresholds = getThresholds();

    const result = await computeEligibility(
      {
        caseId: input.context.caseId,
        turnId: input.context.turnId,
        productType: input.entities.product_type,
        entities: input.entities,
      },
      { store, thresholds }
    );

    return respond({ status: "ok", result });
  } catch (error) {
    if (error instanceof EligibilityUnavailableError) {
      // eslint-disable-next-line no-console
      console.error("transaction-agent: backend simulado no disponible", {
        reason: error.reason,
        message: error.message,
      });
      return respond({ status: "unavailable", reason: error.reason });
    }
    // eslint-disable-next-line no-console
    console.error("transaction-agent handler error", { error });
    return respond({ status: "unavailable", reason: "internal_error" });
  }
}
