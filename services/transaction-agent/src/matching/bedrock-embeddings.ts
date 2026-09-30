import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";
import { getEmbeddingConfig } from "./embedding-config";
import type { EmbedFn } from "./transaction-matcher";

/**
 * Cliente de embeddings de Amazon Bedrock (`InvokeModel`, NO `Converse` --
 * los modelos de embeddings no son conversacionales) contra
 * `amazon.titan-embed-text-v2:0`. Verificado con una invocación real
 * contra la cuenta de este proyecto antes de construir este módulo
 * (devuelve un vector de 1024 dims) -- a diferencia del inference profile
 * de Claude Sonnet (`services/conversation-agent/.../ssm-config.ts`),
 * Titan Embeddings se invoca DIRECTO por su model ID, sin inference
 * profile (confirmado empíricamente, ver `terraform/modules/agent/main.tf`
 * para el IAM correspondiente).
 *
 * NUNCA lanza -- cualquier fallo (red, acceso denegado, modelo no
 * disponible) devuelve `null`, y el caller (`transaction-matcher.ts` vía
 * `compute-dispute.ts`) cae a `baselineScore` solamente. Un fallo de
 * Bedrock nunca debe bloquear ni degradar la resolución de una disputa por
 * debajo de lo que el sistema ya podía hacer sin este componente.
 */
export async function getEmbedding(
  text: string,
  config: { modelId: string; region: string },
  client?: Pick<BedrockRuntimeClient, "send">
): Promise<readonly number[] | null> {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const bedrockClient = client ?? new BedrockRuntimeClient({ region: config.region });

  try {
    const response = await bedrockClient.send(
      new InvokeModelCommand({
        modelId: config.modelId,
        contentType: "application/json",
        accept: "application/json",
        body: JSON.stringify({ inputText: trimmed }),
      })
    );

    const bodyText = Buffer.from(response.body as Uint8Array).toString("utf-8");
    const parsed = JSON.parse(bodyText) as { embedding?: unknown };
    if (!Array.isArray(parsed.embedding)) return null;
    if (!parsed.embedding.every((v) => typeof v === "number")) return null;
    return parsed.embedding as number[];
  } catch {
    return null;
  }
}

/** `EmbedFn` real para producción -- resuelve la config de SSM en la
 * primera llamada (cacheada por `getEmbeddingConfig`) y devuelve `null`
 * sin llamar a Bedrock si no está configurada (mismo criterio que el
 * resto del pipeline: "Bedrock no disponible" nunca bloquea, solo degrada
 * a `baselineScore`). Instanciada una sola vez por proceso Lambda
 * (`index.ts`, mismo patrón `cachedX`/`getX()` que `getRepository()`). */
export function createRealEmbedFn(): EmbedFn {
  return async (text: string) => {
    const config = await getEmbeddingConfig();
    if (!config) return null;
    return getEmbedding(text, config);
  };
}
