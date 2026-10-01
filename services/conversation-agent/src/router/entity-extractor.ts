import {
  DisputeReason,
  DocumentType,
  EmploymentStatus,
  Entities,
  LanguageCode,
  ProductType,
  emptyEntities,
} from "@banking-agent/shared";

/**
 * Extracción de entities por heurística de keywords + regex (sin NLP/LLM
 * externo — deliberado para el scope de 10 días, ver docs/CONTRACTS.md
 * "Limitaciones"). Devuelve SOLO lo detectado en ESTE mensaje (valores no
 * detectados quedan `null`); la fusión con el estado acumulado de turnos
 * anteriores la hace el context manager (`context/context-manager.ts`), no
 * esta función.
 */

const NUMBER_PATTERN = /\d[\d.,]*\d|\d/g;

/** Convierte "2.500", "2,500", "2500" -> 2500. Simplificación: no maneja decimales
 * (se asume moneda entera) — ver limitación documentada. */
function parseAmount(raw: string): number {
  const digitsOnly = raw.replace(/[.,]/g, "");
  return parseInt(digitsOnly, 10);
}

function findAmountNear(text: string, keywords: string[]): number | null {
  const lower = text.toLowerCase();
  for (const kw of keywords) {
    const idx = lower.indexOf(kw);
    if (idx === -1) continue;
    // Ventana de ~40 caracteres después del keyword para buscar el número.
    const window = text.slice(idx, idx + kw.length + 40);
    const matches = window.match(NUMBER_PATTERN);
    if (matches && matches.length > 0) {
      const value = parseAmount(matches[0]);
      if (!Number.isNaN(value)) return value;
    }
  }
  return null;
}

function includesAny(lower: string, phrases: string[]): boolean {
  return phrases.some((p) => lower.includes(p));
}

/**
 * Extrae texto libre (no un número) en una ventana corta después de un
 * keyword — mismo patrón de "ventana" que `findAmountNear`, pero cortando en
 * el primer signo de puntuación de cierre de frase en vez de buscar dígitos.
 * Best-effort deliberado (ver `merchant` en el contrato): no valida contra
 * ningún catálogo de comercios, solo captura lo que el usuario escribió.
 */
function findTextNear(text: string, keywords: string[]): string | null {
  const lower = text.toLowerCase();
  for (const kw of keywords) {
    const idx = lower.indexOf(kw);
    if (idx === -1) continue;
    const start = idx + kw.length;
    const window = text.slice(start, start + 40);
    const match = window.match(/^[\s:]*([^.,;!?\n]+)/);
    const captured = match?.[1]?.trim();
    if (captured) return captured;
  }
  return null;
}

function findFirstMatch(text: string, patterns: RegExp[]): string | null {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[0];
  }
  return null;
}

const INCOME_KEYWORDS: Record<LanguageCode, string[]> = {
  es: ["gano", "ingreso mensual", "ingresos", "ingreso", "sueldo", "salario"],
  pt: ["ganho", "renda mensal", "renda", "salário", "salario", "recebo"],
};

const REQUESTED_AMOUNT_KEYWORDS: Record<LanguageCode, string[]> = {
  es: ["quiero", "necesito", "solicito", "préstamo de", "prestamo de", "monto de", "crédito de", "credito de"],
  pt: ["quero", "preciso", "solicito", "empréstimo de", "emprestimo de", "valor de", "crédito de", "credito de"],
};

const EMPLOYMENT_KEYWORDS: Record<LanguageCode, Array<[EmploymentStatus, string[]]>> = {
  es: [
    ["unemployed", ["desempleado", "sin trabajo", "no trabajo", "no tengo trabajo"]],
    ["retired", ["jubilado", "pensionado"]],
    ["student", ["estudiante"]],
    ["self_employed", ["independiente", "freelance", "cuenta propia", "negocio propio"]],
    ["employed", ["empleado", "trabajo en", "asalariado", "tengo trabajo"]],
  ],
  pt: [
    ["unemployed", ["desempregado", "sem trabalho", "não trabalho", "nao trabalho"]],
    ["retired", ["aposentado"]],
    ["student", ["estudante"]],
    ["self_employed", ["autônomo", "autonomo", "freelancer", "negócio próprio", "negocio proprio"]],
    ["employed", ["empregado", "trabalho na", "trabalho em", "assalariado", "tenho trabalho"]],
  ],
};

