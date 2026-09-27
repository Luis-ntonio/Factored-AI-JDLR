import type { LanguageCode } from "@banking-agent/shared";

/** Etiquetas legibles (ES/PT) para keys crudas de `Entities`/campos de negocio.
 * Usadas para nunca mostrar keys crudas tipo `requested_amount` al usuario. */
export const ENTITY_LABELS: Record<LanguageCode, Record<string, string>> = {
  es: {
    income: "Ingreso mensual",
    employment_status: "Situación laboral",
    requested_amount: "Monto solicitado",
    document_id: "Documento de identidad",
    document_type: "Tipo de documento",
    product_type: "Producto",
    existing_customer: "Cliente existente",
  },
  pt: {
    income: "Renda mensal",
    employment_status: "Situação profissional",
    requested_amount: "Valor solicitado",
    document_id: "Documento de identidade",
    document_type: "Tipo de documento",
    product_type: "Produto",
    existing_customer: "Cliente atual",
  },
};

export const PRODUCT_TYPE_LABELS: Record<LanguageCode, Record<string, string>> = {
  es: {
    personal_loan: "Préstamo personal",
    credit_card: "Tarjeta de crédito",
    auto_loan: "Crédito vehicular",
    mortgage: "Crédito hipotecario",
    unknown: "Producto no identificado",
  },
  pt: {
    personal_loan: "Empréstimo pessoal",
    credit_card: "Cartão de crédito",
    auto_loan: "Financiamento de veículo",
    mortgage: "Financiamento imobiliário",
    unknown: "Produto não identificado",
  },
};

export const EMPLOYMENT_STATUS_LABELS: Record<LanguageCode, Record<string, string>> = {
  es: {
    employed: "Empleado/a",
    self_employed: "Independiente",
    unemployed: "Desempleado/a",
    retired: "Jubilado/a",
    student: "Estudiante",
    unknown: "No especificado",
  },
  pt: {
    employed: "Empregado(a)",
    self_employed: "Autônomo(a)",
    unemployed: "Desempregado(a)",
    retired: "Aposentado(a)",
    student: "Estudante",
    unknown: "Não especificado",
  },
};

export const SCORE_ZONE_LABELS: Record<LanguageCode, Record<string, string>> = {
  es: {
    approved: "Aprobado",
    borderline: "En revisión (límite)",
    declined: "Rechazado",
  },
  pt: {
    approved: "Aprovado",
    borderline: "Em análise (limite)",
    declined: "Recusado",
  },
};

export function formatEntityValue(key: string, value: unknown, language: LanguageCode): string {
  if (value === null || value === undefined) return language === "pt" ? "Não especificado" : "No especificado";
  if (key === "product_type" && typeof value === "string") return PRODUCT_TYPE_LABELS[language][value] ?? value;
  if (key === "employment_status" && typeof value === "string") return EMPLOYMENT_STATUS_LABELS[language][value] ?? value;
  if (key === "existing_customer") return value ? (language === "pt" ? "Sim" : "Sí") : (language === "pt" ? "Não" : "No");
  return String(value);
}
