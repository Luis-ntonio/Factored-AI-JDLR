import { describe, expect, it, beforeAll } from "vitest";
import * as path from "node:path";
import type { UnderstandOutput } from "@banking-agent/shared";
import { emptyEntities } from "@banking-agent/shared";
// Importa deliberadamente el paquete COMPILADO de policy-agent (resuelto vía
// el symlink de npm workspaces en node_modules -> services/policy-agent/dist),
// no su código fuente -- ver vitest.config.ts de este servicio (mismo
// criterio que services/retrieval-agent/test/pipeline-integration.test.ts).
// Por eso `npm run build` debe correr ANTES que `npm test` a nivel monorepo.
import { loadPolicyFile, evaluatePreAction, evaluatePostAction } from "@banking-agent/policy-agent";
import type { PolicyFile } from "@banking-agent/policy-agent";
import { computeEligibility } from "../src/compute-eligibility";
import { loadBorderlineThresholds } from "../src/config/load-thresholds";
import { InMemoryEligibilityStore } from "../src/store/in-memory-eligibility-store";

/**
 * Test de integración REAL: conversation-agent (fixture manual) ->
 * policy-agent (`evaluatePreAction`, `policies.yaml` real) ->
 * transaction-agent (`computeEligibility`) -> policy-agent
 * (`evaluatePostAction`).
 *
 * LIMITACIÓN DOCUMENTADA (mismo disclaimer que
 * `services/retrieval-agent/test/pipeline-integration.test.ts`): en este
 * checkpoint NO existe todavía un orquestador real (Step Functions u otro,
 * pendiente de decidir en docs/PLAN.md) que conecte los Lambdas en
 * producción y que IMPIDA en runtime invocar transaction-agent si
 * `evaluatePreAction` no devolvió "AUTO". La garantía "solo AUTO invoca
 * transaction-agent" hoy es un contrato PROBADO POR ESTE TEST, no algo
 * forzado por infraestructura.
 */

const POLICY_PATH = path.resolve(__dirname, "../../../policies.yaml");

function baseContext(overrides: Partial<UnderstandOutput["context"]> = {}): UnderstandOutput["context"] {
  return {
    caseId: "case-int-1",
    customerId: null,
    turnId: "turn-int-1",
    degraded: false,
    degradedReason: "none",
    historyTurns: 0,
    ...overrides,
  };
}

