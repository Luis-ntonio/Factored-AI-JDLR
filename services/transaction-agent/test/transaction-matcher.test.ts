import { describe, expect, it } from "vitest";
import type { Transaction } from "../src/data/mock-core-banking";
import { baselineScore, modelScore, rankAndDecide, type MatchQuery } from "../src/matching/transaction-matcher";
import { resolveRelativeDate } from "../src/matching/resolve-relative-date";

function tx(overrides: Partial<Transaction> = {}): Transaction {
  return {
    transaction_id: "TXN-TEST",
    transaction_date: "2026-09-22T08:00:00Z",
    process_date: "2026-09-22",
    product_id: "PROD-0001",
    customer_id: "CUST-0001",
    transaction_type: "Purchase",
    amount: 219.0,
    currency: "MXN",
    channel: "Web",
    merchant_name: "Netflix",
    transaction_country: "Mexico",
    transaction_status: "Approved",
    is_fraud: false,
    ...overrides,
  };
}

const REFERENCE = "2026-09-29T12:00:00Z";

function baseQuery(overrides: Partial<MatchQuery> = {}): MatchQuery {
  return {
    merchant: null,
    disputedAmount: null,
    transactionDateText: null,
    referenceDateIso: REFERENCE,
    language: "es",
    ...overrides,
  };
}

describe("resolveRelativeDate", () => {
  it("'ayer' resuelve al día anterior exacto", () => {
    const range = resolveRelativeDate("ayer", REFERENCE, "es");
    expect(range).toEqual({ from: "2026-09-28", to: "2026-09-28" });
  });

  it("'la semana pasada' resuelve una ventana amplia, no un solo día", () => {
    const range = resolveRelativeDate("la semana pasada", REFERENCE, "es");
    expect(range).toEqual({ from: "2026-09-15", to: "2026-09-23" });
  });

  it("'el lunes pasado' resuelve al lunes más reciente anterior a la referencia (±1 día)", () => {
    // 2026-09-29 es martes; el lunes más reciente es 2026-09-28... no, el
    // lunes de ESTA semana (28) es anterior a la referencia (29, martes) ->
    // se toma ese, no el de la semana anterior.
    const range = resolveRelativeDate("el lunes pasado", REFERENCE, "es");
    expect(range).toEqual({ from: "2026-09-27", to: "2026-09-29" });
  });

  it("frase no reconocida -> null, nunca lanza", () => {
    expect(resolveRelativeDate("en algún momento del año pasado", REFERENCE, "es")).toBeNull();
  });

  it("null/vacío -> null", () => {
    expect(resolveRelativeDate(null, REFERENCE, "es")).toBeNull();
  });

  it("funciona igual en portugués ('ontem')", () => {
    const range = resolveRelativeDate("ontem", REFERENCE, "pt");
    expect(range).toEqual({ from: "2026-09-28", to: "2026-09-28" });
  });
});

describe("baselineScore", () => {
  it("comercio + monto matchean -> score alto", () => {
    const score = baselineScore(tx({ merchant_name: "Netflix", amount: 219 }), baseQuery({ merchant: "netflix", disputedAmount: 219 }));
    expect(score).toBe(2);
  });

  it("sin ninguna señal en la consulta -> score 0", () => {
    expect(baselineScore(tx(), baseQuery())).toBe(0);
  });

  it("mencionar una fecha (sin resolverla) suma una señal débil, igual para cualquier candidata", () => {
    const query = baseQuery({ transactionDateText: "la semana pasada" });
    const scoreNear = baselineScore(tx({ transaction_date: "2026-09-22T00:00:00Z" }), query);
    const scoreFar = baselineScore(tx({ transaction_date: "2026-01-01T00:00:00Z" }), query);
    expect(scoreNear).toBe(0.25);
    expect(scoreFar).toBe(0.25); // el baseline NO distingue -- es la limitación real que motiva el modelo.
  });
});

