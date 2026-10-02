import type { LanguageCode } from "@banking-agent/shared";

/** Misma base que `../api.ts` (`CHAT_API_URL`) -- login vive en el MISMO
 * API Gateway HTTP (ver terraform/modules/edge, `attach_auth_route`),
 * nunca vía la Step Function.
 *
 * Login SIEMPRE de 2 pasos desde la decisión de seguridad del usuario (ver
 * docs/STATUS.md, "Login con código por email obligatorio"): documento +
 * nombre + apellido (`AUTH_LOGIN_URL`) dispara un código de un solo uso por
 * email; `OTP_VERIFY_URL` lo consume y recién ahí devuelve el
 * sessionToken. Ya no existe un login de un solo paso -- un documento+
 * nombre correctos YA NO alcanzan por sí solos (ver docstring de
 * `services/auth-agent/src/login.ts` para el razonamiento completo). */
export const AUTH_LOGIN_URL = "https://kr49s6ij26.execute-api.us-east-1.amazonaws.com/auth/login";
export const OTP_VERIFY_URL = "https://kr49s6ij26.execute-api.us-east-1.amazonaws.com/auth/otp/verify";

export interface LoginSession {
  token: string;
  role: "cliente" | "cliente_estrella";
  customerName: string;
  expiresAt: string;
}

export type LoginApiResult = { ok: true; session: LoginSession } | { ok: false; error: string };

const NETWORK_ERROR: Record<LanguageCode, string> = {
  es: "No se pudo conectar con el servidor. Verifica tu conexión e intenta de nuevo.",
  pt: "Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.",
};

const INVALID_REQUEST: Record<LanguageCode, string> = {
  es: "Completá el documento, nombre y apellido para iniciar sesión.",
  pt: "Preencha o documento, nome e sobrenome para entrar.",
};

export type RequestLoginCodeApiResult = { ok: true } | { ok: false; error: string };

/**
 * Paso 1 de 2: documento + nombre + apellido -> SI matchean, dispara un
 * código de 6 dígitos por email. SIEMPRE resuelve `{ok:true}` si la
 * llamada de red funcionó y los 3 campos vinieron completos -- el backend
 * responde igual exista o no el documento/nombre (anti-enumeración, ver
 * `services/auth-agent/src/otp/request.ts`), así que el frontend NUNCA
 * puede (ni debe) distinguir acá "credenciales inválidas" de "código
 * enviado" -- eso solo se sabe en el paso 2, cuando el código no llega o
 * no verifica.
 */
export async function requestLoginCode(
  documentId: string,
  firstName: string,
  lastName: string,
  language: LanguageCode
): Promise<RequestLoginCodeApiResult> {
  try {
    const res = await fetch(AUTH_LOGIN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ document_id: documentId, first_name: firstName, last_name: lastName, language }),
    });
    const json = (await res.json()) as { ok?: boolean };
    if (json.ok !== true) return { ok: false, error: INVALID_REQUEST[language] };
    return { ok: true };
  } catch {
    return { ok: false, error: NETWORK_ERROR[language] };
  }
}

const OTP_INVALID_OR_EXPIRED: Record<LanguageCode, string> = {
  es: "El código es incorrecto o venció. Volvé a pedir el login e intentá de nuevo.",
  pt: "O código está incorreto ou venceu. Peça o login novamente e tente de novo.",
};

const OTP_TOO_MANY_ATTEMPTS: Record<LanguageCode, string> = {
  es: "Superaste el número de intentos permitidos. Volvé a pedir el login.",
  pt: "Você excedeu o número de tentativas permitidas. Peça o login novamente.",
};

/** Paso 2 de 2: documento + código -> sessionToken. SIEMPRE resuelve
 * (nunca lanza) -- mismo criterio que `requestLoginCode`. Único paso que
 * realmente devuelve un token -- si el código no matchea (o nunca llegó un
 * código real porque el paso 1 tenía credenciales inválidas), acá SÍ se
 * entera el usuario, de forma genérica (`invalid_or_expired`, nunca
 * distingue "nunca hubo código" de "código incorrecto"). */
export async function verifyOtp(documentId: string, code: string, language: LanguageCode): Promise<LoginApiResult> {
  let res: Response;
  try {
    res = await fetch(OTP_VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ document_id: documentId, code }),
    });
  } catch {
    return { ok: false, error: NETWORK_ERROR[language] };
  }

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    return { ok: false, error: NETWORK_ERROR[language] };
  }

  const body = json as Record<string, unknown>;
  if (body.ok !== true) {
    const reason = body.reason;
    const message =
      reason === "too_many_attempts"
        ? OTP_TOO_MANY_ATTEMPTS[language]
        : reason === "invalid_or_expired"
          ? OTP_INVALID_OR_EXPIRED[language]
          : INVALID_REQUEST[language];
    return { ok: false, error: message };
  }

  if (
    typeof body.token !== "string" ||
    typeof body.role !== "string" ||
    typeof body.customerName !== "string" ||
    typeof body.expiresAt !== "string"
  ) {
    return { ok: false, error: NETWORK_ERROR[language] };
  }

  return {
    ok: true,
    session: {
      token: body.token,
      role: body.role as LoginSession["role"],
      customerName: body.customerName,
      expiresAt: body.expiresAt,
    },
  };
}
