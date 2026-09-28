import { describe, expect, it } from "vitest";
import { extractEntities } from "../src/router/entity-extractor";

/**
 * Cobertura dedicada a la extracción de los entities nuevos de
 * "transaction-dispute intake" (disputed_amount, merchant, transaction_date,
 * dispute_reason). El resto de los campos ya tenía cobertura indirecta vía
 * intent-router.test.ts; estos son deliberadamente heurísticos/best-effort
 * (ver docstrings en el código fuente), así que los tests verifican el
 * comportamiento documentado, no un parseo perfecto.
 */
describe("extractEntities — campos de disputa", () => {
  it("extrae disputed_amount en español ('cargo de 150')", () => {
    const entities = extractEntities("No reconozco un cargo de 150 en mi tarjeta", "es");
    expect(entities.disputed_amount).toBe(150);
  });

  it("extrae disputed_amount en portugués ('cobrança de 200')", () => {
    const entities = extractEntities("Não reconheço uma cobrança de 200 no meu cartão", "pt");
    expect(entities.disputed_amount).toBe(200);
  });

  it("extrae merchant en español cerca de una keyword de comercio", () => {
    const entities = extractEntities("Tengo un cargo en Amazon que no reconozco", "es");
    expect(entities.merchant).toBe("Amazon que no reconozco");
  });

  it("extrae merchant en portugués cerca de una keyword de comercio", () => {
    const entities = extractEntities("Não reconheço uma compra na Amazon ontem", "pt");
    expect(entities.merchant).toBe("Amazon ontem");
  });

  it("no extrae merchant si no hay keyword de comercio en el mensaje", () => {
    const entities = extractEntities("No reconozco este cargo", "es");
    expect(entities.merchant).toBeNull();
  });

  it("extrae transaction_date por frase relativa simple en español ('ayer')", () => {
    const entities = extractEntities("Vi un cargo raro ayer en mi cuenta", "es");
    expect(entities.transaction_date).toBe("ayer");
  });

  it("extrae transaction_date por frase relativa simple en portugués ('ontem')", () => {
    const entities = extractEntities("Vi uma cobrança estranha ontem na minha conta", "pt");
    expect(entities.transaction_date).toBe("ontem");
  });

  it("extrae transaction_date por 'la semana pasada' en español", () => {
    const entities = extractEntities("Hicieron un cargo la semana pasada que no reconozco", "es");
    expect(entities.transaction_date).toBe("la semana pasada");
  });

  it("no extrae transaction_date si no hay ninguna frase de fecha reconocida", () => {
    const entities = extractEntities("No reconozco este cargo en mi cuenta", "es");
    expect(entities.transaction_date).toBeNull();
  });

  it("clasifica dispute_reason como unrecognized_charge en español", () => {
    const entities = extractEntities("No reconozco este cargo en mi tarjeta", "es");
    expect(entities.dispute_reason).toBe("unrecognized_charge");
  });

  it("clasifica dispute_reason como duplicate_or_overcharge en español", () => {
    const entities = extractEntities("Tengo un cobro duplicado en mi cuenta", "es");
    expect(entities.dispute_reason).toBe("duplicate_or_overcharge");
  });

  it("clasifica dispute_reason como unrecognized_charge en portugués", () => {
    const entities = extractEntities("Não reconheço essa cobrança no meu cartão", "pt");
    expect(entities.dispute_reason).toBe("unrecognized_charge");
  });

  it("clasifica dispute_reason como duplicate_or_overcharge en portugués", () => {
    const entities = extractEntities("Recebi uma cobrança duplicada no meu cartão", "pt");
    expect(entities.dispute_reason).toBe("duplicate_or_overcharge");
  });

  it("nunca asigna 'other' a dispute_reason: queda null si no matchea ninguna keyword conocida", () => {
    const entities = extractEntities("Quiero disputar algo pero no sé cómo explicarlo", "es");
    expect(entities.dispute_reason).toBeNull();
    expect(entities.dispute_reason).not.toBe("other");
  });
});
