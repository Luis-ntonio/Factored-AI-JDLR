import * as path from "node:path";
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import type { DisputeVerificationResult, EligibilityResult, UnderstandOutput } from "@banking-agent/shared";
import { isUnderstandOutput } from "@banking-agent/shared";
import { computeEligibility, EligibilityUnavailableError } from "./compute-eligibility";
import { computeDisputeVerification, DisputeUnavailableError } from "./compute-dispute";
import { loadBorderlineThresholds } from "./config/load-thresholds";
import { buildDocClientFromEnv, DynamoDbEligibilityStore } from "./store/eligibility-store";
import { DynamoDbDisputeStore } from "./store/dispute-store";
import type { EligibilityStore } from "./store/types";
import type { DisputeStore } from "./store/dispute-store-types";
import { StaticTransactionRepository } from "./repository/static-transaction-repository";
import type { TransactionRepository } from "./repository/types";
import { createRealEmbedFn } from "./matching/bedrock-embeddings";
import type { EmbedFn } from "./matching/transaction-matcher";

export { computeEligibility, EligibilityUnavailableError } from "./compute-eligibility";
export { computeDisputeVerification, DisputeUnavailableError } from "./compute-dispute";
export * from "./scoring/compute-score";
export * from "./scoring/score-zone";
export * from "./config/load-thresholds";
export * from "./store";

// --- Flujo NUEVO y aditivo: transaction-dispute intake --------------------
// (ver hacka-info/EDA_LATAM_Bank_resumen.md). Repositorio de solo LECTURA
// contra el "core bancario" simulado (clientes/productos/transacciones), ya
// CONECTADO a la capa Act vía `computeDisputeVerification` + la rama
// `dispute_unrecognized_charge` del handler de abajo. No interfiere con el
// flujo de elegibilidad de arriba.
export * from "./data/mock-core-banking";
export * from "./repository";

/**
 * Handler de Lambda para la parte transaccional de la capa "Act". Discrimina
 * por `input.intent`, mismo criterio que policy-agent discrimina por
 * `stage`, en vez de ser un servicio nuevo:
 *
 *  - `intent: eligibility_check` -> cálculo de elegibilidad
 *    (`computeEligibility`), sin cambios respecto de checkpoints previos.
 *  - `intent: dispute_unrecognized_charge` -> verificación de disputa de
 *    cargo (`computeDisputeVerification`), flujo NUEVO y aditivo (ver
 *    `./compute-dispute.ts`).
 *
 * NO conectado a API Gateway/Terraform en este checkpoint (mismo criterio
 * que conversation-agent/policy-agent/retrieval-agent).
 *
 * Body esperado (JSON): un `UnderstandOutput` completo (contrato de
 * `@banking-agent/shared`), con `intent` en uno de los dos valores de
 * arriba, tal como lo produce conversation-agent y ya evaluado por
 * policy-agent. Este handler NO vuelve a evaluar `policies.yaml` -- asume
 * que quien lo invoca ya obtuvo `decision === "AUTO"` de `evaluatePreAction`
 * (ver limitación de orquestación en README.md: hoy esa garantía es un
 * contrato probado por test, no forzado en runtime -- mismo criterio que
 * retrieval-agent).
 *
 * Variables de entorno:
 *  - CASE_STORE_TABLE_NAME: nombre de la tabla DynamoDB real, default
 *    "banking-agent-dev-case-store" (MISMA tabla para elegibilidad y
 *    disputa, distintas `sk`).
 *  - POLICY_FILE_PATH: ruta absoluta a `policies.yaml`, default resuelto
 *    relativo a este archivo (raíz del monorepo). Solo la usa el camino de
 *    `eligibility_check`.
 *  - AWS_REGION: la inyecta Lambda automáticamente.
 *
 * Reliability: este handler NUNCA devuelve un 5xx -- cualquier excepción
 * (body malformado, `EligibilityUnavailableError`/`DisputeUnavailableError`
 * por fallo del backend simulado tras agotar reintentos, o cualquier otro
 * error no anticipado) se atrapa y se responde igual con un envelope
 * `{ status, ... }` válido, `statusCode: 200`, mismo patrón que
 * conversation-agent/retrieval-agent. NUNCA se fabrica un `EligibilityResult`
 * ni un `DisputeVerificationResult` de reemplazo cuando el cálculo no pudo
 * confirmarse -- ver `compute-eligibility.ts`/`compute-dispute.ts`.
 */

