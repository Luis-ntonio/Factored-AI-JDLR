import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";

/**
 * Resolución en runtime de la config del modelo de embeddings (model id +
 * región) vía SSM Parameter Store -- mismo patrón exacto que
 * `services/conversation-agent/src/understanding/ssm-config.ts`
 * (`getBedrockConfig`): cache en memoria por proceso, nunca lanza, `null`
 * si no está configurado (el caller cae a `baselineScore` solamente).
 *
 * Variable de entorno: `EMBEDDING_MODEL_ID_PARAM_NAME` (nombre del
 * parámetro SSM, no el valor -- provisto por Terraform,
 * `terraform/modules/secrets`, `aws_ssm_parameter.embedding_model_id`).
 * Región: `EMBEDDING_REGION` si está seteada, si no `AWS_REGION` (Lambda
 * la inyecta automáticamente).
 */

export interface EmbeddingConfig {
  modelId: string;
  region: string;
}

let cacheAttempted = false;
let cachedConfig: EmbeddingConfig | null = null;

/** Solo para tests: resetea el cache en memoria entre casos. */
export function resetEmbeddingConfigCache(): void {
  cacheAttempted = false;
  cachedConfig = null;
}

export async function getEmbeddingConfig(ssmClient?: Pick<SSMClient, "send">): Promise<EmbeddingConfig | null> {
  if (cacheAttempted) {
    return cachedConfig;
  }
  cacheAttempted = true;

  const modelIdParamName = process.env.EMBEDDING_MODEL_ID_PARAM_NAME;
  if (!modelIdParamName) {
    cachedConfig = null;
    return null;
  }

  const region = process.env.EMBEDDING_REGION ?? process.env.AWS_REGION ?? "us-east-1";
  const client = ssmClient ?? new SSMClient({ region });

  try {
    const result = await client.send(new GetParameterCommand({ Name: modelIdParamName }));
    const modelId = result.Parameter?.Value;
    if (!modelId) {
      cachedConfig = null;
      return null;
    }
    cachedConfig = { modelId, region };
    return cachedConfig;
  } catch {
    cachedConfig = null;
    return null;
  }
}
