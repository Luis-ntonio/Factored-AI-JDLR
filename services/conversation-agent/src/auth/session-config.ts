import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";

/**
 * Resolución en runtime del secreto HMAC de sesión (mismo secreto que
 * `services/auth-agent` usa para FIRMAR -- ver `packages/shared/src/
 * session-token.ts`) -- mismo patrón exacto que `understanding/
 * ssm-config.ts` (`getBedrockConfig`): cache en memoria por proceso, nunca
 * lanza. Si `SESSION_TOKEN_SECRET_PARAM_NAME` no está seteada o el
 * GetParameter falla, se trata como "verificación de sesión no disponible"
 * (`null`) -- el caller (`resolve-role.ts`) degrada a rol `anonimo`, NUNCA
 * bloquea el turno completo por esto (mismo criterio de Reliability que
 * el resto del pipeline: un fallo de una pieza opcional nunca tumba el
 * turno).
 */

let cacheAttempted = false;
let cachedSecret: string | null = null;

/** Solo para tests: resetea el cache en memoria entre casos. */
export function resetSessionSecretCache(): void {
  cacheAttempted = false;
  cachedSecret = null;
}

export async function getSessionSecret(ssmClient?: SSMClient): Promise<string | null> {
  if (cacheAttempted) return cachedSecret;
  cacheAttempted = true;

  const paramName = process.env.SESSION_TOKEN_SECRET_PARAM_NAME;
  if (!paramName) {
    cachedSecret = null;
    return null;
  }

  const client = ssmClient ?? new SSMClient({ region: process.env.AWS_REGION });

  try {
    const result = await client.send(new GetParameterCommand({ Name: paramName, WithDecryption: true }));
    const value = result.Parameter?.Value;
    cachedSecret = typeof value === "string" && value.length > 0 ? value : null;
    return cachedSecret;
  } catch {
    cachedSecret = null;
    return null;
  }
}
