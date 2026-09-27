import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import type { RetrievalResult, UnderstandOutput } from "@banking-agent/shared";
import { isUnderstandOutput } from "@banking-agent/shared";
import { handleRetrieval } from "./handle-retrieval";
import { DynamoDbCatalogRepository, buildDocClientFromEnv } from "./repository/dynamodb-catalog-repository";
import { StaticCatalogRepository } from "./repository/static-catalog-repository";
import type { CatalogRepository } from "./repository/types";

export { handleRetrieval } from "./handle-retrieval";
export * from "./repository";
export * from "./data/catalog";

/**
 * Handler de Lambda para la parte informativa de la capa "Act"
 * (product_info/faq). NO conectado a API Gateway/Terraform en este
 * checkpoint (mismo criterio que conversation-agent y policy-agent: código
 * real, Lambda-ready, sin conectar — ver README.md, sección "Estado").
 *
 * Body esperado (JSON): un `UnderstandOutput` completo (contrato de
 * `@banking-agent/shared`), tal como lo produce conversation-agent y ya
 * evaluado por policy-agent. Este handler NO vuelve a evaluar
 * `policies.yaml` — asume que quien lo invoca ya obtuvo `decision === "AUTO"`
 * de `evaluatePreAction` (ver limitación de orquestación en README.md: hoy
 * esa garantía es un contrato probado por test, no forzado en runtime).
 *
 * Variables de entorno:
 *  - CATALOG_BACKEND: `"static"` (default) | `"dynamodb"`.
 *  - CATALOG_TABLE_NAME: nombre de la tabla DynamoDB (solo si
 *    CATALOG_BACKEND=dynamodb), default "banking-agent-dev-product-catalog"
 *    (tabla PROPUESTA, no desplegada todavía — ver README.md).
 *  - AWS_REGION: la inyecta Lambda automáticamente.
 *
 * Reliability: este handler NUNCA devuelve un 5xx — cualquier excepción
 * (body malformado, fallo interno no relacionado a la fuente de datos) se
 * atrapa y se responde igual con un `RetrievalResult` válido,
 * `found: false`, `statusCode: 200`, mismo patrón que
 * `services/conversation-agent/src/index.ts`.
 */

let cachedRepo: CatalogRepository | null = null;

function getRepository(): CatalogRepository {
  if (cachedRepo) return cachedRepo;

  const backend = (process.env.CATALOG_BACKEND ?? "static").toLowerCase();
  if (backend === "dynamodb") {
    const tableName = process.env.CATALOG_TABLE_NAME ?? "banking-agent-dev-product-catalog";
    cachedRepo = new DynamoDbCatalogRepository({
      tableName,
      docClient: buildDocClientFromEnv(process.env.AWS_REGION),
    });
    return cachedRepo;
  }

  cachedRepo = new StaticCatalogRepository();
  return cachedRepo;
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

/** Fallback seguro cuando ni siquiera se pudo parsear el body — nunca se
 * lanza un 5xx sin body, y nunca se inventa contenido de catálogo/FAQ. */
function safeFallbackResult(): RetrievalResult {
  return {
    intent: "faq",
    language: "es",
    found: false,
    notes:
      "No se pudo procesar la solicitud (body ausente o con forma inválida de UnderstandOutput). No se generó ningún dato de catálogo/FAQ para compensar la falla.",
  };
}

export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  try {
    const input = parseBody(event);
    const repo = getRepository();
    const result = await handleRetrieval(input, repo);

    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(result),
    };
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("retrieval-agent handler error", { error });
    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(safeFallbackResult()),
    };
  }
}
