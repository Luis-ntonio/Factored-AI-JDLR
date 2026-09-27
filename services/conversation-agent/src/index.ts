import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { randomUUID } from "crypto";
import { UnderstandOutput, emptyEntities } from "@banking-agent/shared";
import { ConversationStateStore, buildDocClientFromEnv } from "./context/state-store";
import { buildUnderstandOutput } from "./context/context-manager";

/**
 * Handler de Lambda para `POST /chat` (ruta ya preparada por devops en
 * `terraform/modules/edge`, sin conectar todavía — ver README de ese
 * módulo). Este handler implementa SOLO la capa Understand: no decide si una
 * acción se ejecuta (eso es policy-agent) ni genera la respuesta final al
 * usuario (retrieval-agent/transaction-agent) — su output es exactamente el
 * contrato `UnderstandOutput` de `packages/shared`.
 *
 * Variables de entorno esperadas (a configurar por devops al conectar el
 * Lambda real):
 *  - CASE_STORE_TABLE_NAME: nombre de la tabla (output `case_store_table_name`
 *    de `terraform/envs/dev`, ej. "banking-agent-dev-case-store").
 *  - AWS_REGION: la inyecta Lambda automáticamente.
 *
 * Body esperado (JSON):
 *  { "caseId"?: string, "customerId"?: string | null, "message": string }
 *  - `caseId` ausente => se genera uno nuevo (conversación nueva).
 *  - `customerId` ausente/null => cliente aún no identificado en este turno.
 *
 * Reliability: este handler NUNCA debe devolver un 5xx por una falla de
 * DynamoDB (eso lo maneja `ConversationStateStore` con reintentos + fallback
 * degradado) ni por una excepción inesperada del propio router — el
 * try/catch de más afuera devuelve igual un `UnderstandOutput` válido con
 * `intent: "unknown"` y `context.degraded = true` en vez de perder el turno.
 */

let cachedStore: ConversationStateStore | null = null;

function getStore(): ConversationStateStore {
  if (cachedStore) return cachedStore;
  const tableName = process.env.CASE_STORE_TABLE_NAME;
  if (!tableName) {
    throw new Error("CASE_STORE_TABLE_NAME env var no configurada");
  }
  cachedStore = new ConversationStateStore({
    tableName,
    docClient: buildDocClientFromEnv(process.env.AWS_REGION),
  });
  return cachedStore;
}

interface ChatRequestBody {
  caseId?: string;
  customerId?: string | null;
  message: string;
}

function parseBody(event: APIGatewayProxyEventV2): ChatRequestBody {
  if (!event.body) {
    throw new Error("body vacío");
  }
  const raw = event.isBase64Encoded ? Buffer.from(event.body, "base64").toString("utf-8") : event.body;
  const parsed = JSON.parse(raw) as Partial<ChatRequestBody>;
  if (typeof parsed.message !== "string" || parsed.message.trim().length === 0) {
    throw new Error("'message' es requerido y debe ser un string no vacío");
  }
  return {
    caseId: parsed.caseId,
    customerId: parsed.customerId ?? null,
    message: parsed.message,
  };
}

/** Fallback seguro cuando ni siquiera se pudo procesar el turno (ej. body inválido,
 * excepción inesperada no relacionada a DynamoDB). Nunca se lanza un 5xx sin body. */
function safeFallbackOutput(caseId: string, messageId: string): UnderstandOutput {
  return {
    intent: "unknown",
    language: "es",
    entities: emptyEntities(),
    missing_fields: [],
    context: {
      caseId,
      customerId: null,
      turnId: messageId,
      degraded: true,
      degradedReason: "internal_error",
      historyTurns: 0,
    },
  };
}

export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const caseId = safeParseCaseId(event) ?? randomUUID();
  const messageId = randomUUID();

  try {
    const body = parseBody(event);
    const effectiveCaseId = body.caseId ?? caseId;
    const store = getStore();

    const output = await buildUnderstandOutput(
      {
        caseId: effectiveCaseId,
        customerId: body.customerId ?? null,
        messageId,
        message: body.message,
      },
      store
    );

    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(output),
    };
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("conversation-agent handler error", { caseId, messageId, error });
    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(safeFallbackOutput(caseId, messageId)),
    };
  }
}

function safeParseCaseId(event: APIGatewayProxyEventV2): string | null {
  try {
    if (!event.body) return null;
    const raw = event.isBase64Encoded ? Buffer.from(event.body, "base64").toString("utf-8") : event.body;
    const parsed = JSON.parse(raw) as Partial<ChatRequestBody>;
    return parsed.caseId ?? null;
  } catch {
    return null;
  }
}
