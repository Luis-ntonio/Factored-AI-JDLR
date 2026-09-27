import type { FaqEntry, LanguageCode, ProductCatalogEntry, ProductType } from "@banking-agent/shared";
import { FAQS, PRODUCT_CATALOG } from "../data/catalog";
import type { CatalogLookupResult, CatalogRepository } from "./types";

/**
 * Implementación por DEFECTO de este checkpoint (ver README.md, sección
 * "Decisión de infra"): respaldada por el archivo de datos versionado en el
 * repo (`src/data/catalog.ts`), no por AWS. Se selecciona vía
 * `CATALOG_BACKEND=static` (o ausente — es el default) en el handler de
 * Lambda (`src/index.ts`).
 *
 * Al ser datos en memoria del propio proceso, no hay superficie de fallo de
 * red/infra que reintentar — el único resultado posible además de "found"
 * es "not_found" (nunca "unavailable"), lo cual es intencional y documentado.
 */
export class StaticCatalogRepository implements CatalogRepository {
  async getProduct(productType: ProductType): Promise<CatalogLookupResult<ProductCatalogEntry>> {
    const entry = PRODUCT_CATALOG.find((p) => p.productType === productType);
    if (!entry) return { status: "not_found" };
    return { status: "found", value: entry };
  }

  async listFaqs(language: LanguageCode): Promise<CatalogLookupResult<FaqEntry[]>> {
    const entries = FAQS.filter((f) => f.language === language);
    // Nota: con el seed actual esto siempre encuentra contenido para "es"/"pt"
    // (los únicos LanguageCode válidos) — no se modela "not_found" acá porque
    // un LanguageCode fuera de ese enum no tipa en TypeScript. Un array vacío
    // (caso borde teórico) se trata igual como "found" con lista vacía;
    // `handle-retrieval.ts` decide cómo comunicar eso en `RetrievalResult`.
    return { status: "found", value: entries };
  }
}
