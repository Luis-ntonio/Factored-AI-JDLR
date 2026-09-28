import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { CUSTOMERS } from "@banking-agent/transaction-agent/dist/data/mock-core-banking";
import { getAuthConfig, getOtpConfig } from "./config";
import { attemptLogin, type LoginRequest } from "./login";
import { attemptOtpRequest, type OtpRequestRequest } from "./otp/request";
import { attemptOtpVerify, type OtpVerifyRequest } from "./otp/verify";
import { buildOtpDocClientFromEnv, DynamoDbOtpStore } from "./otp/store";

/**
 * Handler de Lambda para las 3 rutas de auth-agent, despachadas por
 * `rawPath` (las 3 comparten la MISMA integración de API Gateway -- ver
 * `terraform/modules/edge` -- así que un solo Lambda/handler las atiende
 * todas, nunca 3 Lambdas separados para algo tan chico):
 *   - `POST /auth/login`: documento + nombre + apellido -> sessionToken
 *     (existente, sin cambios de comportamiento).
 *   - `POST /auth/otp/request`: solo documento -> dispara un código de un
 *     solo uso por email (Resend). SIEMPRE responde `{ok:true}` exista o no
 *     el documento -- ver docstring de `otp/request.ts`.
 *   - `POST /auth/otp/verify`: documento + código -> sessionToken (mismo
 *     shape que `/auth/login`), consumiendo el código (un solo uso).
 *
 * Nunca devuelve 401/403 -- SIEMPRE 200 con `{ok: true, ...}` o
 * `{ok: false, reason}` en el body (mismo criterio de Reliability que el
 * resto del pipeline: nunca un 5xx sin body, el cliente HTTP decide cómo
 * reaccionar al campo `ok`).
 */
function parseBody<T>(event: APIGatewayProxyEventV2): Partial<T> {
  if (!event.body) return {};
  try {
    const raw = event.isBase64Encoded ? Buffer.from(event.body, "base64").toString("utf-8") : event.body;
    return JSON.parse(raw) as Partial<T>;
  } catch {
    return {};
  }
}

function jsonResponse(body: unknown): APIGatewayProxyResultV2 {
  return { statusCode: 200, headers: { "content-type": "application/json" }, body: JSON.stringify(body) };
}

let otpStore: DynamoDbOtpStore | undefined;

function getOtpStore(tableName: string): DynamoDbOtpStore {
  if (!otpStore) {
    otpStore = new DynamoDbOtpStore({ tableName, docClient: buildOtpDocClientFromEnv() });
  }
  return otpStore;
}

export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const path = event.rawPath ?? "";

  try {
    if (path === "/auth/otp/request") {
      const body = parseBody<OtpRequestRequest>(event);
      const otpConfig = await getOtpConfig();
      const result = await attemptOtpRequest(body, {
        customers: CUSTOMERS,
        store: getOtpStore(otpConfig.otpTableName),
        resendApiKey: otpConfig.resendApiKey,
        fromEmail: otpConfig.resendFromEmail,
      });
      return jsonResponse(result);
    }

    if (path === "/auth/otp/verify") {
      const body = parseBody<OtpVerifyRequest>(event);
      const { sessionSecret } = await getAuthConfig();
      const otpConfig = await getOtpConfig();
      const result = await attemptOtpVerify(body, {
        customers: CUSTOMERS,
        store: getOtpStore(otpConfig.otpTableName),
        sessionSecret,
      });
      return jsonResponse(result);
    }

    // Default: /auth/login (comportamiento existente, sin cambios).
    const body = parseBody<LoginRequest>(event);
    const { sessionSecret } = await getAuthConfig();
    const result = attemptLogin(body, CUSTOMERS, sessionSecret);
    return jsonResponse(result);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("auth-agent handler error", { path, error });
    return jsonResponse({ ok: false, reason: "invalid_request" });
  }
}
