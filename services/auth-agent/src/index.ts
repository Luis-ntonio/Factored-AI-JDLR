import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { CUSTOMERS } from "@banking-agent/transaction-agent/dist/data/mock-core-banking";
import { getAuthConfig } from "./config";
import { attemptLogin, type LoginRequest } from "./login";

/**
 * Handler de Lambda para `POST /auth/login` -- login de PLATAFORMA
 * (independiente del chat, ver `apps/web/src/components/AuthPanel.tsx`),
 * no un turno de conversación. Body: `{document_id, first_name,
 * last_name}`. Nunca devuelve 401/403 -- SIEMPRE 200 con
 * `{ok: true, ...}` o `{ok: false, reason}` en el body (mismo criterio de
 * Reliability que el resto del pipeline: nunca un 5xx sin body, el cliente
 * HTTP decide cómo reaccionar al campo `ok`).
 *
 * Reliability: si SSM no está disponible (`getAuthConfig` lanza tras
 * agotar reintentos), se responde `{ok: false, reason: "invalid_request"}`
 * -- nunca se firma un token con un secreto inventado/hardcodeado como
 * fallback (eso comprometería la firma para TODOS los tokens, no solo
 * este login).
 */
function parseBody(event: APIGatewayProxyEventV2): Partial<LoginRequest> {
  if (!event.body) return {};
  try {
    const raw = event.isBase64Encoded ? Buffer.from(event.body, "base64").toString("utf-8") : event.body;
    return JSON.parse(raw) as Partial<LoginRequest>;
  } catch {
    return {};
  }
}

export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  try {
    const body = parseBody(event);
    const { sessionSecret } = await getAuthConfig();
    const result = attemptLogin(body, CUSTOMERS, sessionSecret);

    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(result),
    };
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("auth-agent handler error", { error });
    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ok: false, reason: "invalid_request" }),
    };
  }
}
