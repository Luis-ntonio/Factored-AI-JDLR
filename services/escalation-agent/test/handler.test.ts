import { afterEach, describe, expect, it, vi } from "vitest";
import { emptyEntities } from "@banking-agent/shared";
import { makeUnderstand } from "./fixtures";

/**
 * Tests del handler de Lambda (`src/handler.ts`), mismo criterio de "nunca
 * lanza" que el resto del pipeline (`policy-agent`/`verification-agent`):
 * cualquier input malformado o fallo interno se atrapa y responde con un
 * `EscalationSummary` de mejor esfuerzo, `pendingQuestion` siempre no nulo.
 */

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("escalation-agent Lambda handler — camino feliz", () => {
  it("resume un ESCALATE de policy-agent correctamente", async () => {
    const { handler } = await import("../src/handler");
    const understand = makeUnderstand({ intent: "escalation_request" });
    const result = await handler({
      origin: "policy_decision",
      understand,
      policyDecision: {
        decision: "ESCALATE",
        matchedRules: [{ id: "escalate-explicit-request", decision: "ESCALATE" }],
        winningRuleId: "escalate-explicit-request",
        reason: "Pedido explícito de hablar con un humano.",
      },
    });
    expect(result.origin).toBe("policy_decision");
    expect(result.attemptedActions).toEqual([]);
    expect(result.pendingQuestion).toBeTruthy();
  });
});

describe("escalation-agent Lambda handler — nunca lanza ante input malformado", () => {
  it("event no es un objeto -> fallback, pendingQuestion no nulo", async () => {
    const { handler } = await import("../src/handler");
    const result = await handler("not an object");
    expect(result.pendingQuestion).toBeTruthy();
    expect(result.unresolvedReason).toContain("escalation_internal_error");
  });

  it("event es null -> fallback, nunca lanza", async () => {
    const { handler } = await import("../src/handler");
    const result = await handler(null);
    expect(result.pendingQuestion).toBeTruthy();
  });

  it("understand ausente -> fallback, pero intenta rescatar caseId de otras rutas razonables", async () => {
    const { handler } = await import("../src/handler");
    const result = await handler({ origin: "policy_decision", caseId: "case-999" });
    expect(result.caseId).toBe("case-999");
    expect(result.pendingQuestion).toBeTruthy();
    expect(result.unresolvedReason).toContain("escalation_internal_error");
  });

  it("understand con forma inválida (falta context) -> fallback, nunca lanza", async () => {
    const { handler } = await import("../src/handler");
    const result = await handler({
      origin: "verification_failed",
      understand: { intent: "faq", language: "es", entities: emptyEntities(), missing_fields: [] },
    });
    expect(result.pendingQuestion).toBeTruthy();
  });

  it("origin desconocido con understand válido -> summary coherente, nunca lanza", async () => {
    const { handler } = await import("../src/handler");
    const understand = makeUnderstand({ intent: "faq" });
    const result = await handler({ origin: "totally_unexpected", understand });
    expect(result.origin).toBe("policy_decision");
    expect(result.pendingQuestion).toBeTruthy();
  });

  it("nunca expone document_id crudo aunque el input malformado lo traiga", async () => {
    const { handler } = await import("../src/handler");
    const rawDoc = "99988877766";
    const result = await handler({ origin: "policy_decision", entities: { document_id: rawDoc } });
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain(rawDoc);
    expect(result.maskedDocumentId).toBe("*******7766");
  });
});

describe("escalation-agent Lambda handler — fallback ante error interno simulado", () => {
  it("si buildEscalationSummary lanza, el handler responde con bestEffortFallback en vez de propagar", async () => {
    vi.doMock("../src/build-summary", () => ({
      buildEscalationSummary: () => {
        throw new Error("bug simulado no previsto");
      },
    }));

    const { handler } = await import("../src/handler");
    const understand = makeUnderstand({ intent: "eligibility_check" });
    const result = await handler({ origin: "policy_decision", understand });

    expect(result.unresolvedReason).toContain("escalation_internal_error");
    expect(result.pendingQuestion).toBeTruthy();
    expect(result.caseId).toBe(understand.context.caseId);
  });
});
