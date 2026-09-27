import type { FaqEntry } from "@banking-agent/shared";
import { describe, expect, it } from "vitest";
import { buildCatalogItems } from "../scripts/seed-catalog";
import { FAQS, PRODUCT_CATALOG } from "../src/data/catalog";

/**
 * `buildCatalogItems` es la función PURA de mapeo `PRODUCT_CATALOG`/`FAQS` ->
 * items de DynamoDB, extraída de `scripts/seed-catalog.ts` para poder
 * testearla sin mockear `@aws-sdk/lib-dynamodb` ni tocar AWS real. Importar
 * este módulo NO dispara ninguna escritura (el script real está guardado
 * detrás de `if (require.main === module)`).
 */
describe("seed-catalog / buildCatalogItems", () => {
  it("mapea cada producto real a pk=PRODUCT#<productType>, sk=INFO, preservando los campos del catálogo", () => {
    const { productItems } = buildCatalogItems();

    expect(productItems).toHaveLength(PRODUCT_CATALOG.length);
    productItems.forEach((item, index) => {
      const source = PRODUCT_CATALOG[index];
      expect(item.pk).toBe(`PRODUCT#${source.productType}`);
      expect(item.sk).toBe("INFO");
      expect(item.interestRateRange).toEqual(source.interestRateRange);
      expect(item.requirements).toEqual(source.requirements);
      expect(item.termRange).toEqual(source.termRange);
      expect(item.amountRange).toEqual(source.amountRange);
      expect(item.source).toBe(source.source);
    });
  });

  it("mapea cada FAQ real a pk=FAQ#<id>, sk=INFO#<language>, con el campo `faqId` (no `id`)", () => {
    const { faqItems } = buildCatalogItems();

    expect(faqItems).toHaveLength(FAQS.length);
    faqItems.forEach((item, index) => {
      const source = FAQS[index];
      expect(item.pk).toBe(`FAQ#${source.id}`);
      expect(item.sk).toBe(`INFO#${source.language}`);
      // `itemToFaq()` en dynamodb-catalog-repository.ts lee `item.faqId`,
      // no `item.id` -- el item escrito por el seed debe usar ese nombre.
      expect(item.faqId).toBe(source.id);
      expect(item.id).toBeUndefined();
      expect(item.language).toBe(source.language);
      expect(item.question).toBe(source.question);
      expect(item.answer).toBe(source.answer);
      expect(item.source).toBe(source.source);
    });
  });

  it("las dos variantes de idioma del mismo FAQ id producen sk distintos (sin colisión de clave)", () => {
    const fixture: FaqEntry[] = [
      { id: "faq-x", language: "es", question: "q-es", answer: "a-es", source: "test_source" },
      { id: "faq-x", language: "pt", question: "q-pt", answer: "a-pt", source: "test_source" },
    ];

    const { faqItems } = buildCatalogItems([], fixture);

    expect(faqItems).toHaveLength(2);
    expect(faqItems[0].pk).toBe(faqItems[1].pk);
    expect(faqItems[0].sk).toBe("INFO#es");
    expect(faqItems[1].sk).toBe("INFO#pt");

    const keys = faqItems.map((item) => `${item.pk}|${item.sk}`);
    expect(new Set(keys).size).toBe(2);
  });

  it("no hay pk/sk duplicados en el seed real completo (productos + FAQs)", () => {
    const { productItems, faqItems } = buildCatalogItems();
    const keys = [...productItems, ...faqItems].map((item) => `${item.pk}|${item.sk}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
