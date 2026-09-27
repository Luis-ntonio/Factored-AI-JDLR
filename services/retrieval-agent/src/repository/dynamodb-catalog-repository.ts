import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";
import type { FaqEntry, LanguageCode, ProductCatalogEntry, ProductType } from "@banking-agent/shared";
import type { CatalogLookupResult, CatalogRepository } from "./types";

/**
 * Acceso a la tabla DynamoDB `banking-agent-dev-product-catalog` (creada por
 * devops en Terraform; ver README.md de este servicio para la decisión
 * completa DynamoDB vs. S3). El Lambda real la usa cuando devops setea
 * `CATALOG_BACKEND=dynamodb` + `CATALOG_TABLE_NAME` como variables de
 * entorno del Lambda (no es el default de `src/index.ts`, que sigue siendo
 * `"static"` para tests/local). La tabla se puebla vía
 * `scripts/seed-catalog.ts`, invocado por devops una vez por `terraform
 * apply` (`null_resource` + `local-exec`) — ver ese script y el README para
 * el detalle de invocación.
 *
 * Esquema (mismo patrón `pk`/`sk` que `banking-agent-dev-case-store`,
 * `terraform/modules/data`):
 *
 *  - Producto:  pk = `PRODUCT#<productType>`, sk = `INFO`
 *  - FAQ:       pk = `FAQ#<faqId>`,           sk = `INFO#<language>`
 *
 * Nota sobre el `sk` de FAQ: cada `id` de `FAQS` (src/data/catalog.ts)
 * aparece dos veces (una por `language`, `"es"`/`"pt"`). Si el `sk` fuera el
 * literal `"INFO"` para ambos, la segunda escritura pisaría a la primera
 * (mismo `pk`+`sk` exacto) y se perdería un idioma — por eso el `sk` incluye
 * el idioma. Esto NO afecta `listFaqs` acá abajo: ya filtra por el atributo
 * `language` vía `ScanCommand`/`FilterExpression`, no por el valor de `sk`.
 *
 * `PAY_PER_REQUEST`, sin GSI, sin `ttl` (contenido de referencia estático,
 * no datos de sesión con expiración).
 *
 * Reliability (docs/EVALUATION-CRITERIA.md): reintentos acotados con backoff
 * corto, replicando LITERALMENTE el patrón de
 * `services/conversation-agent/src/context/state-store.ts` (no se importa
 * ese código porque conversation-agent es un servicio Lambda separado, no
 * una librería compartida — se replica el PATRÓN, documentado acá con la
 * misma intención: nunca reintento infinito, nunca crashear, nunca inventar
 * un dato si la fuente falla).
 *
 * Trade-off de `listFaqs`: sin GSI que permita "todas las FAQs de un
 * idioma" por clave exacta, se usa un `Scan` con `FilterExpression` sobre
 * `language`. Esto es aceptable para este caso de uso concreto (tabla
 * pequeña, contenido de referencia estático que rara vez cambia, sin TTL,
 * sin hot path de alta frecuencia como el chat en sí) — NO es el patrón de
 * acceso recomendado para tablas grandes o de alta escritura. Documentado
 * como decisión consciente, no como descuido.
 */

const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_BASE_DELAY_MS = 75;

export type DynamoResult<T> = { ok: true; value: T } | { ok: false; error: unknown };

export interface DynamoDbCatalogRepositoryConfig {
  tableName: string;
  /** Cliente inyectable para tests (mock) — en Lambda real se construye
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

/** Reintentos acotados con backoff exponencial corto — nunca reintento
 * infinito. Al agotar los intentos, devuelve `{ ok: false }` en vez de
 * lanzar, para que el caller aplique el fallback seguro (`"unavailable"`
 * en vez de inventar o crashear). */
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

function itemToProduct(item: Record<string, unknown>): ProductCatalogEntry {
  return {
    productType: item.productType as ProductType,
    interestRateRange: item.interestRateRange as ProductCatalogEntry["interestRateRange"],
    requirements: item.requirements as ProductCatalogEntry["requirements"],
    termRange: item.termRange as ProductCatalogEntry["termRange"],
    amountRange: item.amountRange as ProductCatalogEntry["amountRange"],
    source: item.source as string,
  };
}

function itemToFaq(item: Record<string, unknown>): FaqEntry {
  return {
    id: item.faqId as string,
    language: item.language as LanguageCode,
    question: item.question as string,
    answer: item.answer as string,
    source: item.source as string,
  };
}

export class DynamoDbCatalogRepository implements CatalogRepository {
  private readonly tableName: string;
  private readonly docClient: DynamoDBDocumentClient;
  private readonly maxRetries: number;
  private readonly baseDelayMs: number;

  constructor(config: DynamoDbCatalogRepositoryConfig) {
    this.tableName = config.tableName;
    this.docClient = config.docClient;
    this.maxRetries = config.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.baseDelayMs = config.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  }

  async getProduct(productType: ProductType): Promise<CatalogLookupResult<ProductCatalogEntry>> {
    const result = await withRetry(
      () =>
        this.docClient.send(
          new GetCommand({
            TableName: this.tableName,
            Key: { pk: `PRODUCT#${productType}`, sk: "INFO" },
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
    return { status: "found", value: itemToProduct(item) };
  }

  async listFaqs(language: LanguageCode): Promise<CatalogLookupResult<FaqEntry[]>> {
    const result = await withRetry(
      () =>
        this.docClient.send(
          new ScanCommand({
            TableName: this.tableName,
            FilterExpression: "begins_with(pk, :faqPrefix) AND #lang = :language",
            ExpressionAttributeNames: { "#lang": "language" },
            ExpressionAttributeValues: { ":faqPrefix": "FAQ#", ":language": language },
          })
        ),
      this.maxRetries,
      this.baseDelayMs
    );

    if (!result.ok) {
      return { status: "unavailable", reason: "dynamodb_read_failed" };
    }
    const items = result.value.Items ?? [];
    return { status: "found", value: items.map(itemToFaq) };
  }
}