export interface EligibilityHandlerResponse {
  status: "ok" | "unavailable" | "rejected";
  result?: EligibilityResult;
  /** Motivo cuando `status !== "ok"` -- nunca incluye datos crudos de
   * `entities` (evita fuga de PII vía `document_id`, mismo criterio de
   * seguridad que `policies.yaml`, sección `security`). */
  reason?: string;
}

/** Mismo shape que `EligibilityHandlerResponse`, para el camino
 * `dispute_unrecognized_charge`. Se mantiene como interfaz separada (en vez
 * de generalizar con un genérico) para no tocar el contrato ya probado de
 * `EligibilityHandlerResponse`. */
export interface DisputeHandlerResponse {
  status: "ok" | "unavailable" | "rejected";
  result?: DisputeVerificationResult;
  /** Motivo cuando `status !== "ok"` -- nunca incluye datos crudos de
   * `entities` (evita fuga de PII vía `document_id`). */
  reason?: string;
}

let cachedStore: EligibilityStore | null = null;
let cachedThresholds: { min: number; max: number } | null = null;
let cachedDisputeStore: DisputeStore | null = null;
let cachedRepository: TransactionRepository | null = null;
let cachedEmbedFn: EmbedFn | null = null;

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

/** Store de disputa, MISMA tabla real que `getStore()` (mismo
 * `CASE_STORE_TABLE_NAME`, distinta `sk`) -- no hay variable de entorno
 * nueva ni cambio de IAM (ver docstring de cabecera de este archivo). */
function getDisputeStore(): DisputeStore {
  if (cachedDisputeStore) return cachedDisputeStore;
  const tableName = process.env.CASE_STORE_TABLE_NAME ?? "banking-agent-dev-case-store";
  cachedDisputeStore = new DynamoDbDisputeStore({
    tableName,
    docClient: buildDocClientFromEnv(process.env.AWS_REGION),
  });
  return cachedDisputeStore;
}

/** Instancia cacheada de `StaticTransactionRepository` -- 100% en memoria,
 * sin variable de entorno nueva (ver docstring de cabecera de este
 * archivo). */
function getRepository(): TransactionRepository {
  if (cachedRepository) return cachedRepository;
  cachedRepository = new StaticTransactionRepository();
  return cachedRepository;
}

/** `EmbedFn` real (Bedrock Titan) usada por el matcher de transacciones
 * ambiguas de `computeDisputeVerification` -- ver `matching/
 * bedrock-embeddings.ts`. Instanciada una sola vez por proceso Lambda,
 * mismo patrón `cachedX`/`getX()` de arriba. La función en sí nunca lanza
 * ni requiere red hasta que se INVOCA (la resolución de config SSM es
 * lazy, dentro de `createRealEmbedFn`), así que cachearla acá es barato
 * incluso en el camino donde nunca se termina llamando. */
function getEmbedFn(): EmbedFn {
  if (cachedEmbedFn) return cachedEmbedFn;
  cachedEmbedFn = createRealEmbedFn();
  return cachedEmbedFn;
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

function respond(body: EligibilityHandlerResponse | DisputeHandlerResponse): APIGatewayProxyResultV2 {
  return {
    statusCode: 200,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  };
}

export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  try {
    const input = parseBody(event);

    // Rechazo defensivo: transaction-agent SOLO actúa sobre los dos intents
    // ya autorizados AUTO por policy-agent (ver docstring de este archivo).
    // No hay orquestador real todavía que impida esta llamada en runtime
    // (misma limitación que retrieval-agent) -- esta es la última línea de
    // defensa en código, no un chequeo redundante de `policies.yaml`.
    if (input.intent === "eligibility_check") {
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
    }

    if (input.intent === "dispute_unrecognized_charge") {
      if (input.entities.document_id === null) {
        return respond({ status: "rejected", reason: "entities.document_id ausente" });
      }

      const disputeStore = getDisputeStore();
      const repository = getRepository();

      const result = await computeDisputeVerification(
        {
          caseId: input.context.caseId,
          turnId: input.context.turnId,
          entities: input.entities,
          language: input.language,
          selectedTransactionId: input.context.selectedTransactionId ?? null,
        },
        { store: disputeStore, repository, embed: getEmbedFn() }
      );

      return respond({ status: "ok", result });
    }

    return respond({
      status: "rejected",
      reason: `intent "${input.intent}" no corresponde a transaction-agent (solo eligibility_check/dispute_unrecognized_charge)`,
    });
  } catch (error) {
    if (error instanceof EligibilityUnavailableError || error instanceof DisputeUnavailableError) {
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
