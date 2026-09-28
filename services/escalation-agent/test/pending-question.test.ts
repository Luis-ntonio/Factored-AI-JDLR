import { describe, expect, it } from "vitest";
import {
  buildAttemptedActionDescription,
  buildPostActionAttemptedActionDescription,
  buildVerificationPendingQuestion,
} from "../src/pending-question";

describe("pending-question — dispute_unrecognized_charge", () => {
  it("buildAttemptedActionDescription menciona transaction-agent y verification-agent", () => {
    const description = buildAttemptedActionDescription("dispute_unrecognized_charge");

    expect(description).toContain("transaction-agent");
    expect(description).toContain("verification-agent");
    expect(description).toContain("disputa");
  });

  it("buildPostActionAttemptedActionDescription menciona los tres agentes y el criterio de negocio", () => {
    const description = buildPostActionAttemptedActionDescription("dispute_unrecognized_charge");

    expect(description).toContain("transaction-agent");
    expect(description).toContain("verification-agent");
    expect(description).toContain("policy-agent");
    expect(description).toContain("post_action");
  });

  it("buildVerificationPendingQuestion (es) es accionable y bilingüe correcto", () => {
    const question = buildVerificationPendingQuestion("dispute_unrecognized_charge", "es");

    expect(question).toContain("transacción disputada");
    expect(question).not.toMatch(/transação/i);
  });

  it("buildVerificationPendingQuestion (pt) es accionable y bilingüe correcto", () => {
    const question = buildVerificationPendingQuestion("dispute_unrecognized_charge", "pt");

    expect(question).toContain("transação disputada");
    expect(question).not.toMatch(/transacción/i);
  });
});
