import type { Customer } from "@banking-agent/transaction-agent/dist/data/mock-core-banking";
import { roleFromSegment, signSessionToken, type SessionTokenPayload } from "@banking-agent/shared";

/**
 * Lógica pura de login (sin AWS, testeable sin mocks) -- separada del
 * handler de Lambda, mismo criterio que `computeEligibilityScore`/
 * `computeDisputeVerification` en transaction-agent.
 *
 * "Un documento solo no prueba identidad" (PDF del hackathon, pág. 5,
 * "Data and execution boundaries") -- por eso se exige TAMBIÉN
 * first_name/last_name, y deben matchear los del cliente encontrado por
 * `document_number` (case-insensitive, trim -- nunca exact-byte-match
 * sobre un dato que el usuario tipea a mano). Si CUALQUIERA de los dos no
 * matchea, se devuelve el MISMO error genérico que si el documento no
 * existe -- nunca se revela cuál de los dos falló (evita enumeración de
 * documentos válidos).
 */

export interface LoginRequest {
  document_id: string;
  first_name: string;
  last_name: string;
}

export type LoginResult =
  | { ok: true; token: string; role: SessionTokenPayload["role"]; customerName: string; expiresAt: string }
  | { ok: false; reason: "invalid_credentials" | "invalid_request" };

function normalizeName(value: string): string {
  return value.trim().toLowerCase();
}

export function attemptLogin(
  request: Partial<LoginRequest>,
  customers: readonly Customer[],
  sessionSecret: string
): LoginResult {
  const documentId = typeof request.document_id === "string" ? request.document_id.trim() : "";
  const firstName = typeof request.first_name === "string" ? request.first_name : "";
  const lastName = typeof request.last_name === "string" ? request.last_name : "";

  if (!documentId || !firstName.trim() || !lastName.trim()) {
    return { ok: false, reason: "invalid_request" };
  }

  const customer = customers.find((c) => c.document_number === documentId);
  if (!customer) {
    return { ok: false, reason: "invalid_credentials" };
  }

  const nameMatches =
    normalizeName(customer.first_name) === normalizeName(firstName) &&
    normalizeName(customer.last_name) === normalizeName(lastName);
  if (!nameMatches) {
    return { ok: false, reason: "invalid_credentials" };
  }

  const role = roleFromSegment(customer.segment);
  const token = signSessionToken(
    { customerId: customer.customer_id, documentId: customer.document_number, segment: customer.segment, role },
    sessionSecret
  );

  // Decodificar el propio token para leer `exp` en vez de recalcular TTL acá
  // -- una sola fuente de verdad del tiempo de expiración (signSessionToken).
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
