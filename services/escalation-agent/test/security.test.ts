import { describe, expect, it } from "vitest";
import { emptyEntities } from "@banking-agent/shared";
import { buildEscalationSummary } from "../src/build-summary";
import { handler } from "../src/handler";
import { makeUnderstand } from "./fixtures";

/**
 * Test de seguridad EXPLÍCITO (no negociable, ver
 * `policies.yaml` sección `security`, regla `sec-masked-identifier-for-escalation`
 * y docstring de cabecera de
 * `packages/shared/src/contracts/escalation-summary.ts`): el valor crudo de
 * `entities.document_id` NUNCA debe aparecer en ningún valor de texto del
 * `EscalationSummary` resultante, sin importar el `origin` ni qué otros
 * campos (reason/askField) vengan de policy-agent/verification-agent.
 */

const RAW_DOCUMENT_ID = "12345678900";

function assertNeverLeaksRawDocumentId(summary: unknown): void {
  const serialized = JSON.stringify(summary);
  expect(serialized).not.toContain(RAW_DOCUMENT_ID);
}

describe("Security — entities.document_id crudo nunca se filtra", () => {
  it("origin: policy_decision — no se filtra en ningún campo, maskedDocumentId reconocible", () => {
    const understand = makeUnderstand({
      intent: "eligibility_check",
      entities: { ...emptyEntities(), document_id: RAW_DOCUMENT_ID, document_type: "DNI" },
    });
    const summary = buildEscalationSummary({
      origin: "policy_decision",
      understand,
      policyDecision: {
        decision: "ESCALATE",
        matchedRules: [{ id: "escalate-eligibility-amount-over-threshold", decision: "ESCALATE" }],
        winningRuleId: "escalate-eligibility-amount-over-threshold",
        reason: "El monto solicitado supera el umbral configurable de riesgo.",
        askField: "document_type",
      },
    });

    assertNeverLeaksRawDocumentId(summary);
    expect(summary.maskedDocumentId).toBe("*******8900");
    expect(summary.maskedDocumentId?.endsWith("8900")).toBe(true);
    // knownEntities nunca incluye document_id -- ni siquiera la key existe.
    expect(summary.knownEntities).not.toHaveProperty("document_id");
  });

  it("origin: verification_failed — no se filtra en ningún campo, incluso si 'reason' del verification-agent lo mencionara por error", () => {
    const understand = makeUnderstand({
      intent: "eligibility_check",
      entities: { ...emptyEntities(), document_id: RAW_DOCUMENT_ID },
    });
    const summary = buildEscalationSummary({
      origin: "verification_failed",
      understand,
      attemptedAction: {
        intent: "eligibility_check",
        verification: {
          status: "pending_confirmation",
          verified: false,
          // Caso adversarial deliberado: un `reason` mal formado que SÍ
          // incluyera el valor crudo (nunca debería ocurrir según el
          // contrato de verification-agent, pero se prueba la red de
          // seguridad de todos modos -- ver src/mask.ts, redactRawDocumentId).
          reason: `zona de score no coincide para el documento ${RAW_DOCUMENT_ID}`,
          data: { caseId: "case-123", productType: "personal_loan", eligibility_score: 60, score_zone: "approved" },
        },
      },
    });

    assertNeverLeaksRawDocumentId(summary);
    expect(summary.maskedDocumentId).toBe("*******8900");
    expect(summary.unresolvedReason).not.toContain(RAW_DOCUMENT_ID);
    expect(summary.unresolvedReason).toContain("*******8900");
  });

  it("origin: post_action_decision — no se filtra en ningún campo, incluso si 'reason' de policy-agent (post_action) lo mencionara por error", () => {
    const understand = makeUnderstand({
      intent: "eligibility_check",
      entities: { ...emptyEntities(), document_id: RAW_DOCUMENT_ID },
    });
    const summary = buildEscalationSummary({
      origin: "post_action_decision",
      understand,
      policyDecision: {
        decision: "ESCALATE",
        matchedRules: [{ id: "escalate-score-borderline", decision: "ESCALATE" }],
        winningRuleId: "escalate-score-borderline",
        // Caso adversarial deliberado, mismo patrón que el bloque de arriba
        // para `verification_failed`: un `reason` mal formado que SÍ
        // incluyera el valor crudo (nunca debería ocurrir según el contrato
        // de policy-agent, `sec-no-raw-pii-in-reason`, pero se prueba la red
        // de seguridad de todos modos).
        reason: `score en zona límite para el documento ${RAW_DOCUMENT_ID}`,
      },
    });

    assertNeverLeaksRawDocumentId(summary);
    expect(summary.maskedDocumentId).toBe("*******8900");
    expect(summary.unresolvedReason).not.toContain(RAW_DOCUMENT_ID);
    expect(summary.unresolvedReason).toContain("*******8900");
  });

  it("a través del handler completo (Task-a-Task) tampoco se filtra", async () => {
    const understand = makeUnderstand({
      intent: "eligibility_check",
      entities: { ...emptyEntities(), document_id: RAW_DOCUMENT_ID },
    });
    const result = await handler({ origin: "policy_decision", understand });
    assertNeverLeaksRawDocumentId(result);
    expect(result.maskedDocumentId).toBe("*******8900");
  });

  it("input malformado con document_id crudo suelto en el evento -> tampoco se filtra (fallback)", async () => {
    const result = await handler({ origin: "policy_decision", entities: { document_id: RAW_DOCUMENT_ID } });
    assertNeverLeaksRawDocumentId(result);
    expect(result.maskedDocumentId).toBe("*******8900");
  });
});
