import type { Entities, Intent, LanguageCode, ProductType } from "@banking-agent/shared";

/**
 * `userRequestSummary` — narrativa humana corta (1 oración) derivada de
 * `intent` + las `Entities` no sensibles ya conocidas. Texto generado por
 * reglas/templates determinísticos, bifurcados por `language`
 * (`Record<LanguageCode, ...>`, mismo patrón que
 * `services/conversation-agent/src/router/entity-extractor.ts`). El
 * portugués NO es una traducción mecánica palabra por palabra -- está
 * redactado como portugués brasileño natural, mismo criterio de
 * terminología que `services/retrieval-agent/src/data/catalog.ts` (ej.
 * "empréstimo" vs "financiamento" según el producto).
 *
 * NUNCA interpola `entities.document_id` -- esta función ni siquiera recibe
 * ese campo (recibe `Entities` completo por conveniencia de tipado, pero
 * deliberadamente no lo lee). Esto vale para AMBOS idiomas.
 */
export function buildUserRequestSummary(intent: Intent, entities: Entities, language: LanguageCode): string {
  const product = describeProduct(entities.product_type, language);

  switch (intent) {
    case "eligibility_check": {
      if (language === "pt") {
        const amount =
          typeof entities.requested_amount === "number" ? ` no valor de ${entities.requested_amount}` : "";
        return `O usuário pediu para avaliar a elegibilidade para ${product}${amount}.`;
      }
      const amount =
        typeof entities.requested_amount === "number" ? ` de ${entities.requested_amount}` : "";
      return `El usuario pidió evaluar elegibilidad para ${product}${amount}.`;
    }
    case "dispute_unrecognized_charge": {
      const merchant = typeof entities.merchant === "string" && entities.merchant.trim() !== "" ? entities.merchant.trim() : null;
      const amount = typeof entities.disputed_amount === "number" ? entities.disputed_amount : null;
      if (language === "pt") {
        if (merchant && amount !== null) {
          return `O usuário reportou uma cobrança que não reconhece em ${merchant}, no valor de ${amount}.`;
        }
        if (merchant) {
          return `O usuário reportou uma cobrança que não reconhece em ${merchant}.`;
        }
        if (amount !== null) {
          return `O usuário reportou uma cobrança que não reconhece, no valor de ${amount}.`;
        }
        return "O usuário reportou uma cobrança não reconhecida ou indevida na sua conta/cartão.";
      }
      if (merchant && amount !== null) {
        return `El usuario reportó un cargo que no reconoce en ${merchant} por un monto de ${amount}.`;
      }
      if (merchant) {
        return `El usuario reportó un cargo que no reconoce en ${merchant}.`;
      }
      if (amount !== null) {
        return `El usuario reportó un cargo que no reconoce por un monto de ${amount}.`;
      }
      return "El usuario reportó un cargo no reconocido o indebido en su cuenta/tarjeta.";
    }
    case "product_info": {
      if (language === "pt") {
        return `O usuário perguntou sobre informações/condições de ${product}.`;
      }
      return `El usuario preguntó por información/condiciones de ${product}.`;
    }
    case "faq":
      return language === "pt"
        ? "O usuário fez uma pergunta geral (FAQ) sobre o fluxo de crédito, não específica do catálogo."
        : "El usuario hizo una consulta general (FAQ) sobre el flujo de crédito, no específica de catálogo.";
    case "escalation_request":
      return language === "pt"
        ? "O usuário pediu explicitamente para falar com um humano/atendente."
        : "El usuario pidió explícitamente hablar con un humano/representante.";
    case "unknown":
    default:
      return language === "pt"
        ? "Não foi possível classificar com segurança a intenção do usuário neste turno (intent = unknown)."
        : "No se pudo clasificar con certeza la intención del usuario en este turno (intent = unknown).";
  }
}

const PRODUCT_DESCRIPTIONS: Record<LanguageCode, Record<ProductType | "default", string>> = {
  es: {
    personal_loan: "un préstamo personal",
    credit_card: "una tarjeta de crédito",
    auto_loan: "un préstamo automotor",
    mortgage: "un préstamo hipotecario",
    unknown: "un producto de crédito (tipo aún no especificado)",
    default: "un producto de crédito (tipo aún no especificado)",
  },
  pt: {
    personal_loan: "um empréstimo pessoal",
    credit_card: "um cartão de crédito",
    auto_loan: "um financiamento de veículo",
    mortgage: "um financiamento imobiliário",
    unknown: "um produto de crédito (tipo ainda não especificado)",
    default: "um produto de crédito (tipo ainda não especificado)",
  },
};

function describeProduct(productType: ProductType | null | undefined, language: LanguageCode): string {
  const byLanguage = PRODUCT_DESCRIPTIONS[language];
  if (productType && productType in byLanguage) {
    return byLanguage[productType as ProductType];
  }
  return byLanguage.default;
}
