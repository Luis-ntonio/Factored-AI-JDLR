import * as path from "node:path";
import * as fs from "node:fs";
import type { LanguageCode } from "@banking-agent/shared";
import type { Transaction, Country, Currency } from "../src/data/mock-core-banking";
import { resolveRelativeDate } from "../src/matching/resolve-relative-date";

/**
 * Genera el dataset SINTÉTICO de evaluación del matcher de transacciones
 * disputadas (`src/matching/transaction-matcher.ts`) -- 40 clientes
 * sintéticos (NUNCA los 4 de `mock-core-banking.ts`, que son el mock chico
 * de demo, no el dataset de evaluación), 2 casos de disputa cada uno (80
 * casos totales -- subido de 24/48 porque las celdas más finas del reporte
 * tenían muy pocos casos para que un desglose fuera confiable).
 *
 * Seed determinístico (PRNG `mulberry32`, sin `Math.random()`) -- la salida
 * se commitea a `eval-fixtures/matcher-cases.json` y NUNCA se regenera en
 * cada corrida del harness (reproducibilidad real: correr este script dos
 * veces produce byte-a-byte el mismo JSON).
 *
 * Diseño de la ambigüedad (mismo principio que la fixture de demo
 * TXN-000025 en `mock-core-banking.ts`): cada caso tiene un grupo de 2-3
 * "candidatas confusables" -- mismo monto, mismo rubro (streaming/comida a
 * domicilio/retail/transporte/supermercado), comercios DISTINTOS, fechas
 * separadas lo suficiente para que una ventana de fecha real (`estilo
 * "la semana pasada"`) distinga exactamente UNA.
 *
 * Dos ejes deliberados que hacen la comparación baseline-vs-modelo honesta
 * (no un caso inventado para que el modelo gane fácil):
 * - `queryStyle: "exact-merchant"` -- la consulta nombra el comercio real
 *   tal cual ("Netflix"). Ambos arms deberían resolverlo bien.
 * - `queryStyle: "generic-category"` -- la consulta usa una frase genérica
 *   de rubro ("un cobro de streaming"), SIN nombrar el comercio. El baseline
 *   (substring exacto) estructuralmente no puede matchear ningún candidato
 *   por comercio en este estilo -- quedan todos en 0 y el desempate cae en
 *   su señal de fecha NO discriminante (+0.25 parejo). El modelo tiene
 *   embeddings (crédito parcial real, incierto de antemano) + resolución
 *   real de ventana de fecha (si la consulta la menciona) -- que si la
 *   incluye, SÍ discrimina. Esto es exactamente el gap que motiva el
 *   feature, medido de verdad en vez de asumido.
 *
 * Un ~30% de los casos NO incluye frase de fecha (`transactionDateText:
 * null`) -- ninguna señal discriminante para ninguno de los dos arms en
 * estilo "generic-category" (limitación real y esperada, reportada tal
 * cual, no ocultada).
 *
 * Dos ejes adicionales (mejora de dataset, misma sesión que subió
 * NUM_CUSTOMERS): ~30% de los casos con frase de fecha ubican los decoys
 * "casi dentro" de la ventana resuelta en vez de siempre muy lejos (prueba
 * el borde real de `rangeAround()`); ~30% de los casos el monto de la
 * consulta es una aproximación ±1-3% del monto real compartido (el
 * cliente "recuerda como 220 pesos"), nunca siempre exacto.
 *
 * `designSet: true` en los primeros 6 clientes (12 casos): fueron los
 * casos inspeccionados a mano para fijar `DEFAULT_TAU`/`DEFAULT_MARGIN_TAU`
 * en `transaction-matcher.ts` -- excluidos del reporte final (mismo
 * patrón que `services/policy-agent/scripts/evaluate-decide-stage.ts`).
 */

interface MatcherFixtureQuery {
  merchant: string | null;
  disputedAmount: number | null;
  transactionDateText: string | null;
  referenceDateIso: string;
  language: LanguageCode;
}

export interface MatcherFixtureCase {
  id: string;
  customerId: string;
  language: LanguageCode;
  ambiguityLevel: "2-candidates" | "3-plus-candidates";
  queryStyle: "exact-merchant" | "generic-category";
  hasDatePhrase: boolean;
  designSet: boolean;
  query: MatcherFixtureQuery;
  candidates: Transaction[];
  targetTransactionId: string;
}

