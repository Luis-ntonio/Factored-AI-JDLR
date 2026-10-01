import { BedrockRuntimeClient } from "@aws-sdk/client-bedrock-runtime";
import { GetParameterCommand, SSMClient } from "@aws-sdk/client-ssm";

/**
 * Resuelve en runtime la configuración de Bedrock (model id + región) desde
 * SSM Parameter Store -- MISMOS 2 parámetros que ya consumen
 * conversation-agent/policy-agent (`module.secrets.
 * bedrock_model_id_parameter_name`/`bedrock_region_parameter_name`), nunca
 * parámetros nuevos. Mismo patrón de caché + reintentos que
 * `services/policy-agent/src/bedrock/config.ts` (copiado literal, ese
 * archivo no es importable entre servicios).
 *
 * A diferencia de policy-agent (donde Bedrock no disponible = "seguir solo
 * con el evaluador de reglas"), acá Bedrock es REQUERIDO -- sin él no hay
 * forma de generar el próximo mensaje del usuario sintético, así que
 * `run-simulation.ts` trata `null` como fallo de la simulación completa
 * (`status: "failed"`), nunca como una propuesta descartable.
 */
export interface ResolvedBedrockConfig {
  modelId: string;
  bedrockClient: Pick<BedrockRuntimeClient, "send">;
}

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
  console.error("admin-agent bedrock config: SSM GetParameter falló tras reintentos", {
    paramName: name,
    error: lastError,
  });
  return null;
}

export interface GetBedrockConfigOptions {
  /** Inyectable para tests -- nunca pega a AWS real desde `npm test`. */
  ssmClient?: Pick<SSMClient, "send">;
  maxRetries?: number;
  baseDelayMs?: number;
}

export async function getSimulationBedrockConfig(
  options: GetBedrockConfigOptions = {}
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

  cachedConfig = { modelId, bedrockClient: new BedrockRuntimeClient({ region }) };
  return cachedConfig;
}

/** Solo para tests -- resetea el caché en memoria entre casos. */
export function resetSimulationBedrockConfigCacheForTests(): void {
  cachedConfig = undefined;
}
