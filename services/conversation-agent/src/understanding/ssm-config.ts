import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";

/**
 * Resolución en runtime de la configuración de Bedrock (model id + región)
 * vía SSM Parameter Store, en vez de hardcodearla.
 *
 * devops provisiona dos variables de entorno en el Lambda de
 * conversation-agent con el NOMBRE del parámetro SSM (no el valor):
 *  - BEDROCK_MODEL_ID_PARAM_NAME
 *  - BEDROCK_REGION_PARAM_NAME
 *
 * Se resuelve una sola vez por proceso (cache en memoria, mismo patrón
 * `cachedStore`/`let cachedX: X | null = null` de `src/index.ts`) para no
 * pagar el costo de un GetParameter por turno.
 *
 * Si `BEDROCK_MODEL_ID_PARAM_NAME` no está seteada (ej. local/test sin
 * devops todavía, o backend "heuristic") o el GetParameter falla, se trata
 * como "Bedrock no disponible" (`null`) y el caller (understand-backend.ts)
 * hace fallback a heurística — esta función NUNCA lanza.
 *
 * `BEDROCK_REGION_PARAM_NAME` es opcional: si no está seteada, se usa
 * `AWS_REGION` (inyectada automáticamente por Lambda, ver comentario en
 * `src/index.ts`) como región por default para el cliente de Bedrock.
 */

export interface BedrockConfig {
  modelId: string;
  region: string;
}

let cacheAttempted = false;
let cachedConfig: BedrockConfig | null = null;

/** Solo para tests: resetea el cache en memoria entre casos. */
export function resetBedrockConfigCache(): void {
  cacheAttempted = false;
  cachedConfig = null;
}

export async function getBedrockConfig(ssmClient?: SSMClient): Promise<BedrockConfig | null> {
  if (cacheAttempted) {
    return cachedConfig;
  }
  cacheAttempted = true;

  const modelIdParamName = process.env.BEDROCK_MODEL_ID_PARAM_NAME;
  if (!modelIdParamName) {
    cachedConfig = null;
    return null;
  }

  const client = ssmClient ?? new SSMClient({ region: process.env.AWS_REGION });

  try {
    const modelIdResult = await client.send(new GetParameterCommand({ Name: modelIdParamName }));
    const modelId = modelIdResult.Parameter?.Value;
    if (!modelId) {
      cachedConfig = null;
      return null;
    }

    let region = process.env.AWS_REGION ?? "us-east-1";
    const regionParamName = process.env.BEDROCK_REGION_PARAM_NAME;
    if (regionParamName) {
      const regionResult = await client.send(new GetParameterCommand({ Name: regionParamName }));
      if (regionResult.Parameter?.Value) {
        region = regionResult.Parameter.Value;
      }
    }

    cachedConfig = { modelId, region };
    return cachedConfig;
  } catch {
    cachedConfig = null;
    return null;
  }
}
