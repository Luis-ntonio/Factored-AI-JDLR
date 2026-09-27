import { describe, expect, it } from "vitest";
import { routeIntent } from "../src/router/intent-router";
import { extractEntities } from "../src/router/entity-extractor";
import { detectLanguage } from "../src/router/language-detector";

function classify(message: string, language: "es" | "pt") {
  const entities = extractEntities(message, language);
  return routeIntent(message, language, entities);
}

describe("routeIntent", () => {
  it("clasifica product_info en español", () => {
    expect(classify("¿Cuáles son los requisitos del préstamo personal?", "es")).toBe("product_info");
  });

  it("clasifica product_info en portugués", () => {
    expect(classify("Quais são os requisitos do empréstimo pessoal?", "pt")).toBe("product_info");
  });

  it("clasifica eligibility_check en español por keyword explícita", () => {
    expect(classify("Quiero saber si califico para un préstamo personal", "es")).toBe("eligibility_check");
  });

  it("clasifica eligibility_check en portugués por keyword explícita", () => {
    expect(classify("Eu quero saber se eu qualifico para um empréstimo pessoal", "pt")).toBe("eligibility_check");
  });

  it("clasifica eligibility_check en español por señal de entities (>=2) sin keyword explícita", () => {
    expect(
      classify("Gano 2500 al mes y trabajo en una empresa, necesito 10000 para un préstamo personal", "es")
    ).toBe("eligibility_check");
  });

  it("clasifica faq en español", () => {
    expect(classify("¿Cuál es el horario de atención al cliente?", "es")).toBe("faq");
  });

  it("clasifica faq en portugués", () => {
    expect(classify("Qual é o horário de atendimento ao cliente?", "pt")).toBe("faq");
  });

  it("clasifica escalation_request en español", () => {
    expect(classify("Quiero hablar con un asesor humano por favor", "es")).toBe("escalation_request");
  });

  it("clasifica escalation_request en portugués", () => {
    expect(classify("Eu quero falar com um atendente humano, por favor", "pt")).toBe("escalation_request");
  });

  it("prioriza escalation_request incluso si el mensaje menciona un producto", () => {
    expect(classify("Quiero hablar con un humano sobre mi préstamo personal", "es")).toBe("escalation_request");
  });

  it("devuelve unknown cuando no hay señal suficiente", () => {
    expect(classify("Buen día", "es")).toBe("unknown");
  });
});

// Nota: los tests de arriba pasan `language` como parámetro FIJO, por lo que
// no ejercitan detectLanguage() como parte del pipeline. Estos tests de
// integración cierran ese gap para el caso de regresión reportado por QA
// (bug de detección de idioma en "quero falar com...").
describe("routeIntent (integración con detectLanguage real)", () => {
  function classifyFromMessage(message: string) {
    const { language } = detectLanguage(message);
    const entities = extractEntities(message, language);
    return { language, intent: routeIntent(message, language, entities) };
  }

  it("detecta 'pt' vía detectLanguage real y clasifica escalation_request para 'quero falar com um atendente'", () => {
    const result = classifyFromMessage("quero falar com um atendente");
    expect(result.language).toBe("pt");
    expect(result.intent).toBe("escalation_request");
  });

  it("detecta 'pt' vía detectLanguage real y clasifica escalation_request para 'quero falar com uma pessoa'", () => {
    const result = classifyFromMessage("quero falar com uma pessoa");
    expect(result.language).toBe("pt");
    expect(result.intent).toBe("escalation_request");
  });
});
