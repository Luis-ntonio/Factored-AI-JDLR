import { describe, expect, it, vi } from "vitest";
import type { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { GetCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { DynamoDbCatalogRepository } from "../src/repository/dynamodb-catalog-repository";

function makeMockDocClient(sendImpl: (cmd: unknown) => Promise<unknown>) {
  return { send: vi.fn(sendImpl) } as unknown as DynamoDBDocumentClient;
}

const sampleProductItem = {
  pk: "PRODUCT#personal_loan",
  sk: "INFO",
  productType: "personal_loan",
  interestRateRange: { min: 18, max: 36 },
  requirements: {
    minIncome: 800,
    acceptedDocumentTypes: ["DNI"],
    acceptedEmploymentStatus: ["employed"],
  },
  termRange: { minMonths: 6, maxMonths: 60 },
  amountRange: { min: 500, max: 20000 },
  source: "internal_catalog_v1",
};

describe("DynamoDbCatalogRepository — getProduct", () => {
  it("éxito: devuelve found con el item mapeado", async () => {
    const docClient = makeMockDocClient(async (cmd) => {
      if (cmd instanceof GetCommand) return { Item: sampleProductItem };
      return {};
    });
    const repo = new DynamoDbCatalogRepository({ tableName: "t", docClient, maxRetries: 1, baseDelayMs: 1 });

    const result = await repo.getProduct("personal_loan");

    expect(result.status).toBe("found");
    if (result.status !== "found") return;
    expect(result.value.productType).toBe("personal_loan");
    expect(result.value.source).toBe("internal_catalog_v1");
  });

  it("éxito sin item -> not_found (nunca inventa un producto)", async () => {
    const docClient = makeMockDocClient(async () => ({ Item: undefined }));
    const repo = new DynamoDbCatalogRepository({ tableName: "t", docClient, maxRetries: 1, baseDelayMs: 1 });

    const result = await repo.getProduct("mortgage");

    expect(result.status).toBe("not_found");
  });

  it("reintenta hasta maxRetries y tiene éxito si un intento posterior funciona", async () => {
    let calls = 0;
    const docClient = makeMockDocClient(async () => {
      calls += 1;
      if (calls < 3) throw new Error("throttled");
      return { Item: sampleProductItem };
    });
    const repo = new DynamoDbCatalogRepository({ tableName: "t", docClient, maxRetries: 2, baseDelayMs: 1 });

    const result = await repo.getProduct("personal_loan");

    expect(result.status).toBe("found");
    expect(calls).toBe(3); // 1 intento inicial + 2 reintentos
  });

  it("agota los reintentos -> unavailable, nunca lanza una excepción sin manejar", async () => {
    const docClient = makeMockDocClient(async () => {
      throw new Error("dynamodb down");
    });
    const repo = new DynamoDbCatalogRepository({ tableName: "t", docClient, maxRetries: 2, baseDelayMs: 1 });

    const result = await repo.getProduct("personal_loan");

    expect(result.status).toBe("unavailable");
    if (result.status !== "unavailable") return;
    expect(result.reason).toBe("dynamodb_read_failed");
  });
});

describe("DynamoDbCatalogRepository — listFaqs", () => {
  const sampleFaqItem = {
    pk: "FAQ#faq-business-hours",
    sk: "INFO",
    faqId: "faq-business-hours",
    language: "es",
    question: "¿Cuál es el horario de atención?",
    answer: "Lunes a viernes de 8 a 20.",
    source: "internal_catalog_v1",
  };

  it("éxito: devuelve found con las FAQs mapeadas", async () => {
    const docClient = makeMockDocClient(async (cmd) => {
      if (cmd instanceof ScanCommand) return { Items: [sampleFaqItem] };
      return {};
    });
    const repo = new DynamoDbCatalogRepository({ tableName: "t", docClient, maxRetries: 1, baseDelayMs: 1 });

    const result = await repo.listFaqs("es");

    expect(result.status).toBe("found");
    if (result.status !== "found") return;
    expect(result.value).toHaveLength(1);
    expect(result.value[0].source).toBe("internal_catalog_v1");
  });

  it("agota los reintentos -> unavailable, nunca lanza una excepción sin manejar", async () => {
    const docClient = makeMockDocClient(async () => {
      throw new Error("dynamodb down");
    });
    const repo = new DynamoDbCatalogRepository({ tableName: "t", docClient, maxRetries: 2, baseDelayMs: 1 });

    const result = await repo.listFaqs("pt");

    expect(result.status).toBe("unavailable");
    if (result.status !== "unavailable") return;
    expect(result.reason).toBe("dynamodb_read_failed");
  });
});
