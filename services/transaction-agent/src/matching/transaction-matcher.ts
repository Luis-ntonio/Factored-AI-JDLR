import type { LanguageCode } from "@banking-agent/shared";
import type { Transaction } from "../data/mock-core-banking";
import { resolveRelativeDate } from "./resolve-relative-date";

/**
 * Rankea transacciones candidatas AMBIGUAS (2+ que ya pasaron el filtro
 * difuso de `static-transaction-repository.ts`) contra lo que el cliente
 * recuerda, para desambiguar sin inventar una elección al azar. Dos
 * scorers, mismo "learned component" evaluado con rigor en
 * `scripts/evaluate-transaction-matcher.ts`:
 *
 * - `baselineScore`: formaliza el filtro que el sistema YA aplicaba (ver
 *   `static-transaction-repository.ts`) como un puntaje sumable en vez de
 *   un include/exclude binario. Es el punto de comparación real, no una
 *   versión débil inventada para que el modelo gane fácil.
 * - `modelScore`: sustituye el término de comercio por similitud semántica
 *   real (embeddings de Bedrock, inyectados vía `embed`), y los términos
 *   de monto/fecha por señales continuas en vez de umbrales binarios --
 *   mismo criterio "auditable a mano" que `scoring/compute-score.ts`.
 *
 * Ninguno de los dos actúa nunca "a ciegas": `rankAndDecide` solo marca un
 * resultado como confiable si el mejor score supera `tau` Y se separa del
 * segundo por `marginTau` -- dos candidatas con scores casi idénticos
 * siguen sin resolverse solas (cae al comportamiento actual: CLARIFY/
 * ESCALATE vía policies.yaml).
 */

export interface MatchQuery {
  merchant: string | null;
  disputedAmount: number | null;
  transactionDateText: string | null;
  /** ISO -- `chatOpenedAt` del turno, o el momento del turno si no hay
   * `chatOpenedAt`. Nunca `new Date()` del proceso (no determinístico,
   * rompería tests e idempotencia conceptual). */
  referenceDateIso: string;
  language: LanguageCode;
}

export interface RankedCandidate {
  transaction: Transaction;
  score: number;
}

const AMOUNT_TOLERANCE_RATIO = 0.01;
const AMOUNT_TOLERANCE_FLOOR = 0.5;

function normalizeText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

function amountWithinTolerance(transactionAmount: number, rememberedAmount: number): boolean {
  const tolerance = Math.max(Math.abs(rememberedAmount) * AMOUNT_TOLERANCE_RATIO, AMOUNT_TOLERANCE_FLOOR);
  return Math.abs(transactionAmount - rememberedAmount) <= tolerance;
}

/** Baseline: exactamente las 2 señales binarias que
 * `static-transaction-repository.ts` ya usaba para el filtro (comercio
 * substring + monto con tolerancia), más una señal de fecha MUY simple
 * (la frase de fecha, sin resolver, mencionada o no) -- score 0-3. Nunca
 * usa el resolver de fechas (paso 2 del modelo) ni embeddings: es
 * deliberadamente "lo de siempre", el punto de comparación real. */
export function baselineScore(candidate: Transaction, query: MatchQuery): number {
  let score = 0;
  if (query.merchant && candidate.merchant_name) {
    if (normalizeText(candidate.merchant_name).includes(normalizeText(query.merchant))) score += 1;
  }
  if (query.disputedAmount !== null && amountWithinTolerance(candidate.amount, query.disputedAmount)) {
    score += 1;
  }
  if (query.transactionDateText) {
    // Señal débil deliberada: el baseline no resuelve fechas relativas,
    // solo premia levemente que el cliente haya mencionado ALGUNA fecha
    // (sin usarla para comparar contra la transacción) -- documentado como
    // limitación real del baseline, no un error.
    score += 0.25;
  }
  return score;
}