describe("pipeline de integración: conversation-agent (fixture) -> policy-agent (pre_action) -> transaction-agent -> policy-agent (post_action)", () => {
  let policy: PolicyFile;
  let thresholds: { min: number; max: number };

  beforeAll(() => {
    policy = loadPolicyFile(POLICY_PATH);
    thresholds = loadBorderlineThresholds(POLICY_PATH);
  });

  it("score en zona 'approved' -> policy-agent pre_action AUTO, post_action AUTO (auto-score-approved)", async () => {
    // Cálculo esperado (ver src/scoring/compute-score.ts):
    // base 50 + employed(+20) + ratio 8000/5000=1.6<=2(+20) + existing(+10)
    // + amount<=30000(0) = 100 -> > max(70) -> "approved"
    const store = new InMemoryEligibilityStore();
    const input: UnderstandOutput = {
      intent: "eligibility_check",
      language: "es",
      entities: {
        ...emptyEntities(),
        product_type: "personal_loan",
        income: 5000,
        employment_status: "employed",
        requested_amount: 8000,
        document_id: "12345678",
        document_type: "DNI",
        existing_customer: true,
      },
      missing_fields: [],
      context: baseContext({ caseId: "case-approved", turnId: "turn-approved" }),
    };

    const preDecision = evaluatePreAction(input, policy);
    expect(preDecision.decision).toBe("AUTO");
    expect(preDecision.winningRuleId).toBe("auto-eligibility-complete");

    const eligibilityResult = await computeEligibility(
      {
        caseId: input.context.caseId,
        turnId: input.context.turnId,
        productType: input.entities.product_type!,
        entities: input.entities,
      },
      { store, thresholds }
    );

    expect(eligibilityResult.eligibility_score).toBe(100);
    expect(eligibilityResult.score_zone).toBe("approved");

    const postDecision = evaluatePostAction(eligibilityResult, policy);
    expect(postDecision.decision).toBe("AUTO");
    expect(postDecision.winningRuleId).toBe("auto-score-approved");
  });

  it("score en zona 'borderline' -> policy-agent pre_action AUTO, post_action ESCALATE (escalate-score-borderline)", async () => {
    // Cálculo esperado:
    // base 50 + student(-10) + ratio 8000/5000=1.6<=2(+20) + existing false(0)
    // + amount<=30000(0) = 60 -> dentro de [min=55, max=70] -> "borderline"
    const store = new InMemoryEligibilityStore();
    const input: UnderstandOutput = {
      intent: "eligibility_check",
      language: "es",
      entities: {
        ...emptyEntities(),
        product_type: "credit_card",
        income: 5000,
        employment_status: "student",
        requested_amount: 8000,
        document_id: "87654321",
        document_type: "DNI",
        existing_customer: false,
      },
      missing_fields: [],
      context: baseContext({ caseId: "case-borderline", turnId: "turn-borderline" }),
    };

    const preDecision = evaluatePreAction(input, policy);
    expect(preDecision.decision).toBe("AUTO");
    expect(preDecision.winningRuleId).toBe("auto-eligibility-complete");

    const eligibilityResult = await computeEligibility(
      {
        caseId: input.context.caseId,
        turnId: input.context.turnId,
        productType: input.entities.product_type!,
        entities: input.entities,
      },
      { store, thresholds }
    );

    expect(eligibilityResult.eligibility_score).toBe(60);
    expect(eligibilityResult.score_zone).toBe("borderline");

    const postDecision = evaluatePostAction(eligibilityResult, policy);
    expect(postDecision.decision).toBe("ESCALATE");
    expect(postDecision.winningRuleId).toBe("escalate-score-borderline");
  });

  it("score en zona 'declined' -> policy-agent pre_action AUTO, post_action AUTO (auto-score-declined)", async () => {
    // Cálculo esperado:
    // base 50 + self_employed(+10) + ratio 10000/1000=10>6(-30) + existing false(0)
    // + amount<=30000(0) = 30 -> < min(55) -> "declined"
    const store = new InMemoryEligibilityStore();
    const input: UnderstandOutput = {
      intent: "eligibility_check",
      language: "pt",
      entities: {
        ...emptyEntities(),
        product_type: "auto_loan",
        income: 1000,
        employment_status: "self_employed",
        requested_amount: 10000,
        document_id: "11122233344",
        document_type: "CPF",
        existing_customer: false,
      },
      missing_fields: [],
      context: baseContext({ caseId: "case-declined", turnId: "turn-declined" }),
    };

    const preDecision = evaluatePreAction(input, policy);
    expect(preDecision.decision).toBe("AUTO");
    expect(preDecision.winningRuleId).toBe("auto-eligibility-complete");

    const eligibilityResult = await computeEligibility(
      {
        caseId: input.context.caseId,
        turnId: input.context.turnId,
        productType: input.entities.product_type!,
        entities: input.entities,
      },
      { store, thresholds }
    );

    expect(eligibilityResult.eligibility_score).toBe(30);
    expect(eligibilityResult.score_zone).toBe("declined");

    const postDecision = evaluatePostAction(eligibilityResult, policy);
    expect(postDecision.decision).toBe("AUTO");
    expect(postDecision.winningRuleId).toBe("auto-score-declined");
  });

  it("employment_status = unemployed -> policy-agent pre_action ESCALATE (transaction-agent NUNCA debería ser invocado)", () => {
    const input: UnderstandOutput = {
      intent: "eligibility_check",
      language: "es",
      entities: {
        ...emptyEntities(),
        product_type: "personal_loan",
        income: 500,
        employment_status: "unemployed",
        requested_amount: 1000,
        document_id: "99988877",
        document_type: "DNI",
        existing_customer: false,
      },
      missing_fields: [],
      context: baseContext({ caseId: "case-unemployed", turnId: "turn-unemployed" }),
    };

    const preDecision = evaluatePreAction(input, policy);
    expect(preDecision.decision).toBe("ESCALATE");
    expect(preDecision.winningRuleId).toBe("escalate-eligibility-unemployed");

    // NOTA: no se llama a `computeEligibility` acá a propósito -- este test
    // documenta el contrato "solo AUTO habilita transaction-agent". Hoy ese
    // contrato es exigido por TEST (esta aserción), no por un orquestador de
    // infraestructura real (mismo disclaimer que
    // services/retrieval-agent/test/pipeline-integration.test.ts). Si
    // igualmente se invocara `computeEligibility` con este input (bug de
    // orquestación), no crashearía ni fabricaría un score inventado -- solo
    // aplicaría la fórmula determinística de forma defensiva (ver
    // `compute-score.test.ts`, caso "unemployed (defensivo)") -- pero sigue
    // siendo responsabilidad del futuro orquestador no dejar pasar este caso.
  });
});