// Relativo a process.cwd() (npm fija el cwd al package.json que define el
// script, `services/transaction-agent`) -- NUNCA `__dirname`, que en
// runtime apunta a `dist/scripts/` (no compilado/copiado ahí), mismo
// criterio que `FIXTURES_PATH` en `evaluate-transaction-matcher.ts`.
const OUTPUT_PATH = path.resolve(process.cwd(), "scripts/eval-fixtures/matcher-cases.json");
const REFERENCE_DATE_ISO = "2026-09-29T12:00:00Z";
// 40 clientes (subido de 24) -- las celdas más finas del reporte
// (3-plus-candidates, sin frase de fecha) tenían solo 6-20 casos, donde un
// solo caso movía el porcentaje varios puntos. Con 40 clientes (80 casos)
// esas celdas tienen más soporte real.
const NUM_CUSTOMERS = 40;
const DESIGN_SET_CUSTOMER_COUNT = 6;

// --- PRNG determinístico (mulberry32) -- nunca Math.random() -------------
function mulberry32(seed: number): () => number {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(20260929);
function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}
function randInt(min: number, maxInclusive: number): number {
  return min + Math.floor(rng() * (maxInclusive - min + 1));
}

interface MerchantGroup {
  category: string;
  genericPhrase: { es: string; pt: string };
  merchants: string[];
}

const MERCHANT_GROUPS: MerchantGroup[] = [
  {
    category: "streaming",
    genericPhrase: { es: "un cobro de un servicio de streaming", pt: "uma cobrança de um serviço de streaming" },
    merchants: ["Netflix", "Disney Plus", "HBO Max", "Spotify"],
  },
  {
    category: "delivery",
    genericPhrase: { es: "un pedido de comida a domicilio", pt: "um pedido de comida por aplicativo" },
    merchants: ["Rappi", "Uber Eats", "Didi Food"],
  },
  {
    category: "retail",
    genericPhrase: { es: "una compra en una tienda en línea", pt: "uma compra em uma loja online" },
    merchants: ["Amazon MX", "Mercado Libre", "Liverpool"],
  },
  {
    category: "transport",
    genericPhrase: { es: "un viaje en una app de transporte", pt: "uma corrida em um aplicativo de transporte" },
    merchants: ["Uber", "Didi", "Cabify"],
  },
  {
    category: "supermarket",
    genericPhrase: { es: "una compra de supermercado", pt: "uma compra de supermercado" },
    merchants: ["Walmart", "Éxito", "Carrefour"],
  },
];

interface DatePhraseSpec {
  es: string;
  pt: string;
  // Offset (días respecto a la referencia) y media-ventana, replicando
  // exactamente rangeAround() de resolve-relative-date.ts -- usado acá SOLO
  // para elegir una fecha DENTRO del rango real (nunca se hardcodea el
  // rango de forma independiente, se deriva llamando a resolveRelativeDate).
}
const DATE_PHRASES: DatePhraseSpec[] = [
  { es: "ayer", pt: "ontem" },
  { es: "anteayer", pt: "anteontem" },
  { es: "la semana pasada", pt: "semana passada" },
  { es: "el mes pasado", pt: "mês passado" },
  // Agregado (mejora de dataset): día de la semana con
  // mostRecentPastWeekday(), antes solo se ejercitaban los 4 patrones de
  // offset fijo de arriba. REFERENCE_DATE_ISO es 2026-09-29 (martes) -- "el
  // lunes pasado"/"na segunda-feira" resuelve al lunes de esta semana
  // (2026-09-28), ver resolveRelativeDate.
  { es: "el lunes pasado", pt: "na segunda-feira" },
];

// Offset fijo y grande para fechas "decoy" -- verificado por inspección que
// cae fuera de las 4 ventanas de offset fijo de arriba (la más ancha, "el
// mes pasado", es como mucho ref-45..ref-15): ref-90 siempre queda afuera.
// Usado para la mayoría de los decoys ("lejos, caso fácil").
const DECOY_OFFSET_DAYS = -90;

// Fracción de casos donde el/los decoy(s) se ubican "casi dentro" de la
// ventana resuelta (mejora de dataset) en vez de siempre muy lejos --
// prueba la precisión real del borde de rangeAround() (resolve-relative-
// date.ts), no solo el caso fácil. Offset chico, por fuera del borde
// superior de la ventana más angosta (un solo día, ej. "ayer"/"el lunes
// pasado") pero cerca.
const NEAR_MISS_DECOY_DAYS_PAST_WINDOW = 5;

