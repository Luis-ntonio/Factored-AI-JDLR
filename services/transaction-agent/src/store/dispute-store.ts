import { DynamoDBDocumentClient, GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import type { DisputeVerificationResult } from "@banking-agent/shared";
import type { DisputeGetResult, DisputePutResult, DisputeStore } from "./dispute-store-types";

/**
 * Acceso a la MISMA tabla DynamoDB real ya desplegada
 * `banking-agent-dev-case-store` que usa `DynamoDbEligibilityStore`
 * (`./eligibility-store.ts`) -- no se provisiona ni se referencia una tabla
 * nueva (confirmado leyendo `terraform/modules/agent/main.tf`: los permisos
 * `dynamodb:GetItem`/`dynamodb:PutItem` sobre `case_store_table_arn` ya
 * existen para este Lambda).
 *
 * Item de resultado de disputa, en la MISMA partición que ya usa
 * conversation-agent/eligibility para el caso (`pk = CASE#<caseId>`):
 *
 *   pk = CASE#<caseId>
 *   sk = RESULT#dispute#<turnId>
 *
 * Ver `packages/shared/src/contracts/dispute-verification-result.ts`
 * (resolución de la pregunta abierta (c) de `policies.yaml`,
 * `dispute_post_action_open_questions`) para la justificación completa de
 * por qué se eligió esta partición/clave, análoga a
 * `RESULT#eligibility#<turnId>`.
 *
 * IDEMPOTENCIA (pilar Reliability, requisito explícito de este checkpoint):
 * `idempotencyKey = "${caseId}:${turnId}"`, materializada como la clave
 * exacta `(pk, sk)` de arriba. `computeDisputeVerification()`
 * (`../compute-dispute.ts`) hace SIEMPRE un `getResult` antes de calcular; si
 * ya existe un item, se devuelve tal cual, SIN recalcular, SIN volver a
 * buscar la transacción y SIN volver a "bloquear" el producto -- esto es lo
 * que evita duplicar la acción en reintentos.
 *
 * Reliability: reintentos acotados con backoff corto, mismo patrón que
 * `DynamoDbEligibilityStore` (reusa `buildDocClientFromEnv` exportado desde
 * `./eligibility-store`, no lo duplica). Al agotar los reintentos, se
 * devuelve `{ status: "unavailable" }` -- nunca se lanza una excepción sin
 * manejar, y sobre todo, nunca se fabrica un `DisputeVerificationResult` de
 * reemplazo.
 *
 * `transactionId` es OMITIDO del `Item` cuando es `undefined` (nunca se
 * escribe una key con valor `undefined` a DynamoDB -- el SDK lo rechaza en
 * modo estricto, y aunque no lo rechazara, escribir `undefined` explícito no
 * tiene sentido semántico frente a "la key simplemente no está").
 */

const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_BASE_DELAY_MS = 75;

type DynamoResult<T> = { ok: true; value: T } | { ok: false; error: unknown };

export interface DynamoDbDisputeStoreConfig {
  tableName: string;
  /** Cliente inyectable para tests (mock) -- en Lambda real se construye
   * desde `@aws-sdk/client-dynamodb` vía `buildDocClientFromEnv`
   * (`./eligibility-store.ts`). */
  docClient: DynamoDBDocumentClient;
  maxRetries?: number;
  baseDelayMs?: number;
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

function itemToResult(item: Record<string, unknown>): DisputeVerificationResult {
  return {
    caseId: item.caseId as string,
    transactionFound: item.transactionFound as boolean,
    transactionId: item.transactionId as string | undefined,
    fraudSuspected: item.fraudSuspected as boolean,
    productBlocked: item.productBlocked as boolean,
  };
}

export class DynamoDbDisputeStore implements DisputeStore {
  private readonly tableName: string;
  private readonly docClient: DynamoDBDocumentClient;
  private readonly maxRetries: number;
  private readonly baseDelayMs: number;

  constructor(config: DynamoDbDisputeStoreConfig) {
    this.tableName = config.tableName;
    this.docClient = config.docClient;
    this.maxRetries = config.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.baseDelayMs = config.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  }

  async getResult(caseId: string, turnId: string): Promise<DisputeGetResult> {
    const result = await withRetry(
      () =>
        this.docClient.send(
          new GetCommand({
            TableName: this.tableName,
            Key: { pk: `CASE#${caseId}`, sk: `RESULT#dispute#${turnId}` },
          })
        ),
      this.maxRetries,
      this.baseDelayMs
    );

    if (!result.ok) {
      return { status: "unavailable", reason: "dynamodb_read_failed" };
    }
    const item = result.value.Item;
    if (!item) return { status: "not_found" };
    return { status: "found", value: itemToResult(item) };
  }

  async putResult(result: DisputeVerificationResult, turnId: string): Promise<DisputePutResult> {
    const item: Record<string, unknown> = {
      pk: `CASE#${result.caseId}`,
      sk: `RESULT#dispute#${turnId}`,
      caseId: result.caseId,
      transactionFound: result.transactionFound,
      fraudSuspected: result.fraudSuspected,
      productBlocked: result.productBlocked,
    };
    if (result.transactionId !== undefined) {
      item.transactionId = result.transactionId;
    }

    const putOutcome = await withRetry(
      () =>
        this.docClient.send(
          new PutCommand({
            TableName: this.tableName,
            Item: item,
          })
        ),
      this.maxRetries,
      this.baseDelayMs
    );

    if (!putOutcome.ok) {
      return { status: "unavailable", reason: "dynamodb_write_failed" };
    }
    return { status: "ok" };
  }
}
