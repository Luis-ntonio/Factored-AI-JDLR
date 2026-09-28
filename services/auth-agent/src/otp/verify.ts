import type { Customer } from "@banking-agent/transaction-agent/dist/data/mock-core-banking";
import { roleFromSegment, signSessionToken, type SessionTokenPayload } from "@banking-agent/shared";
import { codeMatches } from "./code";
import { MAX_VERIFY_ATTEMPTS, type DynamoDbOtpStore } from "./store";

/**
 * Verifica el código OTP contra el que se guardó en `attemptOtpRequest` y,
 * si matchea, firma el MISMO shape de sessionToken que `../login.ts` (el
 * frontend/conversation-agent no necesitan saber por qué método se logueó
 * el usuario).
 *
 * Errores SIEMPRE genéricos (`"invalid_or_expired"`) -- nunca se distingue
 * "el código no matchea" de "no había ningún código pendiente"/"expiró", el
 * mismo criterio anti-side-channel de `../login.ts` para nombre/documento.
 */

export interface OtpVerifyRequest {
  document_id: string;
  code: string;
}

export type OtpVerifyResult =
  | { ok: true; token: string; role: SessionTokenPayload["role"]; customerName: string; expiresAt: string }
  | { ok: false; reason: "invalid_request" | "invalid_or_expired" | "too_many_attempts" };

export interface OtpVerifyDeps {
  customers: readonly Customer[];
  store: DynamoDbOtpStore;
  sessionSecret: string;
}

export async function attemptOtpVerify(
  request: Partial<OtpVerifyRequest>,
  deps: OtpVerifyDeps
): Promise<OtpVerifyResult> {
  const documentId = typeof request.document_id === "string" ? request.document_id.trim() : "";
  const code = typeof request.code === "string" ? request.code.trim() : "";

  if (!documentId || !code) {
    return { ok: false, reason: "invalid_request" };
  }

  const stored = await deps.store.get(documentId);
  if (stored.status !== "found") {
    return { ok: false, reason: "invalid_or_expired" };
  }

  const item = stored.value;

  if (item.attempts >= MAX_VERIFY_ATTEMPTS) {
    return { ok: false, reason: "too_many_attempts" };
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (item.expiresAt < nowSeconds) {
    return { ok: false, reason: "invalid_or_expired" };
  }

  if (!codeMatches(code, item.codeHash)) {
    await deps.store.incrementAttempts(documentId);
    return { ok: false, reason: "invalid_or_expired" };
  }

  const customer = deps.customers.find((c) => c.customer_id === item.customerId);
  if (!customer) {
    // El customer que respaldaba este código ya no existe (dataset
    // mock/real editado entre el request y el verify) -- mismo error
    // genérico, nunca revelar el motivo interno.
    return { ok: false, reason: "invalid_or_expired" };
  }

  // Consumo de un solo uso -- el código deja de ser válido apenas se usa,
  // sin importar el resultado del resto de esta función.
  await deps.store.delete(documentId);

  const role = roleFromSegment(customer.segment);
  const token = signSessionToken(
    { customerId: customer.customer_id, documentId: customer.document_number, segment: customer.segment, role },
    deps.sessionSecret
  );

  const payloadB64 = token.split(".")[0];
  const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf-8")) as { exp: number };
  const expiresAt = new Date(payload.exp * 1000).toISOString();

  return {
    ok: true,
    token,
    role,
    customerName: `${customer.first_name} ${customer.last_name}`,
    expiresAt,
  };
}
