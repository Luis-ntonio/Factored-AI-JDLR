import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { CloudWatchLogsClient } from "@aws-sdk/client-cloudwatch-logs";
import { getAdminConfig } from "./config";
import { listConversations } from "./list-conversations";
import { getConversationTrace } from "./get-trace";

/**
 * Handler de Lambda para las 2 rutas del dashboard de admin, despachadas
 * por `rawPath` (mismo patrón que `services/auth-agent/src/index.ts` -- un
 * solo Lambda para rutas chicas y relacionadas, nunca uno por ruta):
 *   - `GET /admin/conversations`: lista de casos reales (Scan sobre
 *     `banking-agent-dev-case-store`).
 *   - `GET /admin/conversations/{caseId}/trace`: traza completa de un caso
 *     (leída de los logs de CloudWatch del Step Function -- ver
 *     `get-trace.ts`).
 *
 * Auth: header `x-admin-key` contra un SSM SecureString (`getAdminConfig`)
 * -- superficie SEPARADA del `sessionToken` de clientes bancarios (no hay
 * ni debe haber un rol "admin" en `UserRole`). Sin key o key incorrecta ->
 * 401, siempre con body (nunca un 5xx sin body, mismo criterio de
 * Reliability que el resto del pipeline).
 */

let docClient: DynamoDBDocumentClient | undefined;
function getDocClient(): DynamoDBDocumentClient {
  if (!docClient) {
    docClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
  }
  return docClient;
}

let logsClient: CloudWatchLogsClient | undefined;
function getLogsClient(): CloudWatchLogsClient {
  if (!logsClient) {
    logsClient = new CloudWatchLogsClient({});
  }
  return logsClient;
}

function jsonResponse(statusCode: number, body: unknown): APIGatewayProxyResultV2 {
  return { statusCode, headers: { "content-type": "application/json" }, body: JSON.stringify(body) };
}

async function isAuthorized(event: APIGatewayProxyEventV2): Promise<boolean> {
  const providedKey = event.headers?.["x-admin-key"] ?? event.headers?.["X-Admin-Key"];
  if (!providedKey) return false;
  const { adminApiKey } = await getAdminConfig();
  return providedKey === adminApiKey;
}

export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const path = event.rawPath ?? "";

  try {
    if (!(await isAuthorized(event))) {
      return jsonResponse(401, { ok: false, reason: "unauthorized" });
    }

    if (path === "/admin/conversations") {
      const tableName = process.env.CASE_STORE_TABLE_NAME;
      if (!tableName) return jsonResponse(500, { ok: false, reason: "config_missing" });

      const result = await listConversations(getDocClient(), tableName);
      if (!result.ok) return jsonResponse(503, { ok: false, reason: "dynamodb_unavailable" });
      return jsonResponse(200, { ok: true, conversations: result.value });
    }

    const traceMatch = path.match(/^\/admin\/conversations\/([^/]+)\/trace$/);
    if (traceMatch) {
      const caseId = decodeURIComponent(traceMatch[1]);
      const logGroupName = process.env.STATE_MACHINE_LOG_GROUP_NAME;
      if (!logGroupName) return jsonResponse(500, { ok: false, reason: "config_missing" });

      const result = await getConversationTrace(getLogsClient(), logGroupName, caseId);
      if (!result.ok) return jsonResponse(503, { ok: false, reason: "logs_unavailable_or_invalid_case_id" });
      return jsonResponse(200, { ok: true, turns: result.value });
    }

    return jsonResponse(404, { ok: false, reason: "not_found" });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("admin-agent handler error", { path, error });
    return jsonResponse(500, { ok: false, reason: "internal_error" });
  }
}
