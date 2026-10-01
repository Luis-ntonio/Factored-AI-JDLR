import type { LanguageCode } from "@banking-agent/shared";

/**
 * Catálogo FIJO de objetivos del simulador -- 4, para mantener el alcance
 * chico. Cada uno trae un mensaje semilla REAL (basado en datos reales del
 * seed mock, `services/transaction-agent/src/data/mock-core-banking.ts`,
 * para que el flujo real del pipeline se dispare de verdad, no solo texto
 * inventado) y el `expectedStatus` final contra el que se compara
 * ESTRUCTURALMENTE el resultado (nunca otro LLM opinando -- ver
 * `run-simulation.ts`).
 *
 * `dispute-ambiguous` usa el monto $219 de María (CUST-0001): el seed mock
 * tiene DOS transacciones distintas por ese mismo monto (Netflix y Disney
 * Plus, services/transaction-agent/src/data/mock-core-banking.ts) -- buen
 * disparador real de `dispute_candidate_selection`. No es una garantía (el
 * matcher real decide), por eso el simulador maneja genéricamente tanto el
 * caso con `ambiguousCandidates` como sin ellas.
 *
 * `escalation-high-amount` usa a Julieta (CUST-0003, segmento "Basic" ->
 * rol "cliente", `policies.yaml` `dispute_high_risk_amount_threshold:
 * 15000`) disputando el cargo real de $18000 en YPF -- por encima del
 * umbral, dispara `escalate-dispute-amount-over-threshold` de forma
 * determinística.
 */
export interface SimulationObjective {
  id: string;
  label: string;
  /** Usado en el prompt del simulador de usuario -- explica qué está
   * tratando de lograr este "cliente" sintético. */
  description: string;
  seedMessage: Record<LanguageCode, string>;
  expectedStatus: "ok" | "clarify" | "escalate" | "unavailable";
}

export const SIMULATION_OBJECTIVES: readonly SimulationObjective[] = [
  {
    id: "dispute-ambiguous",
    label: "Disputa con comercio ambiguo",
    description:
      "Disputar un cargo de $219 cuyo comercio exacto no recordás con certeza (puede ser una suscripción de streaming). Si el sistema te ofrece varias transacciones candidatas, elegí la que mejor coincida con tu reclamo original.",
    seedMessage: {
      es: "Hola, veo un cargo de $219 en mi tarjeta que no reconozco, no estoy segura de qué comercio fue exactamente.",
      pt: "Olá, vejo uma cobrança de $219 no meu cartão que não reconheço, não tenho certeza de qual foi o comerciante exato.",
    },
    expectedStatus: "ok",
  },
  {
    id: "eligibility-missing-data",
    label: "Elegibilidad con datos incompletos",
    description:
      "Preguntar si calificás para un préstamo personal, sin dar todos los datos de entrada. Cuando el bot te pida un dato (ingreso, situación laboral, monto solicitado), respondé con un valor realista coherente con tu perfil.",
    seedMessage: {
      es: "Quiero saber si califico para un préstamo personal.",
      pt: "Quero saber se eu me qualifico para um empréstimo pessoal.",
    },
    expectedStatus: "ok",
  },
  {
    id: "escalation-high-amount",
    label: "Disputa de monto alto (escalación esperada)",
    description:
      "Disputar un cargo de monto alto ($18000) en YPF, por encima del umbral de riesgo configurado -- se espera que el sistema escale a un humano, no que lo resuelva automáticamente.",
    seedMessage: {
      es: "No reconozco un cargo de $18000 en YPF, necesito ayuda para disputarlo.",
      pt: "Não reconheço uma cobrança de $18000 na YPF, preciso de ajuda para contestá-la.",
    },
    expectedStatus: "escalate",
  },
  {
    id: "product-info-quick",
    label: "Consulta simple de producto",
    description:
      "Hacer una pregunta simple de información de producto (FAQ), sin ambigüedad -- se espera una respuesta directa en 1-2 turnos.",
    seedMessage: {
      es: "¿Qué documentos necesito para solicitar una tarjeta de crédito?",
      pt: "Quais documentos eu preciso para solicitar um cartão de crédito?",
    },
    expectedStatus: "ok",
  },
];

export function findSimulationObjective(id: string): SimulationObjective | undefined {
  return SIMULATION_OBJECTIVES.find((o) => o.id === id);
}
