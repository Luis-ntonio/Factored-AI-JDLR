import { BedrockRuntimeClient } from "@aws-sdk/client-bedrock-runtime";
import { GetParameterCommand, SSMClient } from "@aws-sdk/client-ssm";

/**
 * Resuelve en runtime la configuración de Bedrock (model id + región) desde
 * SSM Parameter Store, con caché en memoria (mismo patrón `cachedPolicy` ya
 * usado en `../handler.ts`) y reintentos acotados con backoff corto (mismo
 * patrón `withRetry` de
 * `services/conversation-agent/src/context/state-store.ts`).
 *
 * Variables de entorno (mismos nombres que conversation-agent, por
 * consistencia -- ver devops):
 *  - BEDROCK_MODEL_ID_PARAM_NAME: nombre del parámetro SSM con el model id
 *    de Bedrock (ej. "/banking-agent-dev/bedrock/model_id").
 *  - BEDROCK_REGION_PARAM_NAME: nombre del parámetro SSM con la región de
 *    Bedrock (ej. "/banking-agent-dev/bedrock/region").
 *
 * Si CUALQUIERA de las dos env vars no está seteada, o la lectura de SSM
 * falla tras los reintentos, Bedrock se trata como NO DISPONIBLE (se
 * cachea `null`) -- nunca se lanza una excepción por esto: el caller
 * (`../handler.ts`) simplemente sigue con el evaluador de reglas solo, el
 * mismo comportamiento que existía antes de esta integración.
 */

export interface ResolvedBedrockConfig {
  modelId: string;
  bedrockClient: Pick<BedrockRuntimeClient, "send">;
}

/** `undefined` = todavía no resuelto en este ciclo de vida del Lambda.
 * `null` = resuelto como "no disponible" (env var faltante o SSM falló). */
let cachedConfig: ResolvedBedrockConfig | null | undefined;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getSsmParam(
  client: Pick<SSMClient, "send">,
  name: string,
  maxRetries: number,
  baseDelayMs: number
): Promise<string | null> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await client.send(new GetParameterCommand({ Name: name }));
      const value = result.Parameter?.Value;
      return typeof value === "string" && value.length > 0 ? value : null;
    } catch (error) {
      lastError = error;
      if (attempt < maxRetries) {
        await sleep(baseDelayMs * Math.pow(2, attempt));
      }
    }
  }
  // eslint-disable-next-line no-console
  console.error("policy-agent bedrock config: SSM GetParameter falló tras reintentos", {
    paramName: name,
    error: lastError,
  });
  return null;
}

export interface GetBedrockDeciderConfigOptions {
  /** Inyectable para tests -- nunca pega a AWS real desde `npm test`. */
  ssmClient?: Pick<SSMClient, "send">;
  maxRetries?: number;
  baseDelayMs?: number;
}

/**
 * Devuelve `{ modelId, bedrockClient }` listo para usar con
 * `../bedrock/model-decider.ts`, o `null` si Bedrock no está
 * configurado/disponible. Cachea el resultado en memoria -- solo hace las
 * llamadas a SSM la primera vez que se invoca dentro de la vida del
 * proceso/Lambda.
 */
export async function getBedrockDeciderConfig(
  options: GetBedrockDeciderConfigOptions = {}
): Promise<ResolvedBedrockConfig | null> {
  if (cachedConfig !== undefined) return cachedConfig;

  const modelParamName = process.env.BEDROCK_MODEL_ID_PARAM_NAME;
  const regionParamName = process.env.BEDROCK_REGION_PARAM_NAME;
  if (!modelParamName || !regionParamName) {
    cachedConfig = null;
    return cachedConfig;
  }

  const maxRetries = options.maxRetries ?? 2;
  const baseDelayMs = options.baseDelayMs ?? 75;
  const ssmClient = options.ssmClient ?? new SSMClient({});

  const [modelId, region] = await Promise.all([
    getSsmParam(ssmClient, modelParamName, maxRetries, baseDelayMs),
    getSsmParam(ssmClient, regionParamName, maxRetries, baseDelayMs),
  ]);

  if (!modelId || !region) {
    cachedConfig = null;
    return cachedConfig;
  }

  cachedConfig = {
    modelId,
    bedrockClient: new BedrockRuntimeClient({ region }),
  };
  return cachedConfig;
}

/** Solo para tests -- resetea el caché en memoria entre casos (mismo motivo
 * por el que `handler.test.ts` hace `vi.resetModules()` entre tests para el
 * `cachedPolicy` de `../handler.ts`). */
export function resetBedrockDeciderConfigCacheForTests(): void {
  cachedConfig = undefined;
}
