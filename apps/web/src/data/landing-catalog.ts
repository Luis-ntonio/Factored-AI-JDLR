import type { ProductType } from "@banking-agent/shared";

/**
 * Espejo ESTÁTICO, solo para la vidriera de productos de la landing
 * (`ProductShowcase.tsx`), de `services/retrieval-agent/src/data/catalog.ts`
 * (`PRODUCT_CATALOG`, `SOURCE_ID: internal_catalog_v1`). No se importa
 * directo desde ahí porque retrieval-agent no está pensado como dependencia
 * de `apps/web` (es un servicio backend, no un paquete publicado) -- mismo
 * criterio que otras duplicaciones deliberadas y documentadas de este
 * repo (ej. `packages/shared` sí se comparte porque fue diseñado para eso,
 * esto no).
 *
 * MANTENER EN SINCRONÍA A MANO con el catálogo real si esos números
 * cambian -- estos valores son los mismos que ya le muestra el chat cuando
 * responde una consulta de `product_info`, así que un desvío acá sería una
 * promesa distinta en la landing vs. lo que el asistente termina diciendo.
 */
export interface LandingProduct {
  productType: ProductType;
  name: string;
  interestRateRange: { min: number; max: number };
  amountRange: { min: number; max: number };
  minIncome: number;
  /** Mensaje que se manda al chat al hacer click en "Lo quiero" -- incluye
   * a propósito una frase de las ELIGIBILITY_KEYWORDS del router
   * (`services/conversation-agent/src/router/intent-router.ts`, "califico")
   * para que el turno clasifique como `eligibility_check` desde el primer
   * mensaje, no como `product_info`. */
  ctaMessage: string;
}

export const LANDING_PRODUCTS: readonly LandingProduct[] = [
  {
    productType: "personal_loan",
    name: "Préstamo personal",
    interestRateRange: { min: 18, max: 36 },
    amountRange: { min: 500, max: 20000 },
    minIncome: 800,
    ctaMessage: "Quiero saber si califico para un préstamo personal",
  },
  {
    productType: "credit_card",
    name: "Tarjeta de crédito",
    interestRateRange: { min: 35, max: 55 },
    amountRange: { min: 300, max: 15000 },
    minIncome: 500,
    ctaMessage: "Quiero saber si califico para una tarjeta de crédito",
  },
  {
    productType: "auto_loan",
    name: "Crédito vehicular",
    interestRateRange: { min: 12, max: 24 },
    amountRange: { min: 3000, max: 60000 },
    minIncome: 700,
    ctaMessage: "Quiero saber si califico para un crédito vehicular",
  },
  {
    productType: "mortgage",
    name: "Crédito hipotecario",
    interestRateRange: { min: 8, max: 14 },
    amountRange: { min: 20000, max: 300000 },
    minIncome: 1500,
    ctaMessage: "Quiero saber si califico para un crédito hipotecario",
  },
];