const PRODUCT_KEYWORDS: Record<LanguageCode, Array<[ProductType, string[]]>> = {
  es: [
    ["mortgage", ["crédito hipotecario", "credito hipotecario", "hipoteca"]],
    ["auto_loan", ["crédito vehicular", "credito vehicular", "préstamo para auto", "prestamo para auto", "crédito de auto", "credito de auto"]],
    ["credit_card", ["tarjeta de crédito", "tarjeta de credito", "tarjeta"]],
    ["personal_loan", ["préstamo personal", "prestamo personal", "préstamo", "prestamo"]],
  ],
  pt: [
    ["mortgage", ["crédito imobiliário", "credito imobiliario", "financiamento imobiliário", "financiamento imobiliario"]],
    ["auto_loan", ["crédito veicular", "credito veicular", "financiamento de veículo", "financiamento de veiculo"]],
    ["credit_card", ["cartão de crédito", "cartao de credito", "cartão", "cartao"]],
    ["personal_loan", ["empréstimo pessoal", "emprestimo pessoal", "empréstimo", "emprestimo"]],
  ],
};

const DISPUTED_AMOUNT_KEYWORDS: Record<LanguageCode, string[]> = {
  es: ["cargo de", "cobro de", "compra de", "me cobraron", "cobrando"],
  pt: ["cobrança de", "cobranca de", "compra de", "me cobraram", "cobrando"],
};

// Deliberadamente sin un catch-all genérico tipo "en "/"em " — capturaría
// texto irrelevante en cualquier mensaje que use esa preposición (ej. "vivo
// en Lima"). Solo keywords específicas de contexto comercial/de cargo.
const MERCHANT_KEYWORDS: Record<LanguageCode, string[]> = {
  es: ["en la tienda", "en el comercio", "en un comercio", "compra en", "cargo en", "cobro en", "comercio llamado", "comercio"],
  pt: ["na loja", "no comércio", "no comercio", "compra na", "compra no", "cobrança em", "cobranca em", "comércio chamado", "comercio chamado"],
};

