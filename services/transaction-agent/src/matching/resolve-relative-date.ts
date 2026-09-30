import type { LanguageCode } from "@banking-agent/shared";

/**
 * Resuelve una frase de fecha relativa (ES/PT) a un rango `{from, to}`
 * (`yyyy-mm-dd`, inclusive) contra una fecha de referencia -- el mismo
 * vocabulario de frases que `services/conversation-agent/src/router/
 * entity-extractor.ts` (`TRANSACTION_DATE_PATTERNS`) detecta, pero ahí
 * solo se CAPTURA el texto crudo (`entities.transaction_date`), nunca se
 * resuelve a una fecha real -- decisión explícita documentada en ese
 * archivo ("fuera de scope de este checkpoint"). Este módulo es NUEVO y
 * separado: no toca `entity-extractor.ts` (heurística ya probada), solo
 * consume el mismo texto que ya llega en `entities.transaction_date`.
 *
 * Deliberadamente con ventanas de tolerancia generosas (no un parser de
 * fechas exacto) -- un cliente que disputa un cargo rara vez recuerda el
 * día exacto ("la semana pasada" puede ser cualquier día de esa semana),
 * así que una ventana angosta produciría falsos negativos en el matcher.
 * Nunca lanza -- frase no reconocida -> `null`, el caller simplemente no
 * usa la señal de fecha para ese caso (mismo criterio "nunca fabrica un
 * dato" del resto del pipeline).
 */

const WEEKDAYS_ES = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const WEEKDAYS_PT = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

const MONTHS_ES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "setiembre",
  "octubre",
  "noviembre",
  "diciembre",
];
const MONTHS_PT = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

export interface DateRange {
  from: string;
  to: string;
}

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, days: number): Date {
  const copy = new Date(d.getTime());
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

function rangeAround(reference: Date, offsetDays: number, windowDays: number): DateRange {
  const center = addDays(reference, offsetDays);
  return { from: toIsoDate(addDays(center, -windowDays)), to: toIsoDate(addDays(center, windowDays)) };
}

/** Día de la semana (0=domingo) más reciente ANTERIOR (o igual) a `reference`
 * que coincida con `targetWeekday` -- "el martes pasado" dicho un jueves
 * significa el martes de ESTA semana o la pasada, nunca un martes futuro. */
function mostRecentPastWeekday(reference: Date, targetWeekday: number): Date {
  const refWeekday = reference.getUTCDay();
  let diff = refWeekday - targetWeekday;
  if (diff < 0) diff += 7;
  if (diff === 0) diff = 7; // "el lunes pasado" dicho un lunes -> el lunes anterior, no hoy.
  return addDays(reference, -diff);
}

export function resolveRelativeDate(phraseText: string | null, referenceDateIso: string, language: LanguageCode): DateRange | null {
  if (!phraseText) return null;
  const phrase = phraseText.trim().toLowerCase();
  const reference = new Date(referenceDateIso);
  if (Number.isNaN(reference.getTime())) return null;

  if (language === "es") {
    if (/\bhoy\b/.test(phrase)) return rangeAround(reference, 0, 0);
    if (/\banteayer\b/.test(phrase)) return rangeAround(reference, -2, 0);
    if (/\bayer\b/.test(phrase)) return rangeAround(reference, -1, 0);
    if (/\bla semana pasada\b/.test(phrase)) return rangeAround(reference, -10, 4);
    if (/\bel mes pasado\b/.test(phrase)) return rangeAround(reference, -30, 15);

    const weekdayMatch = phrase.match(/\bel (lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)\b/);
    if (weekdayMatch) {
      const normalized = weekdayMatch[1].replace("é", "e").replace("á", "a");
      const idx = WEEKDAYS_ES.findIndex((w) => w.replace("é", "e").replace("á", "a") === normalized);
      if (idx >= 0) {
        const target = mostRecentPastWeekday(reference, idx);
        return rangeAround(target, 0, 1);
      }
    }

    const dayOfMonthMatch = phrase.match(/\bel d[ií]a (\d{1,2})\b/);
    if (dayOfMonthMatch) {
      const day = parseInt(dayOfMonthMatch[1], 10);
      const candidate = new Date(reference);
      candidate.setUTCDate(day);
      if (candidate > reference) candidate.setUTCMonth(candidate.getUTCMonth() - 1);
      return rangeAround(candidate, 0, 1);
    }

    const fullDateMatch = phrase.match(
      /\bel (\d{1,2}) de (enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\b/
    );
    if (fullDateMatch) {
      const day = parseInt(fullDateMatch[1], 10);
      const monthIdx = MONTHS_ES.indexOf(fullDateMatch[2]) % 12; // setiembre/septiembre comparten índice 8
      const year = reference.getUTCFullYear();
      const candidate = new Date(Date.UTC(year, monthIdx, day));
      if (candidate > reference) candidate.setUTCFullYear(year - 1);
      return rangeAround(candidate, 0, 1);
    }

    return null;
  }

  // pt
  if (/\bhoje\b/.test(phrase)) return rangeAround(reference, 0, 0);
  if (/\banteontem\b/.test(phrase)) return rangeAround(reference, -2, 0);
  if (/\bontem\b/.test(phrase)) return rangeAround(reference, -1, 0);
  if (/\bsemana passada\b/.test(phrase)) return rangeAround(reference, -10, 4);
  if (/\bm[eê]s passado\b/.test(phrase)) return rangeAround(reference, -30, 15);

  const weekdayMatchPt = phrase.match(/\bna (segunda|ter[çc]a|quarta|quinta|sexta)(-feira)?\b/);
  if (weekdayMatchPt) {
    const normalized = weekdayMatchPt[1].replace("ç", "c");
    const idx = WEEKDAYS_PT.findIndex((w) => w.replace("ç", "c") === normalized);
    if (idx >= 0) {
      const target = mostRecentPastWeekday(reference, idx);
      return rangeAround(target, 0, 1);
    }
  }
  const weekendMatchPt = phrase.match(/\bno (s[aá]bado|domingo)\b/);
  if (weekendMatchPt) {
    const normalized = weekendMatchPt[1].replace("á", "a");
    const idx = WEEKDAYS_PT.findIndex((w) => w.replace("á", "a") === normalized);
    if (idx >= 0) {
      const target = mostRecentPastWeekday(reference, idx);
      return rangeAround(target, 0, 1);
    }
  }

  const dayOfMonthMatchPt = phrase.match(/\bo dia (\d{1,2})\b/);
  if (dayOfMonthMatchPt) {
    const day = parseInt(dayOfMonthMatchPt[1], 10);
    const candidate = new Date(reference);
    candidate.setUTCDate(day);
    if (candidate > reference) candidate.setUTCMonth(candidate.getUTCMonth() - 1);
    return rangeAround(candidate, 0, 1);
  }

  const fullDateMatchPt = phrase.match(
    /\bdia (\d{1,2}) de (janeiro|fevereiro|mar[çc]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\b/
  );
  if (fullDateMatchPt) {
    const day = parseInt(fullDateMatchPt[1], 10);
    const normalizedMonth = fullDateMatchPt[2].replace("ç", "c");
    const monthIdx = MONTHS_PT.findIndex((m) => m.replace("ç", "c") === normalizedMonth);
    const year = reference.getUTCFullYear();
    const candidate = new Date(Date.UTC(year, monthIdx, day));
    if (candidate > reference) candidate.setUTCFullYear(year - 1);
    return rangeAround(candidate, 0, 1);
  }

  return null;
}
