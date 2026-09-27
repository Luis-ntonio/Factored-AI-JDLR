import {
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

const EXISTING_CUSTOMER_TRUE: Record<LanguageCode, string[]> = {
  es: ["ya soy cliente", "soy cliente", "tengo cuenta con ustedes", "cliente actual"],
  pt: ["já sou cliente", "ja sou cliente", "sou cliente", "tenho conta com vocês", "tenho conta com voces"],
};

const EXISTING_CUSTOMER_FALSE: Record<LanguageCode, string[]> = {
  es: ["no soy cliente", "no tengo cuenta"],
  pt: ["não sou cliente", "nao sou cliente", "não tenho conta", "nao tenho conta"],
};

// CPF: 11 dígitos, formato típico 000.000.000-00. DNI (referencia Perú): 8 dígitos.
// Heurística deliberadamente simple — ver limitación "Data limitations" en docs/CONTRACTS.md:
// no cubre todos los formatos de documento de LATAM (ej. cédula CO de 6-10 dígitos
// se clasifica como "other" por ambigüedad con DNI).
const CPF_PATTERN = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/;
const DNI_PATTERN = /\b\d{8}\b/;
const DOCUMENT_LABEL_PATTERN = /\b(cpf|dni|cédula|cedula|documento|c\.?c\.?)\D{0,10}(\d{5,14})\b/i;

function extractDocument(text: string, language: LanguageCode): { id: string | null; type: DocumentType | null } {
  const cpfMatch = text.match(CPF_PATTERN);
  if (cpfMatch) {
    return { id: cpfMatch[0].replace(/[.\-]/g, ""), type: "CPF" };
  }

  const labelMatch = text.match(DOCUMENT_LABEL_PATTERN);
  if (labelMatch) {
    const label = labelMatch[1].toLowerCase();
    const digits = labelMatch[2];
    if (label === "cpf") return { id: digits, type: "CPF" };
    if (label === "dni") return { id: digits, type: "DNI" };
    if (label.startsWith("c")) return { id: digits, type: "CC" };
    return { id: digits, type: "other" };
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

  return entities;
}
