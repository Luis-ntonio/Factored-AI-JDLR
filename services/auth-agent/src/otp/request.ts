import type { Customer } from "@banking-agent/transaction-agent/dist/data/mock-core-banking";
import type { LanguageCode } from "@banking-agent/shared";
import { generateOtpCode, hashOtpCode } from "./code";
import { maskEmail } from "./mask-email";
import { sendOtpEmail } from "./resend-client";
import { REQUEST_COOLDOWN_MS, type DynamoDbOtpStore } from "./store";

/**
 * Login alternativo DENTRO del chat: solo documento (sin nombre/apellido) ->
 * código de 6 dígitos enviado por email. Lógica pura salvo el envío de email
 * (inyectado como `sendEmail`, default `sendOtpEmail` real -- testeable sin
 * red).
 *
 * **Respuesta SIEMPRE genérica** (`{ok:true}`), exista o no el documento --
 * mismo criterio anti-enumeración que `../login.ts`: revelar "documento no
 * encontrado" le permitiría a un atacante confirmar qué documentos son
 * clientes reales solo probando números. El mensaje al usuario es siempre
 * "si el documento existe, te llegó un código" -- nunca se distingue.
 */

export interface OtpRequestRequest {
  document_id: string;
  language: LanguageCode;
}

export type OtpRequestResult = { ok: true } | { ok: false; reason: "invalid_request" };

export interface OtpRequestDeps {
  customers: readonly Customer[];
  store: DynamoDbOtpStore;
  resendApiKey: string;
  fromEmail: string;
  /** Inyectable para tests -- default es el cliente real de Resend. */
  sendEmail?: typeof sendOtpEmail;
  /** Inyectable para tests -- default `Date.now`. */
  now?: () => number;
}

export async function attemptOtpRequest(
  request: Partial<OtpRequestRequest>,
  deps: OtpRequestDeps
): Promise<OtpRequestResult> {
  const documentId = typeof request.document_id === "string" ? request.document_id.trim() : "";
  const language: LanguageCode = request.language === "pt" ? "pt" : "es";

  if (!documentId) {
    return { ok: false, reason: "invalid_request" };
  }

  const customer = deps.customers.find((c) => c.document_number === documentId);
  const now = (deps.now ?? Date.now)();

  // Documento inexistente: respuesta genérica idéntica, sin tocar el store
  // ni enviar ningún email -- nada que hacer más allá de simular el mismo
  // tiempo de respuesta que el camino feliz (no medido acá explícitamente,
  // limitación conocida -- ver docs/EVALUATION-CRITERIA.md).
  if (!customer) {
    return { ok: true };
  }

  const existing = await deps.store.get(documentId);
  if (existing.status === "found" && now - existing.value.lastRequestedAt < REQUEST_COOLDOWN_MS) {
    // En cooldown -- no se reenvía, pero la respuesta es la MISMA que si se
    // hubiera enviado (nunca se le dice al usuario "esperá N segundos" de
    // forma que revele que el documento existe).
    return { ok: true };
  }

  const code = generateOtpCode();
  const codeHash = hashOtpCode(code);
  await deps.store.put({ documentId, codeHash, customerId: customer.customer_id, lastRequestedAt: now });

  const send = deps.sendEmail ?? sendOtpEmail;
  const emailResult = await send({
    toEmail: customer.email,
    code,
    language,
    apiKey: deps.resendApiKey,
    fromEmail: deps.fromEmail,
  });

  if (!emailResult.ok) {
    // eslint-disable-next-line no-console
    console.error("auth-agent otp email send failed", { documentId, email: maskEmail(customer.email) });
  }

  return { ok: true };
}
