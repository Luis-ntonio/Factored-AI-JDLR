import { emptyEntities, type UnderstandOutput } from "@banking-agent/shared";

/** Fixture base reutilizable de `UnderstandOutput`, mismo patrón que otros
 * services/*\/test para no repetir el boilerplate de `context` en cada test. */
export function makeUnderstand(overrides: Partial<UnderstandOutput> = {}): UnderstandOutput {
  return {
    intent: "eligibility_check",
    language: "es",
    entities: emptyEntities(),
    missing_fields: [],
    context: {
      caseId: "case-123",
      customerId: "customer-456",
      turnId: "turn-1",
      degraded: false,
      degradedReason: "none",
      historyTurns: 1,
    },
    ...overrides,
  };
}
