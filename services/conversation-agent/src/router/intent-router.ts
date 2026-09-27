import { Entities, Intent, LanguageCode } from "@banking-agent/shared";

/**
 * Router de intención para el flujo único "credit-product info &
 * eligibility". Heurística de keywords por idioma + señal de entities ya
 * extraídos de ESTE mensaje (ver entity-extractor.ts).
 *
 * Prioridad de clasificación (documentada a propósito, no accidental):
 *  1. escalation_request — un pedido explícito de hablar con un humano
 *     siempre gana, incluso si el mensaje también menciona un producto.
 *  2. eligibility_check — si hay lenguaje explícito de "califico/soy
 *     elegible" O si el mensaje aporta >= 2 entities de elegibilidad
 *     (income, employment_status, requested_amount, document_id) en el
 *     mismo turno (señal fuerte de que el usuario está en flujo de
 *     evaluación, no solo preguntando por catálogo).
 *  3. product_info — preguntas sobre condiciones/catálogo.
 *  4. faq — preguntas generales no transaccionales.
 *  5. unknown — ninguna señal suficiente; fuerza CLARIFY en policy-agent.
 */

const ESCALATION_KEYWORDS: Record<LanguageCode, string[]> = {
  es: [
    "hablar con un humano",
    "hablar con un asesor",
    "hablar con una persona",
    "agente humano",
    "representante",
    "persona real",
    "quiero hablar con alguien",
    "operador",
  ],
  pt: [
    "falar com um humano",
    "falar com um atendente",
    "falar com uma pessoa",
    "atendente humano",
    "representante",
    "pessoa real",
    "quero falar com alguém",
    "quero falar com alguem",
    "operador",
  ],
};

const ELIGIBILITY_KEYWORDS: Record<LanguageCode, string[]> = {
  es: ["califico", "soy elegible", "puedo acceder", "cumplo los requisitos", "me aprueban", "califica", "elegibilidad"],
  pt: ["eu qualifico", "sou elegível", "sou elegivel", "consigo o crédito", "consigo o credito", "atendo os requisitos", "qualifico", "elegibilidade"],
};

const PRODUCT_INFO_KEYWORDS: Record<LanguageCode, string[]> = {
  es: [
    "qué tasa",
    "que tasa",
    "cuáles son los requisitos",
    "cuales son los requisitos",
    "condiciones del préstamo",
    "condiciones del prestamo",
    "tasa de interés",
    "tasa de interes",
    "cuánto cobran",
    "cuanto cobran",
    "información sobre",
    "informacion sobre",
    "plazos",
  ],
  pt: [
    "qual a taxa",
    "quais são os requisitos",
    "quais sao os requisitos",
    "condições do empréstimo",
    "condicoes do emprestimo",
    "taxa de juros",
    "quanto cobram",
    "informações sobre",
    "informacoes sobre",
    "prazos",
  ],
};

const FAQ_KEYWORDS: Record<LanguageCode, string[]> = {
  es: ["horario", "sucursal", "cómo contacto", "como contacto", "qué es", "que es", "atención al cliente", "atencion al cliente"],
  pt: ["horário", "horario", "agência", "agencia", "como entro em contato", "o que é", "o que e", "atendimento ao cliente"],
};

const ELIGIBILITY_ENTITY_KEYS = ["income", "employment_status", "requested_amount", "document_id"] as const;

function includesAny(lower: string, phrases: string[]): boolean {
  return phrases.some((p) => lower.includes(p));
}

export function routeIntent(message: string, language: LanguageCode, entities: Entities): Intent {
  const lower = message.toLowerCase();

  if (includesAny(lower, ESCALATION_KEYWORDS[language])) {
    return "escalation_request";
  }

  const eligibilityEntityCount = ELIGIBILITY_ENTITY_KEYS.filter((k) => entities[k] !== null).length;

  if (includesAny(lower, ELIGIBILITY_KEYWORDS[language]) || eligibilityEntityCount >= 2) {
    return "eligibility_check";
  }

  if (includesAny(lower, PRODUCT_INFO_KEYWORDS[language]) || entities.product_type !== null) {
    return "product_info";
  }

  if (includesAny(lower, FAQ_KEYWORDS[language])) {
    return "faq";
  }

  return "unknown";
}
