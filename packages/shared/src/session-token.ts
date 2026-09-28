import { createHmac, timingSafeEqual } from "node:crypto";
import type { UserRole } from "./contracts/understand-output";

/**
 * Token de sesión firmado (HMAC-SHA256), SIN ESTADO -- no hay tabla
 * DynamoDB de sesiones. `services/auth-agent` lo firma tras validar
 * documento+nombre contra el core bancario simulado; `services/
 * conversation-agent` lo verifica en cada turno de `POST /chat`. Ambos
 * leen el MISMO secreto de SSM (`SESSION_TOKEN_SECRET_PARAM_NAME`, ver
 * `terraform/modules/secrets`) -- nunca hardcodeado en código.
 *
 * Formato: `base64url(JSON payload).base64url(HMAC-SHA256 del payload)`
 * -- deliberadamente simple (no un JWT completo con header/alg negociable,
 * que agrega superficie de ataque -- ej. "alg: none" -- sin necesidad acá,
 * porque el algoritmo y el secreto nunca varían entre emisor y verificador).
 *
 * `verifySessionToken` NUNCA lanza -- cualquier token malformado, con firma
 * inválida, o expirado se trata como "no autenticado" (rol `anonimo`),
 * nunca como un error que tumbe el turno completo (mismo criterio de
 * Reliability que el resto del pipeline).
 */
export interface SessionTokenPayload {
  customerId: string;
  documentId: string;
  /** `Customer.segment` real del mock/dataset (`"Premium"|"Plus"|"Basic"|"Student"`). */
  segment: string;
  role: UserRole;
  /** Epoch seconds -- emitido en. */
  iat: number;
  /** Epoch seconds -- expira en (`iat` + TTL, default 30 min). */
  exp: number;
}

const DEFAULT_TTL_SECONDS = 30 * 60;

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

/**
 * Firma un token nuevo. Se llama SOLO desde `services/auth-agent`, después
 * de validar identidad (documento + nombre) contra el core bancario
 * simulado -- este módulo no valida identidad, solo firma/verifica.
 */
export function signSessionToken(
  claims: Omit<SessionTokenPayload, "iat" | "exp">,
  secret: string,
  ttlSeconds: number = DEFAULT_TTL_SECONDS
): string {
  const now = Math.floor(Date.now() / 1000);
  const payload: SessionTokenPayload = { ...claims, iat: now, exp: now + ttlSeconds };
  const payloadB64 = base64url(JSON.stringify(payload));
  const signature = createHmac("sha256", secret).update(payloadB64).digest();
  return `${payloadB64}.${base64url(signature)}`;
}

/**
 * Verifica un token recibido en `POST /chat`. `null` ante CUALQUIER
 * problema (formato inválido, firma que no matchea, `exp` vencido, JSON
 * corrupto) -- el caller (`conversation-agent`) trata `null` exactamente
 * igual que "no vino ningún token": rol `anonimo`, nunca un error.
 */
export function verifySessionToken(token: string, secret: string): SessionTokenPayload | null {
  try {
    const [payloadB64, signatureB64] = token.split(".");
    if (!payloadB64 || !signatureB64) return null;

    const expectedSignature = createHmac("sha256", secret).update(payloadB64).digest();
    const actualSignature = Buffer.from(signatureB64, "base64url");
    if (expectedSignature.length !== actualSignature.length) return null;
    if (!timingSafeEqual(expectedSignature, actualSignature)) return null;

    const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf-8")) as Partial<SessionTokenPayload>;
    if (
      typeof payload.customerId !== "string" ||
      typeof payload.documentId !== "string" ||
      typeof payload.segment !== "string" ||
      typeof payload.role !== "string" ||
      typeof payload.exp !== "number" ||
      typeof payload.iat !== "number"
    ) {
      return null;
    }

    const nowSeconds = Math.floor(Date.now() / 1000);
    if (payload.exp < nowSeconds) return null;

    return payload as SessionTokenPayload;
  } catch {
    return null;
  }
}

/** `Customer.segment` real (ver `services/transaction-agent/src/data/
 * mock-core-banking.ts`, `CustomerSegment`) -> `UserRole`. `"Premium"` es
 * la única señal de "cliente estrella" -- el resto de segments
 * autenticados (`Basic`/`Plus`/`Student`) son `cliente` estándar. */
export function roleFromSegment(segment: string): UserRole {
  return segment === "Premium" ? "cliente_estrella" : "cliente";
}