const COUNTRIES: Country[] = ["Mexico", "Colombia", "Argentina"];
const CURRENCY_BY_COUNTRY: Record<Country, Currency> = { Mexico: "MXN", Colombia: "COP", Argentina: "ARS" };

function isoDateDaysFrom(referenceIso: string, offsetDays: number, hour = 12): string {
  const d = new Date(referenceIso);
  d.setUTCDate(d.getUTCDate() + offsetDays);
  d.setUTCHours(hour, 0, 0, 0);
  return d.toISOString();
}

function randomDateWithinRange(from: string, to: string): string {
  const fromMs = new Date(`${from}T00:00:00Z`).getTime();
  const toMs = new Date(`${to}T23:59:59Z`).getTime();
  const ms = fromMs + rng() * (toMs - fromMs);
  return new Date(ms).toISOString();
}

let txnCounter = 1;
function nextTxnId(): string {
  const id = `SYN-TXN-${String(txnCounter).padStart(5, "0")}`;
  txnCounter += 1;
  return id;
}

function buildTransaction(params: {
  customerId: string;
  merchantName: string;
  amount: number;
  currency: Currency;
  country: Country;
  dateIso: string;
}): Transaction {
  const { customerId, merchantName, amount, currency, country, dateIso } = params;
  return {
    transaction_id: nextTxnId(),
    transaction_date: dateIso,
    process_date: dateIso.slice(0, 10),
    product_id: `SYN-PROD-${customerId}`,
    customer_id: customerId,
    transaction_type: "Purchase",
    amount,
    currency,
    channel: "Web",
    merchant_name: merchantName,
    transaction_country: country,
    transaction_status: "Approved",
    is_fraud: false,
    fraud_score: 1.5,
  };
}

