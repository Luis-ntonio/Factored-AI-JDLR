import { describe, expect, it } from "vitest";
import type { ProductType } from "@banking-agent/shared";
import { PRODUCT_TYPES } from "@banking-agent/shared";
import { StaticCatalogRepository } from "../src/repository/static-catalog-repository";

describe("StaticCatalogRepository — getProduct", () => {
  const repo = new StaticCatalogRepository();
  const realProductTypes: ProductType[] = PRODUCT_TYPES.filter((p) => p !== "unknown") as ProductType[];

  it.each(realProductTypes)("encuentra el producto %s con un source explícito", async (productType) => {
    const result = await repo.getProduct(productType);
    expect(result.status).toBe("found");
    if (result.status !== "found") return;
    expect(result.value.productType).toBe(productType);
    expect(result.value.source).toBeTruthy();
    expect(result.value.interestRateRange.min).toBeLessThanOrEqual(result.value.interestRateRange.max);
    expect(result.value.amountRange.min).toBeLessThanOrEqual(result.value.amountRange.max);
    expect(result.value.termRange.minMonths).toBeLessThanOrEqual(result.value.termRange.maxMonths);
    expect(result.value.requirements.acceptedDocumentTypes.length).toBeGreaterThan(0);
    expect(result.value.requirements.acceptedEmploymentStatus.length).toBeGreaterThan(0);
  });

  it("'unknown' no es un producto real -> not_found, sin inventar datos", async () => {
    const result = await repo.getProduct("unknown");
    expect(result.status).toBe("not_found");
  });

  it("un productType no soportado por el catálogo -> not_found (defensivo ante drift de tipos)", async () => {
    const result = await repo.getProduct("some_future_product" as ProductType);
    expect(result.status).toBe("not_found");
  });
});

describe("StaticCatalogRepository — listFaqs", () => {
  const repo = new StaticCatalogRepository();

  it("devuelve FAQs en español", async () => {
    const result = await repo.listFaqs("es");
    expect(result.status).toBe("found");
    if (result.status !== "found") return;
    expect(result.value.length).toBeGreaterThanOrEqual(6);
    for (const faq of result.value) {
      expect(faq.language).toBe("es");
      expect(faq.source).toBeTruthy();
      expect(faq.question.length).toBeGreaterThan(0);
      expect(faq.answer.length).toBeGreaterThan(0);
    }
  });

  it("devuelve FAQs en portugués, con el mismo set de temas (ids) que en español", async () => {
    const [es, pt] = await Promise.all([repo.listFaqs("es"), repo.listFaqs("pt")]);
    expect(es.status).toBe("found");
    expect(pt.status).toBe("found");
    if (es.status !== "found" || pt.status !== "found") return;

    const esIds = es.value.map((f) => f.id).sort();
    const ptIds = pt.value.map((f) => f.id).sort();
    expect(ptIds).toEqual(esIds);

    for (const faq of pt.value) {
      expect(faq.language).toBe("pt");
    }
  });
});