describe("modelScore", () => {
  const fakeEmbed = async (text: string): Promise<readonly number[] | null> => {
    // Embedding determinístico de juguete: "netflix"/"streaming" cerca
    // entre sí, "disney" lejos de ambos -- suficiente para probar que la
    // similitud coseno realmente distingue, sin pegarle a Bedrock real.
    const normalized = text.toLowerCase();
    if (normalized.includes("netflix") || normalized.includes("streaming")) return [1, 0, 0];
    if (normalized.includes("disney")) return [0, 1, 0];
    return [0, 0, 1];
  };

  it("similitud de comercio real distingue Netflix de Disney Plus para la misma consulta 'streaming'", async () => {
    const query = baseQuery({ merchant: "streaming" });
    const netflixScore = await modelScore(tx({ merchant_name: "Netflix" }), query, fakeEmbed);
    const disneyScore = await modelScore(tx({ merchant_name: "Disney Plus" }), query, fakeEmbed);
    expect(netflixScore).toBeGreaterThan(disneyScore);
  });

  it("sin merchant en la consulta, el término de comercio se omite con gracia (nunca crashea)", async () => {
    const query = baseQuery({ disputedAmount: 219 });
    const score = await modelScore(tx({ amount: 219 }), query, fakeEmbed);
    expect(score).toBeGreaterThan(0); // solo el término de monto contribuye
  });

  it("monto: proximidad continua, no binaria -- más cerca puntúa más que más lejos", async () => {
    const query = baseQuery({ disputedAmount: 200 });
    const closeScore = await modelScore(tx({ amount: 205 }), query, fakeEmbed);
    const farScore = await modelScore(tx({ amount: 400 }), query, fakeEmbed);
    expect(closeScore).toBeGreaterThan(farScore);
  });

  it("fecha: resuelve la ventana real y distingue una transacción adentro de una afuera", async () => {
    const query = baseQuery({ transactionDateText: "la semana pasada", referenceDateIso: REFERENCE });
    const inside = await modelScore(tx({ transaction_date: "2026-09-20T00:00:00Z" }), query, fakeEmbed);
    const outside = await modelScore(tx({ transaction_date: "2026-01-01T00:00:00Z" }), query, fakeEmbed);
    expect(inside).toBeGreaterThan(outside);
  });

  it("embed que devuelve null (fallo de Bedrock) -> el término de comercio se omite, nunca crashea", async () => {
    const failingEmbed = async () => null;
    const query = baseQuery({ merchant: "netflix", disputedAmount: 219 });
    const score = await modelScore(tx({ merchant_name: "Netflix", amount: 219 }), query, failingEmbed);
    expect(score).toBeGreaterThan(0); // el término de monto sigue contribuyendo
    expect(Number.isNaN(score)).toBe(false);
  });
});

describe("modelScore — señal de categoría (docs/STATUS.md, reparos propuestos item #4)", () => {
  const fakeEmbedWithCategory = async (text: string): Promise<readonly number[] | null> => {
    const normalized = text.toLowerCase();
    if (normalized.includes("netflix") || normalized.includes("streaming")) return [1, 0, 0];
    if (normalized.includes("grocer") || normalized.includes("supermercado")) return [0, 0, 1];
    // Nombre de comercio genérico sin señal fuerte -- a propósito, para
    // aislar el aporte de `merchant_category` del término de comercio.
    return [0.5, 0.5, 0];
  };

  it("merchant_category rechaza una decoy de otro rubro cuando el nombre del comercio no distingue", async () => {
    const query = baseQuery({ merchant: "un cobro de streaming" });
    const streamingCandidate = tx({ merchant_name: "Servicio X", merchant_category: "Streaming" });
    const groceryCandidate = tx({ merchant_name: "Servicio Y", merchant_category: "Supermercado" });

    const streamingScore = await modelScore(streamingCandidate, query, fakeEmbedWithCategory);
    const groceryScore = await modelScore(groceryCandidate, query, fakeEmbedWithCategory);

    expect(streamingScore).toBeGreaterThan(groceryScore);
  });

  it("candidata sin merchant_category -> el término de categoría se omite, nunca crashea", async () => {
    const query = baseQuery({ merchant: "streaming" });
    const score = await modelScore(tx({ merchant_name: "Netflix", merchant_category: undefined }), query, fakeEmbedWithCategory);
    expect(score).toBeGreaterThan(0);
    expect(Number.isNaN(score)).toBe(false);
  });

  it("embed de categoría que falla (null) -> se omite con gracia, el resto de señales sigue contribuyendo", async () => {
    const partiallyFailingEmbed = async (text: string): Promise<readonly number[] | null> => {
      if (text === "Streaming") return null; // simula que SOLO el embed de la categoría falla
      return fakeEmbedWithCategory(text);
    };
    const query = baseQuery({ merchant: "streaming", disputedAmount: 219 });
    const score = await modelScore(
      tx({ merchant_name: "Netflix", merchant_category: "Streaming", amount: 219 }),
      query,
      partiallyFailingEmbed
    );
    expect(score).toBeGreaterThan(0);
    expect(Number.isNaN(score)).toBe(false);
  });
});

describe("rankAndDecide", () => {
  it("un solo candidato -> siempre confiado", async () => {
    const decision = await rankAndDecide([tx({ transaction_id: "TXN-A" })], baseQuery(), baselineScore);
    expect(decision.confident).toBe(true);
    expect(decision.top.transaction.transaction_id).toBe("TXN-A");
  });

  it("dos candidatos con scores empatados -> NO confiado", async () => {
    const decision = await rankAndDecide(
      [tx({ transaction_id: "TXN-A", merchant_name: "Netflix" }), tx({ transaction_id: "TXN-B", merchant_name: "Disney Plus" })],
      baseQuery(), // sin ninguna señal -> ambos score 0
      baselineScore
    );
    expect(decision.confident).toBe(false);
  });

  it("dos candidatos con separación clara -> confiado, elige el de mayor score", async () => {
    const decision = await rankAndDecide(
      [tx({ transaction_id: "TXN-A", merchant_name: "Netflix" }), tx({ transaction_id: "TXN-B", merchant_name: "Disney Plus" })],
      baseQuery({ merchant: "netflix" }),
      baselineScore
    );
    expect(decision.confident).toBe(true);
    expect(decision.top.transaction.transaction_id).toBe("TXN-A");
  });
});
