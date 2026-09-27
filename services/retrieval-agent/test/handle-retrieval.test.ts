import { describe, expect, it } from "vitest";
import type { FaqEntry, ProductCatalogEntry, UnderstandOutput } from "@banking-agent/shared";
import { emptyEntities } from "@banking-agent/shared";
import { handleRetrieval } from "../src/handle-retrieval";
import { StaticCatalogRepository } from "../src/repository/static-catalog-repository";
import type { CatalogLookupResult, CatalogRepository } from "../src/repository/types";

function baseContext(): UnderstandOutput["context"] {
  return {
    caseId: "case-1",
    customerId: null,
    turnId: "turn-1",
    degraded: false,
    degradedReason: "none",
    historyTurns: 0,
  };
}

/** Repositorio de prueba (test double) para forzar los tres estados de
 * CatalogLookupResult, incluido "unavailable" — el StaticCatalogRepository
 * real no puede fallar por diseño (no hay red/infra que reintentar). */
class StubRepository implements CatalogRepository {
  constructor(
    private readonly productResult: CatalogLookupResult<ProductCatalogEntry>,
    private readonly faqResult: CatalogLookupResult<FaqEntry[]>
  ) {}

  async getProduct(): Promise<CatalogLookupResult<ProductCatalogEntry>> {
    return this.productResult;
  }

  async listFaqs(): Promise<CatalogLookupResult<FaqEntry[]>> {
    return this.faqResult;
  }
}

describe("handleRetrieval — product_info", () => {
  it("producto encontrado -> found:true con el ProductCatalogEntry real", async () => {
    const repo = new StaticCatalogRepository();
    const input: UnderstandOutput = {
      intent: "product_info",
      language: "es",
      entities: { ...emptyEntities(), product_type: "credit_card" },
      missing_fields: [],
      context: baseContext(),
    };

    const result = await handleRetrieval(input, repo);

    expect(result.found).toBe(true);
    expect(result.intent).toBe("product_info");
    expect(result.product?.productType).toBe("credit_card");
    expect(result.product?.source).toBeTruthy();
  });

  it("product_type null (no debería pasar policy-agent, pero es defensivo) -> found:false sin inventar", async () => {
    const repo = new StaticCatalogRepository();
    const input: UnderstandOutput = {
      intent: "product_info",
      language: "es",
      entities: emptyEntities(),
      missing_fields: ["product_type"],
      context: baseContext(),
    };

    const result = await handleRetrieval(input, repo);

    expect(result.found).toBe(false);
    expect(result.product).toBeUndefined();
    expect(result.notes).toBeTruthy();
  });

  it("producto no catalogado -> found:false con nota explícita, nunca un dato inventado", async () => {
    const repo = new StubRepository({ status: "not_found" }, { status: "found", value: [] });
    const input: UnderstandOutput = {
      intent: "product_info",
      language: "pt",
      entities: { ...emptyEntities(), product_type: "mortgage" },
      missing_fields: [],
      context: baseContext(),
    };

    const result = await handleRetrieval(input, repo);

    expect(result.found).toBe(false);
    expect(result.product).toBeUndefined();
    expect(result.notes).toMatch(/mortgage/);
  });

  it("fuente no disponible (fallo de infra) -> found:false con nota de 'no disponible ahora', distinta de 'no encontrado'", async () => {
    const repo = new StubRepository(
      { status: "unavailable", reason: "dynamodb_read_failed" },
      { status: "found", value: [] }
    );
    const input: UnderstandOutput = {
      intent: "product_info",
      language: "es",
      entities: { ...emptyEntities(), product_type: "auto_loan" },
      missing_fields: [],
      context: baseContext(),
    };

    const result = await handleRetrieval(input, repo);

    expect(result.found).toBe(false);
    expect(result.notes).toMatch(/disponible/i);
    expect(result.notes).toMatch(/dynamodb_read_failed/);
  });
});

describe("handleRetrieval — faq", () => {
  it("FAQs encontradas en español -> found:true con al menos una FaqEntry", async () => {
    const repo = new StaticCatalogRepository();
    const input: UnderstandOutput = {
      intent: "faq",
      language: "es",
      entities: emptyEntities(),
      missing_fields: [],
      context: baseContext(),
    };

    const result = await handleRetrieval(input, repo);

    expect(result.found).toBe(true);
    expect(result.faqs?.length).toBeGreaterThan(0);
    expect(result.faqs?.every((f) => f.language === "es")).toBe(true);
  });

  it("FAQs encontradas en portugués -> found:true con al menos una FaqEntry", async () => {
    const repo = new StaticCatalogRepository();
    const input: UnderstandOutput = {
      intent: "faq",
      language: "pt",
      entities: emptyEntities(),
      missing_fields: [],
      context: baseContext(),
    };

    const result = await handleRetrieval(input, repo);

    expect(result.found).toBe(true);
    expect(result.faqs?.length).toBeGreaterThan(0);
    expect(result.faqs?.every((f) => f.language === "pt")).toBe(true);
  });

  it("fuente de FAQs no disponible -> found:false con nota de degradación", async () => {
    const repo = new StubRepository(
      { status: "not_found" },
      { status: "unavailable", reason: "dynamodb_read_failed" }
    );
    const input: UnderstandOutput = {
      intent: "faq",
      language: "es",
      entities: emptyEntities(),
      missing_fields: [],
      context: baseContext(),
    };

    const result = await handleRetrieval(input, repo);

    expect(result.found).toBe(false);
    expect(result.notes).toMatch(/disponibles/i);
  });
});

describe("handleRetrieval — defensivo ante intents no autorizados", () => {
  it("un intent distinto de product_info/faq nunca crashea y responde found:false explicando por qué", async () => {
    const repo = new StaticCatalogRepository();
    const input: UnderstandOutput = {
      intent: "eligibility_check",
      language: "es",
      entities: emptyEntities(),
      missing_fields: [],
      context: baseContext(),
    };

    const result = await handleRetrieval(input, repo);

    expect(result.found).toBe(false);
    expect(result.notes).toMatch(/eligibility_check/);
  });
});
