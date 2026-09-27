import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import type { EligibilityResult } from "@banking-agent/shared";
import type { EligibilityGetResult, EligibilityPutResult, EligibilityStore } from "./types";

/**
 * Acceso a la tabla DynamoDB REAL ya desplegada `banking-agent-dev-case-store`
 * (`terraform/modules/data`, mismo schema `pk`/`sk`/`gsi1pk`/`ttl` que ya
 * usa `services/conversation-agent/src/context/state-store.ts`).
 *
 * Item de resultado de elegibilidad, en la MISMA partición que ya usa
 * conversation-agent para el caso (`pk = CASE#<caseId>`):
 *
 *   pk = CASE#<caseId>
 *   sk = RESULT#eligibility#<turnId>
 *
 * Ver `packages/shared/src/contracts/eligibility-result.ts` (resolución de
 * la pregunta abierta #3 de `policies.yaml`) para la justificación completa
 * de por qué se eligió esta partición/clave en vez de un mecanismo de
 * correlación aparte.
 *
 * IDEMPOTENCIA (pilar Reliability, requisito explícito de este checkpoint):
 * `idempotencyKey = "${caseId}:${turnId}"`, materializada como la clave
 * exacta `(pk, sk)` de arriba. `computeEligibility()`
 * (`../compute-eligibility.ts`) hace SIEMPRE un `getResult` antes de
 * calcular; si ya existe un item, se devuelve tal cual, SIN recalcular --
 * esto es lo que evita duplicar el cálculo/la escritura en reintentos.
 *
 * LIMITACIÓN DECLARADA (no bloqueante para este checkpoint): `putResult` usa
 * un `PutCommand` simple, SIN `ConditionExpression` de "no existe todavía".
 * Si dos invocaciones concurrentes llegan al mismo tiempo con el mismo
 * `caseId`+`turnId` (ej. dos reintentos del caller en paralelo, no
 * secuenciales), ambas podrían pasar el `getResult` inicial en `not_found`
 * y ambas calcular y escribir -- el resultado final en la tabla sería el de
 * quien escriba último (el cálculo es determinístico, así que en la
 * práctica ambos valores serían idénticos para el mismo input, pero esto no
 * está garantizado a nivel de infraestructura). El siguiente paso de
 * robustez, no implementado acá, sería `PutCommand` con
 * `ConditionExpression: "attribute_not_exists(pk)"` para hacer la escritura
 * atómica y rechazar la segunda escritura concurrente.
 *
 * Reliability: reintentos acotados con backoff corto, replicando el MISMO
 * patrón que `services/conversation-agent/src/context/state-store.ts` y
 * `services/retrieval-agent/src/repository/dynamodb-catalog-repository.ts`
 * (2 reintentos por defecto, nunca reintento infinito). Al agotar los
 * reintentos, se devuelve `{ status: "unavailable" }` -- nunca se lanza una
 * excepción sin manejar, y sobre todo, nunca se fabrica un
 * `EligibilityResult` de reemplazo (a diferencia de retrieval-agent, acá
 * "unavailable" no puede degradarse a un dato inventado: es una decisión
 * financiera, la propaga `computeEligibility` como error explícito para que
 * el caller decida reintentar o escalar).
 */

const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_BASE_DELAY_MS = 75;

type DynamoResult<T> = { ok: true; value: T } | { ok: false; error: unknown };

export interface DynamoDbEligibilityStoreConfig {
  tableName: string;
  /** Cliente inyectable para tests (mock) -- en Lambda real se construye
   * desde `@aws-sdk/client-dynamodb` vía `buildDocClientFromEnv`. */
  docClient: DynamoDBDocumentClient;
  maxRetries?: number;
  baseDelayMs?: number;
}

export function buildDocClientFromEnv(region?: string): DynamoDBDocumentClient {
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

function itemToResult(item: Record<string, unknown>): EligibilityResult {
  return {
    caseId: item.caseId as string,
    productType: item.productType as EligibilityResult["productType"],
    eligibility_score: item.eligibility_score as number,
    score_zone: item.score_zone as EligibilityResult["score_zone"],
  };
}

export class DynamoDbEligibilityStore implements EligibilityStore {
  private readonly tableName: string;
  private readonly docClient: DynamoDBDocumentClient;
  private readonly maxRetries: number;
  private readonly baseDelayMs: number;

  constructor(config: DynamoDbEligibilityStoreConfig) {
    this.tableName = config.tableName;
    this.docClient = config.docClient;
    this.maxRetries = config.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.baseDelayMs = config.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  }

  async getResult(caseId: string, turnId: string): Promise<EligibilityGetResult> {
    const result = await withRetry(
      () =>
        this.docClient.send(
          new GetCommand({
            TableName: this.tableName,
            Key: { pk: `CASE#${caseId}`, sk: `RESULT#eligibility#${turnId}` },
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

  async putResult(result: EligibilityResult, turnId: string): Promise<EligibilityPutResult> {
    const putOutcome = await withRetry(
      () =>
        this.docClient.send(
          new PutCommand({
            TableName: this.tableName,
            Item: {
              pk: `CASE#${result.caseId}`,
              sk: `RESULT#eligibility#${turnId}`,
              caseId: result.caseId,
              productType: result.productType,
              eligibility_score: result.eligibility_score,
              score_zone: result.score_zone,
            },
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
