import type { LanguageCode } from "@banking-agent/shared";

/**
 * Catálogo FIJO de perfiles del simulador -- los 4 clientes mock reales de
 * `@banking-agent/transaction-agent` (`CUSTOMERS`), cada uno con 2 variantes
 * de idioma. El idioma es una propiedad del MENSAJE, no del cliente (ver
 * `UnderstandOutput.language`, que se detecta por texto) -- "perfil pt" es
 * el mismo cliente mock escribiendo en portugués, no un cliente distinto.
 *
 * Deliberadamente hardcodeado acá (no leído de `mock-core-banking.ts` en
 * runtime) -- copiar los 3 campos de login (`document_id`/`first_name`/
 * `last_name`) más un par de datos informativos (segmento, ingreso,
 * ocupación) alcanza para que el simulador de usuario (`user-simulator.ts`)
 * responda de forma realista cuando el bot pide un dato; no hace falta
 * importar todo `mock-core-banking.ts` (que vive en otro servicio) acá.
 */
export interface SimulationProfile {
  id: string;
  label: string;
  languageCode: LanguageCode;
  documentId: string;
  firstName: string;
  lastName: string;
  segment: string;
  estimatedMonthlyIncome: number;
  occupation: string;
}

const BASE_PROFILES: ReadonlyArray<Omit<SimulationProfile, "id" | "label" | "languageCode">> = [
  {
    documentId: "LOTM900101MDFPRR09",
    firstName: "María Fernanda",
    lastName: "López Torres",
    segment: "Premium",
    estimatedMonthlyIncome: 45000,
    occupation: "Gerente de Proyecto",
  },
  {
    documentId: "1020304050",
    firstName: "Carlos Andrés",
    lastName: "Restrepo Gómez",
    segment: "Plus",
    estimatedMonthlyIncome: 6500000,
    occupation: "Ingeniero de Software",
  },
  {
    documentId: "34567890",
    firstName: "Julieta",
    lastName: "Fernández Acosta",
    segment: "Basic",
    estimatedMonthlyIncome: 850000,
    occupation: "Diseñadora Gráfica",
  },
  {
    documentId: "GORS980512HDFMNB03",
    firstName: "Roberto",
    lastName: "Gómez Sánchez",
    segment: "Student",
    estimatedMonthlyIncome: 12000,
    occupation: "Estudiante",
  },
];

const LANGUAGES: readonly LanguageCode[] = ["es", "pt"];

function slug(firstName: string, segment: string): string {
  return `${firstName.split(" ")[0].toLowerCase()}-${segment.toLowerCase()}`;
}

export const SIMULATION_PROFILES: readonly SimulationProfile[] = BASE_PROFILES.flatMap((base) =>
  LANGUAGES.map((languageCode) => ({
    ...base,
    id: `${slug(base.firstName, base.segment)}-${languageCode}`,
    label: `${base.firstName.split(" ")[0]} (${base.segment}, ${languageCode})`,
    languageCode,
  }))
);

export function findSimulationProfile(id: string): SimulationProfile | undefined {
  return SIMULATION_PROFILES.find((p) => p.id === id);
}
