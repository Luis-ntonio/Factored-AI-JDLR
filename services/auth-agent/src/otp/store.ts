import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DeleteCommand, DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";

/**
 * Acceso a la tabla DynamoDB `banking-agent-dev-otp-codes` (`terraform/
 * modules/data`) -- mismo esqueleto que `services/transaction-agent/src/
 * store/eligibility-store.ts` (`withRetry` + `DynamoDBDocumentClient`,
 * reintentos acotados, nunca reintento infinito).
 *
 * Item, un solo registro por documento (un pedido nuevo INVALIDA el
 * anterior -- `put` es upsert, no append):
 *   pk (hash key)  = document_id
 *   codeHash       = hashOtpCode(código), NUNCA el código en texto plano
 *   expiresAt      = TTL nativo de DynamoDB, epoch SEGUNDOS (10 min desde el pedido)
 *   attempts       = intentos de verificación fallidos, empieza en 0
 *   lastRequestedAt = epoch MILISEGUNDOS -- cooldown de reenvío (60s)
 *   customerId     = para no tener que re-resolver el customer en verify()
 */

const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_BASE_DELAY_MS = 75;
const CODE_TTL_SECONDS = 10 * 60;
export const MAX_VERIFY_ATTEMPTS = 5;
export const REQUEST_COOLDOWN_MS = 60 * 1000;

export interface OtpItem {
  documentId: string;
  codeHash: string;
  expiresAt: number;
  attempts: number;
  lastRequestedAt: number;
  customerId: string;
}

type DynamoResult<T> = { ok: true; value: T } | { ok: false; error: unknown };

export interface DynamoDbOtpStoreConfig {
  tableName: string;
  /** Cliente inyectable para tests (mock) -- en Lambda real se construye
   * desde `@aws-sdk/client-dynamodb` vía `buildOtpDocClientFromEnv`. */
  docClient: DynamoDBDocumentClient;
  maxRetries?: number;
  baseDelayMs?: number;
}

export function buildOtpDocClientFromEnv(region?: string): DynamoDBDocumentClient {
  const client = new DynamoDBClient({ region });
  return DynamoDBDocumentClient.from(client);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetry<T>(fn: () => Promise<T>, maxRetries: number, baseDelayMs: number): Promise<DynamoResult<T>> {
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

function itemToOtp(item: Record<string, unknown>): OtpItem {
  return {
    documentId: item.pk as string,
    codeHash: item.codeHash as string,
    expiresAt: item.expiresAt as number,
    attempts: item.attempts as number,
    lastRequestedAt: item.lastRequestedAt as number,
    customerId: item.customerId as string,
  };
}

export type OtpGetResult = { status: "found"; value: OtpItem } | { status: "not_found" } | { status: "unavailable" };
export type OtpWriteResult = { status: "ok" } | { status: "unavailable" };

export class DynamoDbOtpStore {
  private readonly tableName: string;
  private readonly docClient: DynamoDBDocumentClient;
  private readonly maxRetries: number;
  private readonly baseDelayMs: number;

  constructor(config: DynamoDbOtpStoreConfig) {
    this.tableName = config.tableName;
    this.docClient = config.docClient;
    this.maxRetries = config.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.baseDelayMs = config.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  }

  async get(documentId: string): Promise<OtpGetResult> {
    const result = await withRetry(
      () => this.docClient.send(new GetCommand({ TableName: this.tableName, Key: { pk: documentId } })),
      this.maxRetries,
      this.baseDelayMs
    );

    if (!result.ok) return { status: "unavailable" };
    const item = result.value.Item;
    if (!item) return { status: "not_found" };
    return { status: "found", value: itemToOtp(item) };
  }

  /** Upsert -- un pedido nuevo pisa cualquier código/estado anterior del mismo documento. */
  async put(item: {
    documentId: string;
    codeHash: string;
    customerId: string;
    lastRequestedAt: number;
  }): Promise<OtpWriteResult> {
    const nowSeconds = Math.floor(item.lastRequestedAt / 1000);
    const result = await withRetry(
      () =>
        this.docClient.send(
          new PutCommand({
            TableName: this.tableName,
            Item: {
              pk: item.documentId,
              codeHash: item.codeHash,
              expiresAt: nowSeconds + CODE_TTL_SECONDS,
              attempts: 0,
              lastRequestedAt: item.lastRequestedAt,
              customerId: item.customerId,
            },
          })
        ),
      this.maxRetries,
      this.baseDelayMs
    );

    return result.ok ? { status: "ok" } : { status: "unavailable" };
  }

  async incrementAttempts(documentId: string): Promise<OtpWriteResult> {
    const result = await withRetry(
      () =>
        this.docClient.send(
          new UpdateCommand({
            TableName: this.tableName,
            Key: { pk: documentId },
            UpdateExpression: "SET attempts = attempts + :one",
            ExpressionAttributeValues: { ":one": 1 },
          })
        ),
      this.maxRetries,
      this.baseDelayMs
    );

    return result.ok ? { status: "ok" } : { status: "unavailable" };
  }

  /** Consumo de un solo uso -- se llama tras una verificación exitosa. */
  async delete(documentId: string): Promise<OtpWriteResult> {
    const result = await withRetry(
      () => this.docClient.send(new DeleteCommand({ TableName: this.tableName, Key: { pk: documentId } })),
      this.maxRetries,
      this.baseDelayMs
    );

    return result.ok ? { status: "ok" } : { status: "unavailable" };
  }
}