function cosineSimilarity(a: readonly number[], b: readonly number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/** Pesos documentados del modelo -- auditables a mano, ajustados en el
 * harness de evaluación (`scripts/evaluate-transaction-matcher.ts`), nunca
 * a ojo. Suman 1 cuando las 4 señales están disponibles; si falta alguna
 * (ej. sin `merchant`, o la candidata sin `merchant_category`), el peso se
 * redistribuye proporcionalmente entre las señales disponibles -- nunca
 * penaliza a una candidata por un dato que el cliente simplemente no
 * mencionó, ni por un dato que la transacción simplemente no tiene.
 *
 * `category` (docs/STATUS.md, fase "Simulador de conversaciones" ->
 * reparos propuestos, item #4): similitud de embeddings entre lo que el
 * cliente escribió (`query.merchant`, sea un nombre de comercio real o una
 * frase genérica de rubro) y `candidate.merchant_category` -- reusa el
 * MISMO `embed` ya inyectado, nunca un keyword/taxonomía nueva. Rechaza
 * decoys de un rubro distinto (ej. consulta de streaming vs. candidata de
 * supermercado) incluso cuando el monto es parecido -- NO discrimina entre
 * candidatas del MISMO rubro (ver `generate-matcher-fixtures.ts`, los casos
 * "Caso A"/"Caso B" comparten `merchant_category` a propósito, por eso ese
 * cruce sigue sin señal real -- `crossCategory: true` en "Caso C" es el que
 * mide el aporte real de esta señal). */
const MODEL_WEIGHTS = { merchant: 0.4, amount: 0.25, date: 0.15, category: 0.2 };

export interface EmbedFn {
  (text: string): Promise<readonly number[] | null>;
}

export async function modelScore(candidate: Transaction, query: MatchQuery, embed: EmbedFn): Promise<number> {
  const terms: Array<{ weight: number; value: number }> = [];

  if (query.merchant) {
    const [queryEmbedding, merchantEmbedding, categoryEmbedding] = await Promise.all([
      embed(query.merchant),
      candidate.merchant_name ? embed(candidate.merchant_name) : Promise.resolve(null),
      candidate.merchant_category ? embed(candidate.merchant_category) : Promise.resolve(null),
    ]);

    if (queryEmbedding && merchantEmbedding) {
      // Cosine similarity real puede ser negativa; se recorta a [0,1] para
      // que el score final quede siempre en un rango interpretable.
      terms.push({ weight: MODEL_WEIGHTS.merchant, value: Math.max(0, cosineSimilarity(queryEmbedding, merchantEmbedding)) });
    }
    if (queryEmbedding && categoryEmbedding) {
      terms.push({ weight: MODEL_WEIGHTS.category, value: Math.max(0, cosineSimilarity(queryEmbedding, categoryEmbedding)) });
    }
  }

  if (query.disputedAmount !== null) {
    const diff = Math.abs(candidate.amount - query.disputedAmount);
    const relativeDiff = diff / Math.max(Math.abs(query.disputedAmount), 1);
    // Decae linealmente: exacto = 1, 20% de diferencia o más = 0.
    const proximity = Math.max(0, 1 - relativeDiff / 0.2);
    terms.push({ weight: MODEL_WEIGHTS.amount, value: proximity });
  }

  if (query.transactionDateText) {
    const range = resolveRelativeDate(query.transactionDateText, query.referenceDateIso, query.language);
    if (range) {
      const day = candidate.transaction_date.slice(0, 10);
      const inside = day >= range.from && day <= range.to;
      terms.push({ weight: MODEL_WEIGHTS.date, value: inside ? 1 : 0 });
    }
  }

  if (terms.length === 0) return 0;
  const totalWeight = terms.reduce((sum, t) => sum + t.weight, 0);
  return terms.reduce((sum, t) => sum + (t.weight / totalWeight) * t.value, 0);
}

export type ScoreFn = (candidate: Transaction, query: MatchQuery) => number | Promise<number>;

export interface MatchDecision {
  confident: boolean;
  top: RankedCandidate;
  ranked: RankedCandidate[];
}

/** Umbral y margen elegidos en `scripts/evaluate-transaction-matcher.ts`
 * contra el dataset sintético de evaluación (Recall@1 vs falsos positivos)
 * -- documentados acá como el valor vigente, no elegidos a ojo en este
 * archivo. Reevaluar si el harness recomienda otro valor. */
export const DEFAULT_TAU = 0.6;
export const DEFAULT_MARGIN_TAU = 0.15;

export async function rankAndDecide(
  candidates: readonly Transaction[],
  query: MatchQuery,
  scoreFn: ScoreFn,
  tau: number = DEFAULT_TAU,
  marginTau: number = DEFAULT_MARGIN_TAU
): Promise<MatchDecision> {
  const ranked: RankedCandidate[] = [];
  for (const transaction of candidates) {
    const score = await scoreFn(transaction, query);
    ranked.push({ transaction, score });
  }
  ranked.sort((a, b) => b.score - a.score);

  const top = ranked[0];
  const second = ranked[1];
  // Un solo candidato no es un caso de desambiguación -- no hay nada
  // contra qué comparar, así que es "confiado" sin importar el score (el
  // score bajo, si lo hay, ya lo maneja el caller ANTES de llamar a este
  // matcher -- `rankAndDecide` solo se invoca en `compute-dispute.ts`
  // cuando ya hay 2+ candidatas reales).
  const confident = !second || (top.score >= tau && top.score - second.score >= marginTau);

  return { confident, top, ranked };
}