// Deliberadamente MUY simple: frases relativas/explícitas comunes, NO un
// parser de fechas real (ver limitación documentada en docs/CONTRACTS.md:
// no resuelve "ayer" contra la fecha del turno, no maneja ambigüedad de mes/
// día por locale, no cubre todos los formatos de fecha posibles).
const TRANSACTION_DATE_PATTERNS: Record<LanguageCode, RegExp[]> = {
  es: [
    /\banteayer\b/i,
    /\bayer\b/i,
    /\bhoy\b/i,
    /\bla semana pasada\b/i,
    /\bel mes pasado\b/i,
    /\bel (lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)\b/i,
    /\bel d[ií]a \d{1,2}\b/i,
    /\bel \d{1,2} de (enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\b/i,
  ],
  pt: [
    /\banteontem\b/i,
    /\bontem\b/i,
    /\bhoje\b/i,
    /\bsemana passada\b/i,
    /\bm[eê]s passado\b/i,
    /\bna (segunda|ter[çc]a|quarta|quinta|sexta)(-feira)?\b/i,
    /\bno (s[aá]bado|domingo)\b/i,
    /\bo dia \d{1,2}\b/i,
    /\bdia \d{1,2} de (janeiro|fevereiro|mar[çc]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\b/i,
  ],
};

// Categorización por keyword. NUNCA se asigna "other" de este lado
// (deliberado — ver docstring de `DisputeReason` en @banking-agent/shared):
// si el mensaje no matchea ninguna de estas dos listas, el campo queda
// `null`, y una fase posterior decide si corresponde "other".
const DISPUTE_REASON_KEYWORDS: Record<LanguageCode, Array<[DisputeReason, string[]]>> = {
  es: [
    [
      "unrecognized_charge",
      [
        "no reconozco",
        "no hice esta compra",
        "no hice esa compra",
        "no hice esta transacción",
        "no hice esta transaccion",
        "cargo desconocido",
        "cobro desconocido",
        "cargo que no hice",
        "compra que no hice",
      ],
    ],
    [
      "duplicate_or_overcharge",
      ["cobro indebido", "cobro duplicado", "cargo duplicado", "me cobraron de más", "me cobraron de mas", "cobraron dos veces"],
    ],
  ],
  pt: [
    [
      "unrecognized_charge",
      [
        "não reconheço",
        "nao reconheco",
        "não fiz essa compra",
        "nao fiz essa compra",
        "não fiz esta compra",
        "nao fiz esta compra",
        "cobrança desconhecida",
        "cobranca desconhecida",
        "cobrança que eu não fiz",
        "cobranca que eu nao fiz",
      ],
    ],
    [
      "duplicate_or_overcharge",
      ["cobrança indevida", "cobranca indevida", "cobrança duplicada", "cobranca duplicada", "me cobraram a mais", "cobraram duas vezes"],
    ],
  ],
};

const EXISTING_CUSTOMER_TRUE: Record<LanguageCode, string[]> = {
  es: ["ya soy cliente", "soy cliente", "tengo cuenta con ustedes", "cliente actual"],
  pt: ["já sou cliente", "ja sou cliente", "sou cliente", "tenho conta com vocês", "tenho conta com voces"],
};

const EXISTING_CUSTOMER_FALSE: Record<LanguageCode, string[]> = {
  es: ["no soy cliente", "no tengo cuenta"],
  pt: ["não sou cliente", "nao sou cliente", "não tenho conta", "nao tenho conta"],
};

// CPF: 11 dígitos, formato típico 000.000.000-00. DNI (referencia Perú): 8 dígitos.
// CURP (México, 18 caracteres: 4 letras + 6 dígitos + 6 letras + 2 dígitos,
// ej. "LOTM900101MDFPRR09") -- encontrado como gap real por el simulador de
// conversaciones (docs/STATUS.md, fase "Simulador de conversaciones"): 2 de
// los 4 clientes mock (María/Roberto) tienen CURP como document_type real, y
// ningún patrón anterior lo reconocía -- un clarify pidiendo `document_id` a
// esos clientes no tenía ninguna respuesta de texto libre que lo completara.
// `DocumentType` (@banking-agent/shared) no tiene un valor "CURP" dedicado
// -- se clasifica como "other", mismo criterio ya usado acá para cédula CO.
// Heurística deliberadamente simple — ver limitación "Data limitations" en
// docs/CONTRACTS.md: no cubre todos los formatos de documento de LATAM.
const CPF_PATTERN = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/;
const CURP_PATTERN = /\b[A-Za-z]{4}\d{6}[A-Za-z]{6}\d{2}\b/;
const DNI_PATTERN = /\b\d{8}\b/;
// Grupo de dígitos permite separadores comunes (puntos/guiones/espacios,
// ej. "28.456.789" -- el otro gap real encontrado por el simulador: el
// patrón anterior exigía dígitos contiguos, y un DNI escrito con el
// separador de miles convencional nunca matcheaba) -- se normalizan
// (se les quitan) antes de validar longitud/usar el valor.
const DOCUMENT_LABEL_PATTERN = /\b(cpf|dni|cédula|cedula|documento|curp|c\.?c\.?)\D{0,10}(\d[\d.\- ]{3,13}\d)\b/i;

function extractDocument(text: string, language: LanguageCode): { id: string | null; type: DocumentType | null } {
  const cpfMatch = text.match(CPF_PATTERN);
  if (cpfMatch) {
    return { id: cpfMatch[0].replace(/[.\-]/g, ""), type: "CPF" };
  }

  const curpMatch = text.match(CURP_PATTERN);
  if (curpMatch) {
    return { id: curpMatch[0].toUpperCase(), type: "other" };
  }

  const labelMatch = text.match(DOCUMENT_LABEL_PATTERN);
  if (labelMatch) {
    const label = labelMatch[1].toLowerCase();
    const digits = labelMatch[2].replace(/[.\-\s]/g, "");
    if (digits.length >= 5 && digits.length <= 14) {
      if (label === "cpf") return { id: digits, type: "CPF" };
      if (label === "dni") return { id: digits, type: "DNI" };
      if (label === "curp") return { id: digits, type: "other" };
      if (label.startsWith("c")) return { id: digits, type: "CC" };
      return { id: digits, type: "other" };
    }
  }

  const dniMatch = text.match(DNI_PATTERN);
  if (dniMatch) {
    return { id: dniMatch[0], type: language === "pt" ? "other" : "DNI" };
  }

  return { id: null, type: null };
}

export function extractEntities(message: string, language: LanguageCode): Entities {
  const entities = emptyEntities();
  const lower = message.toLowerCase();

  entities.income = findAmountNear(message, INCOME_KEYWORDS[language]);
  entities.requested_amount = findAmountNear(message, REQUESTED_AMOUNT_KEYWORDS[language]);

  for (const [status, keywords] of EMPLOYMENT_KEYWORDS[language]) {
    if (includesAny(lower, keywords)) {
      entities.employment_status = status;
      break;
    }
  }

  for (const [product, keywords] of PRODUCT_KEYWORDS[language]) {
    if (includesAny(lower, keywords)) {
      entities.product_type = product;
      break;
    }
  }

  if (includesAny(lower, EXISTING_CUSTOMER_FALSE[language])) {
    entities.existing_customer = false;
  } else if (includesAny(lower, EXISTING_CUSTOMER_TRUE[language])) {
    entities.existing_customer = true;
  }

  const doc = extractDocument(message, language);
  entities.document_id = doc.id;
  entities.document_type = doc.type;

  entities.disputed_amount = findAmountNear(message, DISPUTED_AMOUNT_KEYWORDS[language]);
  entities.merchant = findTextNear(message, MERCHANT_KEYWORDS[language]);
  entities.transaction_date = findFirstMatch(message, TRANSACTION_DATE_PATTERNS[language]);

  for (const [reason, keywords] of DISPUTE_REASON_KEYWORDS[language]) {
    if (includesAny(lower, keywords)) {
      entities.dispute_reason = reason;
      break;
    }
  }

  return entities;
}
