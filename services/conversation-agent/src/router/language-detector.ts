import type { LanguageCode } from "@banking-agent/shared";

/**
 * Detección de idioma ES/PT por mensaje individual (no por sesión — un
 * usuario puede cambiar de idioma a mitad de conversación, ver tarea).
 *
 * Heurística basada en listas de palabras/patrones (sin dependencia externa
 * de NLP, deliberado para el scope de 10 días — ver limitación en
 * docs/CONTRACTS.md, "Language coverage"). Estrategia:
 *  1. Señales FUERTES de portugués: diacríticos exclusivos (ã, õ, ç) y
 *     palabras que no existen en español (não, você, então, também, está,
 *     obrigado/a, então, cartão, empréstimo, etc.)
 *  2. Señales FUERTES de español: ñ, palabras exclusivas (qué, cómo, sí,
 *     préstamo, tarjeta, cuenta, gracias, hola).
 *  3. Si hay señal de ambos (raro) o de ninguno, se cuentan palabras
 *     funcionales comunes de cada idioma (stopwords) como desempate.
 *  4. Default final: "es" (documentado — mercado primario asumido ES-LATAM;
 *     ver docs/CONTRACTS.md limitaciones).
 */

const PT_STRONG_WORDS = [
  "não",
  "nao",
  "você",
  "voce",
  "então",
  "entao",
  "também",
  "tambem",
  "obrigado",
  "obrigada",
  "cartão",
  "cartao",
  "empréstimo",
  "emprestimo",
  "quero",
  "preciso",
  "conta",
  "renda",
  "salário",
  "cpf",
  "olá",
  "ola",
  "bom dia",
  "boa tarde",
  "boa noite",
  "sim",
];

const ES_STRONG_WORDS = [
  "qué",
  "que",
  "cómo",
  "como",
  "sí",
  "préstamo",
  "prestamo",
  "tarjeta",
  "cuenta",
  "gracias",
  "hola",
  "quiero",
  "necesito",
  "ingreso",
  "ingresos",
  "sueldo",
  "salario",
  "buenos días",
  "buenas tardes",
  "buenas noches",
];

const PT_DIACRITIC_PATTERN = /[ãõç]/i;
const ES_DIACRITIC_PATTERN = /[ñ¿¡]/;

/**
 * Quita puntuación (todo lo que no sea letra/dígito/espacio, preservando
 * acentos/ñ/ã/õ/ç vía \p{L} unicode) reemplazándola por espacio, de forma
 * que una palabra pegada a un signo (ej. "que?", "taxa?") quede delimitada
 * por espacios igual que si no tuviera puntuación. Esto evita tener que
 * recurrir a un fallback de substring crudo (que hacía que "que" matcheara
 * dentro de "quero") para capturar ese caso.
 */
function stripPunctuation(text: string): string {
  return text.replace(/[^\p{L}\p{N}\s]/gu, " ");
}

function countMatches(text: string, words: string[]): number {
  const normalized = ` ${stripPunctuation(text.toLowerCase())} `;
  return words.reduce((count, word) => (normalized.includes(` ${word} `) ? count + 1 : count), 0);
}

export interface LanguageDetectionResult {
  language: LanguageCode;
  /** Señal usada para decidir, útil para debugging/observabilidad, no parte del contrato público. */
  confidenceSignal: "diacritic" | "keyword" | "default";
}

export function detectLanguage(message: string): LanguageDetectionResult {
  if (!message || message.trim().length === 0) {
    return { language: "es", confidenceSignal: "default" };
  }

  const hasPtDiacritic = PT_DIACRITIC_PATTERN.test(message);
  const hasEsDiacritic = ES_DIACRITIC_PATTERN.test(message);

  if (hasPtDiacritic && !hasEsDiacritic) {
    return { language: "pt", confidenceSignal: "diacritic" };
  }
  if (hasEsDiacritic && !hasPtDiacritic) {
    return { language: "es", confidenceSignal: "diacritic" };
  }

  const ptScore = countMatches(message, PT_STRONG_WORDS);
  const esScore = countMatches(message, ES_STRONG_WORDS);

  if (ptScore > esScore) {
    return { language: "pt", confidenceSignal: "keyword" };
  }
  if (esScore > ptScore) {
    return { language: "es", confidenceSignal: "keyword" };
  }

  return { language: "es", confidenceSignal: "default" };
}
