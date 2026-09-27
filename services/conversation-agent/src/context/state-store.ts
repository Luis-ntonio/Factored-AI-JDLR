import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { Entities, Intent, LanguageCode } from "@banking-agent/shared";

/**
 * Acceso a la tabla DynamoDB real `banking-agent-dev-case-store`
 * (`terraform/modules/data`, ver README de ese módulo para el schema base:
 * pk = CASE#<caseId>, sk = MSG#<messageId>, gsi1pk = CUSTOMER#<customerId>,
 * ttl habilitado).
 *
 * Modelado de estado de conversación en ese mismo schema (decisión de
 * conversation-agent, documentada en docs/CONTRACTS.md):
 *
 *  - Mensajes (log append-only, 1 item por turno de usuario):
 *      pk = CASE#<caseId>
 *      sk = MSG#<messageId>
 *      gsi1pk = CUSTOMER#<customerId>   (solo si customerId es conocido)
 *
 *  - Estado de conversación (equivalente a `e_ai_agent_conversation_state`
 *    del blueprint, sección 4.5 de
 *    E2E-Implementacion-AWS-Terraform-Databricks.md):
 *      pk = CASE#<caseId>
 *      sk = "STATE#latest"              <- item ADICIONAL con su propio sk,
 *                                            fijo (no timestamped), en la
 *                                            MISMA partición que los MSG#.
 *      gsi1pk = CUSTOMER#<customerId>   (si es conocido)
 *
 *    Se eligió UN SOLO item "STATE#latest" (upsert por turno) en vez de un
 *    item de estado por turno o de recalcular los slots escaneando todos los
 *    MSG# de la partición, por dos razones:
 *      1. Lectura O(1): un GetItem por clave exacta (pk, sk) en vez de un
 *         Query sobre toda la partición en cada turno (más barato y más
 *         predecible en latencia).
 *      2. El log de mensajes (MSG#) sigue siendo append-only e inmutable
 *         para auditoría; el estado derivado (slots acumulados) es lo único
 *         mutable, y vive separado a propósito.
 *
 * TTL: se escribe siempre un `ttl` (epoch seconds) con un default de 30 días
 * — PLACEHOLDER, a confirmar con policy-agent/devops cuando se defina la
 * política de retención real (ver terraform/modules/data/README.md, que dice
 * explícitamente que la política de retención concreta la fija
 * policy-agent/devops en fase posterior).
 */

const DEFAULT_TTL_DAYS = 30;

export interface ConversationStateItem {
  caseId: string;
  customerId: string | null;
  entities: Entities;
  lastIntent: Intent;
  lastLanguage: LanguageCode;
  turnCount: number;
  updatedAt: string;
}

export interface MessageItem {
  caseId: string;
  messageId: string;
  customerId: string | null;
  role: "user";
  text: string;
  intent: Intent;
  language: LanguageCode;
  createdAt: string;
}

export type DdbResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: unknown };

export interface StateStoreConfig {
  tableName: string;
  /** Cliente inyectable para tests (mock) — en Lambda real se construye desde @aws-sdk. */
  docClient: DynamoDBDocumentClient;
  /** Reintentos acotados ante fallo de DynamoDB (Reliability, docs/EVALUATION-CRITERIA.md). */
  maxRetries?: number;
  baseDelayMs?: number;
  ttlDays?: number;
}

export function buildDocClientFromEnv(region?: string): DynamoDBDocumentClient {
  const client = new DynamoDBClient({ region });
  return DynamoDBDocumentClient.from(client);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Reintentos acotados con backoff corto (no bloquea el turno del usuario por
 * mucho tiempo: por defecto 2 reintentos, ~75ms y ~150ms de espera). Nunca
 * reintenta indefinidamente — al agotar los intentos, devuelve
 * `{ ok: false }` en vez de lanzar, para que el caller pueda aplicar el
 * fallback seguro documentado (degradar, no crashear).
 */
async function withRetry<T>(fn: () => Promise<T>, maxRetries: number, baseDelayMs: number): Promise<DdbResult<T>> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const value = await fn();
      return { ok: true, value };
    } catch (error) {
      lastError = error;
      if (attempt < maxRetries) {
        await sleep(baseDelayMs * Math.pow(2, attempt));
      }
    }
  }
  return { ok: false, error: lastError };
}

function ttlFromNow(days: number): number {
  return Math.floor(Date.now() / 1000) + days * 24 * 60 * 60;
}

export class ConversationStateStore {
  private readonly tableName: string;
  private readonly docClient: DynamoDBDocumentClient;
  private readonly maxRetries: number;
  private readonly baseDelayMs: number;
  private readonly ttlDays: number;

  constructor(config: StateStoreConfig) {
    this.tableName = config.tableName;
    this.docClient = config.docClient;
    this.maxRetries = config.maxRetries ?? 2;
    this.baseDelayMs = config.baseDelayMs ?? 75;
    this.ttlDays = config.ttlDays ?? DEFAULT_TTL_DAYS;
  }

  /** `value: null` significa "case nuevo, sin estado previo" (no es un error). */
  async getState(caseId: string): Promise<DdbResult<ConversationStateItem | null>> {
    return withRetry(
      async () => {
        const result = await this.docClient.send(
          new GetCommand({
            TableName: this.tableName,
            Key: { pk: `CASE#${caseId}`, sk: "STATE#latest" },
          })
        );
        if (!result.Item) return null;
        const item = result.Item;
        return {
          caseId: item.caseId,
          customerId: item.customerId ?? null,
          entities: item.entities,
          lastIntent: item.lastIntent,
          lastLanguage: item.lastLanguage,
          turnCount: item.turnCount,
          updatedAt: item.updatedAt,
        } as ConversationStateItem;
      },
      this.maxRetries,
      this.baseDelayMs
    );
  }

  async putState(state: ConversationStateItem): Promise<DdbResult<void>> {
    return withRetry(
      async () => {
        await this.docClient.send(
          new PutCommand({
            TableName: this.tableName,
            Item: {
              pk: `CASE#${state.caseId}`,
              sk: "STATE#latest",
              gsi1pk: state.customerId ? `CUSTOMER#${state.customerId}` : undefined,
              caseId: state.caseId,
              customerId: state.customerId,
              entities: state.entities,
              lastIntent: state.lastIntent,
              lastLanguage: state.lastLanguage,
              turnCount: state.turnCount,
              updatedAt: state.updatedAt,
              ttl: ttlFromNow(this.ttlDays),
            },
          })
        );
      },
      this.maxRetries,
      this.baseDelayMs
    );
  }

  async appendMessage(message: MessageItem): Promise<DdbResult<void>> {
    return withRetry(
      async () => {
        await this.docClient.send(
          new PutCommand({
            TableName: this.tableName,
            Item: {
              pk: `CASE#${message.caseId}`,
              sk: `MSG#${message.messageId}`,
              gsi1pk: message.customerId ? `CUSTOMER#${message.customerId}` : undefined,
              caseId: message.caseId,
              messageId: message.messageId,
              customerId: message.customerId,
              role: message.role,
              text: message.text,
              intent: message.intent,
              language: message.language,
              createdAt: message.createdAt,
              ttl: ttlFromNow(this.ttlDays),
            },
          })
        );
      },
      this.maxRetries,
      this.baseDelayMs
    );
  }
}
