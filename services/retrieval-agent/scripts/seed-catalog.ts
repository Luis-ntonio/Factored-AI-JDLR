import { PutCommand } from "@aws-sdk/lib-dynamodb";
import type { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import type { FaqEntry, ProductCatalogEntry } from "@banking-agent/shared";
import { FAQS, PRODUCT_CATALOG } from "../src/data/catalog";
import { buildDocClientFromEnv } from "../src/repository/dynamodb-catalog-repository";

/**
 * Script de PROVISIÓN (no runtime de Lambda) que puebla la tabla DynamoDB
 * `banking-agent-dev-product-catalog` (creada por devops en Terraform) con
 * el contenido de `src/data/catalog.ts` (`PRODUCT_CATALOG` + `FAQS`), que
 * sigue siendo la ÚNICA fuente de verdad del catálogo — este script nunca
 * duplica ese contenido en Terraform/HCL, solo lo transcribe a DynamoDB.
 *
 * Invocación: devops lo corre una vez por `terraform apply` vía
 * `null_resource` + `local-exec`, después de que el recurso de la tabla ya
 * existe. `PutCommand` es naturalmente idempotente para este caso (mismo
 * `pk`/`sk` + mismo contenido determinístico en cada corrida => converge al
 * mismo estado), así que re-correr este seed en cada `apply` es seguro y
 * mantiene la tabla sincronizada si el catálogo en código cambia.
 *
 * Schema de items (ver docstring de `dynamodb-catalog-repository.ts` para el
 * detalle completo):
 *  - Producto: `pk = PRODUCT#<productType>`, `sk = INFO`.
 *  - FAQ:      `pk = FAQ#<faqId>`, `sk = INFO#<language>` (NO `sk = "INFO"`
 *    literal: cada `id` de `FAQS` aparece una vez por idioma -"es"/"pt"-, y
 *    si el `sk` no incluyera el idioma, la segunda escritura pisaría a la
 *    primera por tener exactamente el mismo `pk`+`sk`). El campo de idioma
 *    del item se llama `faqId` (no `id`), porque `itemToFaq()` en
 *    `dynamodb-catalog-repository.ts` lee `item.faqId` -mismatch de nombre
 *    de campo acá sería un bug silencioso: la tabla tendría datos, pero
 *    `listFaqs`/`getProduct` los leería incompletos o como `undefined`-.
 *
 * DIFERENCIA DELIBERADA DE CRITERIO DE RELIABILITY vs. los handlers de
 * Lambda de este servicio (`src/index.ts`, `dynamodb-catalog-repository.ts`):
 * esos SIEMPRE deben responder con un fallback seguro y nunca lanzar, porque
 * atienden a un usuario real en runtime (mejor "no disponible ahora" que un
 * 5xx o un dato inventado). Este script, en cambio, es una herramienta de
 * PROVISIÓN ejecutada por un operador/CI (`terraform apply`), sin ningún
 * usuario esperando una respuesta degradada -- acá el criterio correcto es
 * el OPUESTO: si una escritura falla, debe fallar RUIDOSAMENTE
 * (`process.exit(1)` + log del error) para que `terraform apply` se entere
 * y no quede una tabla parcialmente poblada de forma silenciosa. No es un
 * descuido de Reliability, es una decisión deliberada para este tipo de
 * herramienta.
 */

export const DEFAULT_CATALOG_TABLE_NAME = "banking-agent-dev-product-catalog";

/** Item genérico de DynamoDB (siempre con `pk`/`sk`) usado por este seed. */
export type CatalogSeedItem = Record<string, unknown> & { pk: string; sk: string };

/**
 * Función PURA de mapeo `PRODUCT_CATALOG`/`FAQS` -> items de DynamoDB.
 * Extraída del flujo de escritura para poder testearla sin mockear el SDK
 * de AWS (ver `test/seed-catalog.test.ts`). Acepta los catálogos como
 * parámetros (con default a los reales) para poder ejercitar casos de borde
 * (ej. colisión de `pk`/`sk`) con fixtures pequeños en los tests.
 */
export function buildCatalogItems(
  products: readonly ProductCatalogEntry[] = PRODUCT_CATALOG,
  faqs: readonly FaqEntry[] = FAQS
): { productItems: CatalogSeedItem[]; faqItems: CatalogSeedItem[] } {
  const productItems: CatalogSeedItem[] = products.map((entry) => ({
    pk: `PRODUCT#${entry.productType}`,
    sk: "INFO",
    ...entry,
  }));

  const faqItems: CatalogSeedItem[] = faqs.map((faq) => ({
    pk: `FAQ#${faq.id}`,
    sk: `INFO#${faq.language}`,
    // Nombre de campo `faqId` (no `id`) a propósito -- ver docstring arriba.
    faqId: faq.id,
    language: faq.language,
    question: faq.question,
    answer: faq.answer,
    source: faq.source,
  }));

  return { productItems, faqItems };
}

async function putItem(docClient: DynamoDBDocumentClient, tableName: string, item: CatalogSeedItem): Promise<void> {
  try {
    await docClient.send(new PutCommand({ TableName: tableName, Item: item }));
  } catch (error) {
    // Contexto explícito de qué item falló, para que el operador (o el log
    // de `terraform apply`) sepa exactamente dónde se rompió el seed.
    throw new Error(`Fallo escribiendo item pk="${item.pk}" sk="${item.sk}" en tabla "${tableName}": ${String(error)}`, {
      cause: error,
    });
  }
}

async function seedCatalog(): Promise<void> {
  const tableName = process.env.CATALOG_TABLE_NAME ?? DEFAULT_CATALOG_TABLE_NAME;
  const region = process.env.AWS_REGION;
  const docClient = buildDocClientFromEnv(region);

  const { productItems, faqItems } = buildCatalogItems();

  for (const item of productItems) {
    await putItem(docClient, tableName, item);
  }
  for (const item of faqItems) {
    await putItem(docClient, tableName, item);
  }

  console.log(
    `[seed-catalog] OK: ${productItems.length} producto(s) y ${faqItems.length} FAQ(s) escritos en la tabla "${tableName}".`
  );
}

// Guard `require.main === module`: al importar este archivo desde un test
// (`buildCatalogItems`) NUNCA se debe disparar una escritura real a AWS.
if (require.main === module) {
  seedCatalog().catch((error) => {
    // Fallar ruidosamente a propósito -- ver comentario de cabecera.
    console.error("[seed-catalog] FALLO poblando el catálogo:", error);
    process.exit(1);
  });
}
