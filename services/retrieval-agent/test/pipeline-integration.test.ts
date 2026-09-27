import { describe, expect, it, beforeAll } from "vitest";
import * as path from "node:path";
import type { UnderstandOutput } from "@banking-agent/shared";
import { emptyEntities } from "@banking-agent/shared";
// Importa deliberadamente el paquete COMPILADO de policy-agent (resuelto vía
// el symlink de npm workspaces en node_modules -> services/policy-agent/dist),
// no su código fuente — ver vitest.config.ts de este servicio para la
// explicación de por qué NO se alía a src acá (a diferencia de
// @banking-agent/shared). Por eso `npm run build` debe correr ANTES que
// `npm test` a nivel monorepo (ver package.json raíz y README.md).
import { loadPolicyFile, evaluatePreAction } from "@banking-agent/policy-agent";
import type { PolicyFile } from "@banking-agent/policy-agent";
import { handleRetrieval } from "../src/handle-retrieval";
import { StaticCatalogRepository } from "../src/repository/static-catalog-repository";

/**
 * Test de integración REAL: conversation-agent (fixture manual, mismo estilo
 * que `services/policy-agent/src/evaluator.test.ts`) -> policy-agent
 * (`evaluatePreAction` sobre `policies.yaml` real) -> retrieval-agent
 * (`handleRetrieval`).
 *
 * LIMITACIÓN DOCUMENTADA (ver también README.md de este servicio): en este
 * checkpoint NO existe todavía un orquestador real (Step Functions u otro,
 * pendiente de decidir en docs/PLAN.md) que conecte los tres Lambdas en
 * producción y que IMPIDA en runtime invocar retrieval-agent si
 * `evaluatePreAction` no devolvió "AUTO". La garantía de "no llamar a
 * retrieval-agent salvo AUTO" hoy es un contrato PROBADO POR ESTE TEST, no
 * algo forzado por infraestructura.
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

describe("pipeline de integración: conversation-agent (fixture) -> policy-agent -> retrieval-agent", () => {
  let policy: PolicyFile;
  const repo = new StaticCatalogRepository();

  beforeAll(() => {
    policy = loadPolicyFile(POLICY_PATH);
  });

  it("product_info completo -> policy-agent AUTO -> retrieval-agent devuelve el ProductCatalogEntry correcto", async () => {
    const input: UnderstandOutput = {
      intent: "product_info",
      language: "es",
      entities: { ...emptyEntities(), product_type: "personal_loan" },
      missing_fields: [],
      context: baseContext(),
    };

    const decision = evaluatePreAction(input, policy);
    expect(decision.decision).toBe("AUTO");
    expect(decision.winningRuleId).toBe("auto-product-info-complete");

    const result = await handleRetrieval(input, repo);

    expect(result.found).toBe(true);
    expect(result.product?.productType).toBe("personal_loan");
    expect(result.product?.source).toBeTruthy();
  });

  it("faq -> policy-agent AUTO (auto-faq-always) -> retrieval-agent devuelve al menos una FaqEntry", async () => {
    const input: UnderstandOutput = {
      intent: "faq",
      language: "pt",
      entities: emptyEntities(),
      missing_fields: [],
      context: baseContext(),
    };

    const decision = evaluatePreAction(input, policy);
    expect(decision.decision).toBe("AUTO");
    expect(decision.winningRuleId).toBe("auto-faq-always");

    const result = await handleRetrieval(input, repo);

    expect(result.found).toBe(true);
    expect(result.faqs && result.faqs.length).toBeGreaterThan(0);
  });

  it("product_info con product_type faltante -> policy-agent CLARIFY (NUNCA debería llamarse a retrieval-agent en este caso)", () => {
    const input: UnderstandOutput = {
      intent: "product_info",
      language: "es",
      entities: emptyEntities(),
      missing_fields: ["product_type"],
      context: baseContext(),
    };

    const decision = evaluatePreAction(input, policy);

    expect(decision.decision).toBe("CLARIFY");
    expect(decision.winningRuleId).toBe("clarify-product-info-incomplete");
    expect(decision.askField).toBe("product_type");

    // NOTA: no se llama a `handleRetrieval` acá a propósito — este test
    // documenta el contrato "solo AUTO habilita retrieval-agent". Hoy ese
    // contrato es exigido por TEST (esta aserción), no por un orquestador de
    // infraestructura real que bloquee la invocación (ver limitación en el
    // docstring de este archivo y en README.md, "Sin orquestador real").
    // Si igualmente se invocara `handleRetrieval` con este input (bug de
    // orquestación), no crashearía ni inventaría un producto (ver
    // `handle-retrieval.test.ts`, caso "product_type null") — pero SIGUE
    // siendo responsabilidad del futuro orquestador no dejar pasar este caso.
  });
});
