import { describe, expect, it } from "vitest";
import { emptyEntities } from "@banking-agent/shared";
import { buildEscalationSummary } from "../src/build-summary";
import { makeUnderstand } from "./fixtures";

describe("buildEscalationSummary — origin: policy_decision", () => {
  it("escalate-explicit-request: attemptedActions vacío, unresolvedReason = reason de policy-agent", () => {
    const understand = makeUnderstand({ intent: "escalation_request" });
    const summary = buildEscalationSummary({
      origin: "policy_decision",
      understand,
      policyDecision: {
        decision: "ESCALATE",
        matchedRules: [{ id: "escalate-explicit-request", decision: "ESCALATE" }],
        winningRuleId: "escalate-explicit-request",
        reason: "Pedido explícito de hablar con un humano (intent = escalation_request).",
      },
    });

    expect(summary.origin).toBe("policy_decision");
    expect(summary.attemptedActions).toEqual([]);
    expect(summary.unresolvedReason).toContain("Pedido explícito de hablar con un humano");
    expect(summary.userRequestSummary).toContain("hablar con un humano");
    expect(summary.pendingQuestion).toBeTruthy();
    expect(summary.caseId).toBe("case-123");
    expect(summary.customerId).toBe("customer-456");
  });

  it("escalate-eligibility-unemployed: refleja employment_status en knownEntities, sin PII", () => {
    const understand = makeUnderstand({
      intent: "eligibility_check",
      entities: {
        ...emptyEntities(),
        employment_status: "unemployed",
        product_type: "personal_loan",
        requested_amount: 5000,
      },
    });
    const summary = buildEscalationSummary({
      origin: "policy_decision",
      understand,
      policyDecision: {
        decision: "ESCALATE",
        matchedRules: [{ id: "escalate-eligibility-unemployed", decision: "ESCALATE" }],
        winningRuleId: "escalate-eligibility-unemployed",
        reason:
          "Excepción de política de riesgo: un solicitante desempleado que pide evaluación de crédito requiere revisión humana.",
      },
    });

    expect(summary.attemptedActions).toEqual([]);
    expect(summary.knownEntities.employment_status).toBe("unemployed");
    expect(summary.knownEntities.product_type).toBe("personal_loan");
    expect(summary.knownEntities.requested_amount).toBe(5000);
    expect(summary.userRequestSummary).toContain("préstamo personal");
    expect(summary.userRequestSummary).toContain("5000");
    expect(summary.unresolvedReason).toContain("desempleado");
    expect(summary.pendingQuestion).toBeTruthy();
  });

  it("escalate-eligibility-amount-over-threshold: pendingQuestion usa askField cuando existe", () => {
    const understand = makeUnderstand({
      intent: "eligibility_check",
      entities: { ...emptyEntities(), requested_amount: 100000, product_type: "mortgage" },
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

    expect(summary.attemptedActions).toEqual([]);
    expect(summary.unresolvedReason).toContain("supera el umbral");
    expect(summary.pendingQuestion).toContain("document_type");
  });

  it("policyDecision ausente/sin reason -> unresolvedReason y pendingQuestion genéricos, nunca vacíos", () => {
    const understand = makeUnderstand({ intent: "unknown" });
    const summary = buildEscalationSummary({ origin: "policy_decision", understand });

    expect(summary.attemptedActions).toEqual([]);
    expect(summary.unresolvedReason).toBeTruthy();
    expect(summary.pendingQuestion).toBeTruthy();
  });
});

describe("buildEscalationSummary — origin: verification_failed", () => {
  it("eligibility_check con zona de score que no coincide", () => {
    const understand = makeUnderstand({
      intent: "eligibility_check",
      entities: { ...emptyEntities(), product_type: "personal_loan", requested_amount: 8000 },
    });
    const summary = buildEscalationSummary({
      origin: "verification_failed",
      understand,
      attemptedAction: {
        intent: "eligibility_check",
        verification: {
          status: "pending_confirmation",
          verified: false,
          reason: "score_zone reportado (approved) no coincide con el recalculado (borderline).",
          data: { caseId: "case-123", productType: "personal_loan", eligibility_score: 60, score_zone: "approved" },
        },
      },
    });

    expect(summary.origin).toBe("verification_failed");
    expect(summary.attemptedActions).toHaveLength(1);
    expect(summary.attemptedActions[0]).toContain("transaction-agent");
    expect(summary.attemptedActions[0]).toContain("verification-agent");
    expect(summary.unresolvedReason).toContain("no coincide");
    expect(summary.pendingQuestion).toContain("aprueba o rechaza");
  });

  it("retrieval-agent (product_info) con source faltante", () => {
    const understand = makeUnderstand({
      intent: "product_info",
      entities: { ...emptyEntities(), product_type: "credit_card" },
    });
    const summary = buildEscalationSummary({
      origin: "verification_failed",
      understand,
      attemptedAction: {
        intent: "product_info",
        verification: {
          status: "pending_confirmation",
          verified: false,
          reason: "product.source vacío o ausente.",
          data: { intent: "product_info", language: "es", found: true },
        },
      },
    });

    expect(summary.attemptedActions[0]).toContain("retrieval-agent");
    expect(summary.attemptedActions[0]).toContain("fuente");
    expect(summary.unresolvedReason).toContain("source");
    expect(summary.pendingQuestion).toContain("información del producto");
  });

  it("attemptedAction ausente/sin reason -> fallback genérico, nunca vacío", () => {
    const understand = makeUnderstand({ intent: "faq" });
    const summary = buildEscalationSummary({ origin: "verification_failed", understand });

    expect(summary.attemptedActions).toHaveLength(1);
    expect(summary.unresolvedReason).toBeTruthy();
    expect(summary.pendingQuestion).toBeTruthy();
  });
});

describe("buildEscalationSummary — origin: post_action_decision", () => {
  it("escalate-score-borderline: attemptedActions no vacío, unresolvedReason = reason de policy-agent (stage post_action)", () => {
    const understand = makeUnderstand({
      intent: "eligibility_check",
      entities: {
        ...emptyEntities(),
        product_type: "personal_loan",
        requested_amount: 7000,
        employment_status: "employed",
      },
    });
    const summary = buildEscalationSummary({
      origin: "post_action_decision",
      understand,
      policyDecision: {
        decision: "ESCALATE",
        matchedRules: [{ id: "escalate-score-borderline", decision: "ESCALATE" }],
        winningRuleId: "escalate-score-borderline",
        reason: "El score calculado cae en la zona límite (borderline) y requiere revisión humana.",
      },
    });

    expect(summary.origin).toBe("post_action_decision");
    expect(summary.attemptedActions).toHaveLength(1);
    expect(summary.attemptedActions[0]).toContain("transaction-agent");
    expect(summary.attemptedActions[0]).toContain("verification-agent");
    expect(summary.attemptedActions[0]).toContain("policy-agent");
    expect(summary.unresolvedReason).toContain("zona límite (borderline)");
    expect(summary.pendingQuestion).toBeTruthy();
    // Mismo pipeline de construcción que los otros orígenes: knownEntities y
    // narrativa se comportan igual.
    expect(summary.knownEntities.product_type).toBe("personal_loan");
    expect(summary.knownEntities.requested_amount).toBe(7000);
    expect(summary.knownEntities.employment_status).toBe("employed");
    expect(summary.userRequestSummary).toContain("préstamo personal");
    expect(summary.caseId).toBe("case-123");
    expect(summary.customerId).toBe("customer-456");
  });

  it("policyDecision sin reason -> unresolvedReason cae al default propio, nunca vacío", () => {
    const understand = makeUnderstand({ intent: "eligibility_check" });
    const summary = buildEscalationSummary({
      origin: "post_action_decision",
      understand,
      policyDecision: {
        decision: "ESCALATE",
        matchedRules: [{ id: "escalate-score-borderline", decision: "ESCALATE" }],
        winningRuleId: "escalate-score-borderline",
      },
    });

    expect(summary.attemptedActions).toHaveLength(1);
    expect(summary.unresolvedReason).toContain("post_action");
    expect(summary.pendingQuestion).toBeTruthy();
  });

  it("policyDecision totalmente ausente -> también cae al default, nunca lanza", () => {
    const understand = makeUnderstand({ intent: "eligibility_check" });
    const summary = buildEscalationSummary({ origin: "post_action_decision", understand });

    expect(summary.attemptedActions).toHaveLength(1);
    expect(summary.unresolvedReason).toBeTruthy();
    expect(summary.pendingQuestion).toBeTruthy();
  });
});

describe("buildEscalationSummary — language: pt (cobertura de idioma cliente-facing)", () => {
  // `userRequestSummary` y `pendingQuestion` SÍ se le muestran al cliente
  // final (ver apps/web/src/components/EscalationCard.tsx) -- a diferencia
  // de `unresolvedReason`/`attemptedActions`, deben respetar `understand.language`
  // sin mezclar idiomas. Regresión directa del bug encontrado por el
  // coordinador en prueba visual real: `pending-question.ts` devolvía
  // siempre español aunque `narrative.ts` ya bifurcaba por idioma.
  it("origin policy_decision: userRequestSummary y pendingQuestion en portugués, sin palabras en español", () => {
    const understand = makeUnderstand({ intent: "escalation_request", language: "pt" });
    const summary = buildEscalationSummary({
      origin: "policy_decision",
      understand,
      policyDecision: {
        decision: "ESCALATE",
        matchedRules: [{ id: "escalate-explicit-request", decision: "ESCALATE" }],
        winningRuleId: "escalate-explicit-request",
        reason: "Pedido explícito de hablar con un humano (intent = escalation_request).",
      },
    });

    expect(summary.language).toBe("pt");
    expect(summary.userRequestSummary).toContain("falar com um humano");
    expect(summary.userRequestSummary).not.toMatch(/hablar con un humano/i);
    // "manualmente"/"solicitante" son cognados válidos en ambos idiomas — el
    // chequeo real de "no mezcla ES/PT" usa palabras que SÍ difieren
    // (es "aprobar/rechazar" vs pt "aprovar/rejeitar").
    expect(summary.pendingQuestion).toContain("aprovar");
    expect(summary.pendingQuestion).toContain("rejeitar");
    expect(summary.pendingQuestion).not.toMatch(/aprobar|rechazar/i);
  });

  it("origin policy_decision con askField: pendingQuestion interpola el nombre del campo en portugués", () => {
    const understand = makeUnderstand({ intent: "eligibility_check", language: "pt" });
    const summary = buildEscalationSummary({
      origin: "policy_decision",
      understand,
      policyDecision: {
        decision: "ESCALATE",
        matchedRules: [{ id: "escalate-eligibility-amount-over-threshold", decision: "ESCALATE" }],
        winningRuleId: "escalate-eligibility-amount-over-threshold",
        reason: "Monto por encima del umbral.",
        askField: "requested_amount",
      },
    });

    expect(summary.pendingQuestion).toContain("requested_amount");
    expect(summary.pendingQuestion).toContain("diretamente com o solicitante");
  });

  it("origin verification_failed (eligibility_check): pendingQuestion en portugués", () => {
    const understand = makeUnderstand({ intent: "eligibility_check", language: "pt" });
    const summary = buildEscalationSummary({
      origin: "verification_failed",
      understand,
      attemptedAction: {
        intent: "eligibility_check",
        verification: {
          status: "pending_confirmation",
          verified: false,
          reason: "score_zone reportado no coincide con el recalculado.",
          data: { caseId: "case-123", productType: "personal_loan", eligibility_score: 60, score_zone: "approved" },
        },
      },
    });

    expect(summary.pendingQuestion).toContain("aprovada ou rejeitada");
    expect(summary.pendingQuestion).not.toMatch(/aprueba o rechaza/i);
  });

  it("origin post_action_decision: userRequestSummary y pendingQuestion en portugués", () => {
    const understand = makeUnderstand({
      intent: "eligibility_check",
      language: "pt",
      entities: { ...emptyEntities(), product_type: "auto_loan", requested_amount: 7000 },
    });
    const summary = buildEscalationSummary({
      origin: "post_action_decision",
      understand,
      policyDecision: {
        decision: "ESCALATE",
        matchedRules: [{ id: "escalate-score-borderline", decision: "ESCALATE" }],
        winningRuleId: "escalate-score-borderline",
        reason: "El score calculado cae en la zona límite (borderline) y requiere revisión humana.",
      },
    });

    expect(summary.userRequestSummary).toContain("financiamento de veículo");
    expect(summary.userRequestSummary).not.toMatch(/préstamo|crédito automotor/i);
    expect(summary.pendingQuestion).toBeTruthy();
  });
});

describe("buildEscalationSummary — origin desconocido", () => {
  it("se normaliza a policy_decision de forma conservadora (attemptedActions: [])", () => {
    const understand = makeUnderstand({ intent: "faq" });
    // Cast deliberado: `origin` inválido a propósito, para probar la
    // normalización defensiva en runtime (el tipo `EscalationInput` no
    // permite este valor, pero el handler puede recibir JSON arbitrario de
    // la Step Function en la práctica).
    const summary = buildEscalationSummary({ origin: "something_else", understand } as unknown as Parameters<
      typeof buildEscalationSummary
    >[0]);

    expect(summary.origin).toBe("policy_decision");
    expect(summary.attemptedActions).toEqual([]);
    expect(summary.pendingQuestion).toBeTruthy();
  });
});
