import { afterEach, describe, expect, it, vi } from "vitest";
import * as path from "node:path";
import type { handler as HandlerType } from "../src/handler";

/**
 * Tests del handler de Lambda (`src/handler.ts`), mismo criterio de "nunca
 * lanza" que `services/policy-agent/src/handler.ts` /
 * `services/transaction-agent/src/index.ts`: cualquier fallo interno se
 * atrapa y responde con un `VerificationResult` válido,
 * `status: "pending_confirmation"`.
 *
 * Cada test importa `../src/handler` de forma DINÁMICA después de
 * `vi.resetModules()` y de fijar `POLICY_FILE_PATH`, porque el handler
 * cachea `BorderlineThresholds` en un closure a nivel de módulo (mismo
 * patrón `cachedX` que policy-agent/transaction-agent) -- sin resetear el
 * módulo entre tests, el primer `POLICY_FILE_PATH` que se cargara
 * exitosamente quedaría cacheado para siempre y el test de fallback (archivo
 * inexistente) no podría ejercitar el catch real.
 */

const REAL_POLICY_PATH = path.resolve(__dirname, "../../../policies.yaml");
const NONEXISTENT_POLICY_PATH = path.resolve(__dirname, "./__policies-that-do-not-exist__.yaml");

const ORIGINAL_POLICY_FILE_PATH = process.env.POLICY_FILE_PATH;

afterEach(() => {
  if (ORIGINAL_POLICY_FILE_PATH === undefined) {
    delete process.env.POLICY_FILE_PATH;
  } else {
    process.env.POLICY_FILE_PATH = ORIGINAL_POLICY_FILE_PATH;
  }
  vi.resetModules();
});

async function loadHandler(policyFilePath: string): Promise<typeof HandlerType> {
  process.env.POLICY_FILE_PATH = policyFilePath;
  vi.resetModules();
  const mod = await import("../src/handler");
  return mod.handler;
}

describe("verification-agent Lambda handler", () => {
  it("verifica un eligibility_check consistente contra el policies.yaml real", async () => {
    const handler = await loadHandler(REAL_POLICY_PATH);
    const result = await handler({
      intent: "eligibility_check",
      result: {
        status: "ok",
        result: { caseId: "c1", productType: "personal_loan", eligibility_score: 90, score_zone: "approved" },
      },
    });
    expect(result.status).toBe("verified");
    expect(result.verified).toBe(true);
  });

  it("nunca lanza: intent desconocido -> pending_confirmation", async () => {
    const handler = await loadHandler(REAL_POLICY_PATH);
    const result = await handler({ intent: "unknown_intent", result: {} });
    expect(result.status).toBe("pending_confirmation");
    expect(result.verified).toBe(false);
  });

  it("nunca lanza: event completamente inválido (string) -> pending_confirmation", async () => {
    const handler = await loadHandler(REAL_POLICY_PATH);
    const result = await handler("not an object");
    expect(result.status).toBe("pending_confirmation");
    expect(result.verified).toBe(false);
  });

  it("fallback ante error interno: POLICY_FILE_PATH apunta a un archivo inexistente -> pending_confirmation, nunca throw", async () => {
    const handler = await loadHandler(NONEXISTENT_POLICY_PATH);

    const event = {
      intent: "eligibility_check",
      result: { status: "ok", result: { caseId: "c1", productType: "personal_loan", eligibility_score: 90, score_zone: "approved" } },
    };

    await expect(handler(event)).resolves.toMatchObject({
      status: "pending_confirmation",
      verified: false,
      reason: "verification_internal_error",
    });
  });

  it("fallback ante error interno hace mejor esfuerzo de eco del result de entrada", async () => {
    const handler = await loadHandler(NONEXISTENT_POLICY_PATH);

    const echoedResult = { status: "ok", result: { caseId: "c1" } };
    const result = await handler({ intent: "eligibility_check", result: echoedResult });

    expect(result.data).toEqual(echoedResult);
  });

  it("fallback ante error interno con input sin 'result' -> data: null, nunca throw", async () => {
    const handler = await loadHandler(NONEXISTENT_POLICY_PATH);

    const result = await handler({ intent: "eligibility_check" });
    expect(result.status).toBe("pending_confirmation");
    expect(result.data).toBeNull();
  });

  it("product_info/faq NO dependen de policies.yaml: siguen verificando aunque el archivo no exista", async () => {
    const handler = await loadHandler(NONEXISTENT_POLICY_PATH);

    // Decisión de diseño: `getThresholds` se pasa a `verifyResult` como
    // función lazy, así que solo se invoca (y solo puede lanzar) dentro del
    // camino de eligibility_check que efectivamente la necesita -- ver
    // `src/verify.ts`. Un `policies.yaml` roto NO degrada la verificación de
    // product_info/faq.
    const result = await handler({
      intent: "product_info",
      result: { intent: "product_info", language: "es", found: false, notes: "no aplica" },
    });
    expect(result.status).toBe("verified");
    expect(result.verified).toBe(true);
  });
});
