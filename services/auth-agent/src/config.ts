import { GetParameterCommand, SSMClient } from "@aws-sdk/client-ssm";

/**
 * Resuelve en runtime el secreto HMAC de sesión desde SSM Parameter Store
 * (SecureString) -- mismo patrón de caché en memoria + reintentos acotados
 * que `services/policy-agent/src/bedrock/config.ts` (`getBedrockDeciderConfig`).
 *
 * Variable de entorno:
 *  - SESSION_TOKEN_SECRET_PARAM_NAME: nombre del parámetro SSM (ej.
 *    "/banking-agent-dev/auth/session_token_secret"), provisto por
 *    Terraform (`terraform/modules/secrets`, `random_password` +
 *    `aws_ssm_parameter` SecureString -- el mismo secreto que lee
 *    conversation-agent para VERIFICAR el token que este servicio firma).
 *
 * A diferencia de la config de Bedrock (que puede devolver `null` y seguir
 * operando sin el guardrail), acá si el secreto no está disponible el
 * servicio NO PUEDE firmar tokens de forma segura -- `getSessionSecret()`
 * lanza, y `handler.ts` lo captura en su try/catch de nivel superior para
 * responder un error genérico (nunca firmar con un secreto inventado /
 * hardcodeado como fallback).
 */

export interface AuthConfig {
  sessionSecret: string;
}

let cachedConfig: AuthConfig | null | undefined;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface GetAuthConfigOptions {
  /** Inyectable para tests -- nunca pega a AWS real desde `npm test`. */
  ssmClient?: Pick<SSMClient, "send">;
  maxRetries?: number;
  baseDelayMs?: number;
}

export async function getAuthConfig(options: GetAuthConfigOptions = {}): Promise<AuthConfig> {
  if (cachedConfig !== undefined && cachedConfig !== null) return cachedConfig;

  const paramName = process.env.SESSION_TOKEN_SECRET_PARAM_NAME;
  if (!paramName) {
    throw new Error("SESSION_TOKEN_SECRET_PARAM_NAME env var no configurada");
  }

  const maxRetries = options.maxRetries ?? 2;
  const baseDelayMs = options.baseDelayMs ?? 75;
  const ssmClient = options.ssmClient ?? new SSMClient({});

  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await ssmClient.send(new GetParameterCommand({ Name: paramName, WithDecryption: true }));
      const value = result.Parameter?.Value;
      if (typeof value !== "string" || value.length === 0) {
        throw new Error(`Parámetro SSM ${paramName} vacío o sin valor`);
      }
      cachedConfig = { sessionSecret: value };
      return cachedConfig;
    } catch (error) {
      lastError = error;
      if (attempt < maxRetries) {
        await sleep(baseDelayMs * Math.pow(2, attempt));
      }
    }
  }

  throw new Error(`No se pudo leer el secreto de sesión desde SSM (${paramName}): ${String(lastError)}`);
}

/** Solo para tests -- resetea el caché en memoria entre casos. */
export function resetAuthConfigCacheForTests(): void {
  cachedConfig = undefined;
}