function addDaysToDateOnly(dateOnly: string, days: number): string {
  const d = new Date(`${dateOnly}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function buildCase(params: {
  idSuffix: string;
  customerId: string;
  language: LanguageCode;
  ambiguityLevel: "2-candidates" | "3-plus-candidates";
  queryStyle: "exact-merchant" | "generic-category";
  hasDatePhrase: boolean;
  designSet: boolean;
}): MatcherFixtureCase {
  const { idSuffix, customerId, language, ambiguityLevel, queryStyle, hasDatePhrase, designSet } = params;
  const group = pick(MERCHANT_GROUPS);
  const country = pick(COUNTRIES);
  const currency = CURRENCY_BY_COUNTRY[country];
  const sharedAmount = Math.round((randInt(50, 2000) + rng()) * 100) / 100;

  const candidateCount = ambiguityLevel === "2-candidates" ? 2 : 3;
  const merchantsForCase = [...group.merchants].sort(() => rng() - 0.5).slice(0, candidateCount);

  let targetDateIso: string;
  let datePhraseText: string | null = null;
  let resolvedWindowTo: string | null = null;
  let targetIdx = randInt(0, candidateCount - 1);

  if (hasDatePhrase) {
    const phraseSpec = pick(DATE_PHRASES);
    datePhraseText = phraseSpec[language];
    const range = resolveRelativeDate(datePhraseText, REFERENCE_DATE_ISO, language);
    if (!range) {
      throw new Error(`resolveRelativeDate no reconoció una frase propia del generador: "${datePhraseText}" (${language})`);
    }
    targetDateIso = randomDateWithinRange(range.from, range.to);
    resolvedWindowTo = range.to;
  } else {
    // Sin frase de fecha: el target no tiene ninguna fecha "especial" --
    // se le asigna una fecha reciente arbitraria, igual que a los decoys
    // (ninguna señal de fecha discrimina en este caso, por diseño).
    targetDateIso = isoDateDaysFrom(REFERENCE_DATE_ISO, -randInt(1, 40));
  }

  // Mejora de dataset: ~30% de los casos CON frase de fecha ubican los
  // decoys "casi dentro" de la ventana resuelta (unos días después del
  // borde superior) en vez de siempre muy lejos (DECOY_OFFSET_DAYS) --
  // prueba la precisión real del límite de rangeAround(), no solo el caso
  // fácil de "claramente afuera".
  const useNearMissDecoys = resolvedWindowTo !== null && rng() < 0.3;

  const candidates: Transaction[] = [];
  let targetTransactionId = "";
  for (let i = 0; i < candidateCount; i++) {
    let dateIso: string;
    if (i === targetIdx) {
      dateIso = targetDateIso;
    } else if (useNearMissDecoys && resolvedWindowTo) {
      const decoyDateOnly = addDaysToDateOnly(resolvedWindowTo, NEAR_MISS_DECOY_DAYS_PAST_WINDOW + i);
      // Salvaguarda: si la ventana resuelta está muy cerca de la fecha de
      // referencia (ej. "ayer"), el decoy "casi dentro" podría caer en el
      // futuro respecto a REFERENCE_DATE_ISO -- una transacción sintética
      // nunca debe fecharse después de "ahora". Si eso pasaría, se usa el
      // decoy lejano estándar para ESTE candidato puntual en vez de forzar
      // una fecha futura.
      const referenceDateOnly = REFERENCE_DATE_ISO.slice(0, 10);
      dateIso =
        decoyDateOnly <= referenceDateOnly
          ? `${decoyDateOnly}T12:00:00Z`
          : isoDateDaysFrom(REFERENCE_DATE_ISO, DECOY_OFFSET_DAYS - i * 3);
    } else {
      dateIso = isoDateDaysFrom(REFERENCE_DATE_ISO, DECOY_OFFSET_DAYS - i * 3);
    }
    const txn = buildTransaction({
      customerId,
      merchantName: merchantsForCase[i],
      amount: sharedAmount,
      currency,
      country,
      dateIso,
    });
    candidates.push(txn);
    if (i === targetIdx) targetTransactionId = txn.transaction_id;
  }

  const queryMerchant =
    queryStyle === "exact-merchant" ? merchantsForCase[targetIdx] : group.genericPhrase[language];

  // Mejora de dataset: ~30% de los casos el cliente "recuerda
  // aproximadamente" el monto (±1-3%) en vez del monto exacto -- las
  // candidatas siguen con el monto REAL (sharedAmount); solo la consulta
  // se perturba. Ejercita amountWithinTolerance (baseline)/la proximidad
  // continua (modelo) contra el caso real de "como 220 pesos".
  const approximateAmount = rng() < 0.3;
  const disputedAmount = approximateAmount
    ? Math.round(sharedAmount * (1 + (rng() < 0.5 ? -1 : 1) * (0.01 + rng() * 0.02)) * 100) / 100
    : sharedAmount;

  return {
    id: `matcher-${idSuffix}`,
    customerId,
    language,
    ambiguityLevel,
    queryStyle,
    hasDatePhrase,
    designSet,
    query: {
      merchant: queryMerchant,
      disputedAmount,
      transactionDateText: datePhraseText,
      referenceDateIso: REFERENCE_DATE_ISO,
      language,
    },
    candidates,
    targetTransactionId,
  };
}

function main(): void {
  const cases: MatcherFixtureCase[] = [];

  for (let custIdx = 0; custIdx < NUM_CUSTOMERS; custIdx++) {
    const customerId = `SYN-CUST-${String(custIdx + 1).padStart(3, "0")}`;
    const designSet = custIdx < DESIGN_SET_CUSTOMER_COUNT;
    const language: LanguageCode = custIdx % 4 === 0 ? "pt" : "es"; // ~25% pt, mismo criterio de proporción que el resto del repo (pt es minoría real).

    // Caso A: 2 candidatas, estilo alternado, con frase de fecha (el caso
    // "típico" de demo -- mismo diseño que TXN-000025/TXN-000002).
    cases.push(
      buildCase({
        idSuffix: `${customerId}-a`,
        customerId,
        language,
        ambiguityLevel: "2-candidates",
        queryStyle: custIdx % 2 === 0 ? "exact-merchant" : "generic-category",
        hasDatePhrase: true,
        designSet,
      })
    );

    // Caso B: 3+ candidatas, estilo opuesto al caso A, ~30% sin frase de
    // fecha (limitación declarada, ver docstring de arriba).
    cases.push(
      buildCase({
        idSuffix: `${customerId}-b`,
        customerId,
        language,
        ambiguityLevel: "3-plus-candidates",
        queryStyle: custIdx % 2 === 0 ? "generic-category" : "exact-merchant",
        hasDatePhrase: custIdx % 3 !== 0,
        designSet,
      })
    );
  }

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(cases, null, 2));
  console.log(`[generate-matcher-fixtures] ${cases.length} casos escritos en ${OUTPUT_PATH}`);
  console.log(
    `[generate-matcher-fixtures] ${cases.filter((c) => c.designSet).length} marcados designSet:true (excluidos del reporte final).`
  );
}

main();
