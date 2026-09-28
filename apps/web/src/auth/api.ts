import type { LanguageCode } from "@banking-agent/shared";

/** Misma base que `../api.ts` (`CHAT_API_URL`) -- login vive en el MISMO
 * API Gateway HTTP, ruta `/auth/login` (ver terraform/modules/edge,
 * `attach_auth_route`), nunca vía la Step Function. */
export const AUTH_LOGIN_URL = "https://kr49s6ij26.execute-api.us-east-1.amazonaws.com/auth/login";

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

const INVALID_CREDENTIALS: Record<LanguageCode, string> = {
  es: "El documento y el nombre no coinciden con ningún cliente. Verificá los datos e intenta de nuevo.",
  pt: "O documento e o nome não correspondem a nenhum cliente. Verifique os dados e tente novamente.",
};

const INVALID_REQUEST: Record<LanguageCode, string> = {
  es: "Completá el documento, nombre y apellido para iniciar sesión.",
  pt: "Preencha o documento, nome e sobrenome para entrar.",
};

/** SIEMPRE resuelve (nunca lanza) -- mismo criterio que `sendChatMessage`
 * en `../api.ts`. */
export async function loginSession(
  documentId: string,
  firstName: string,
  lastName: string,
  language: LanguageCode
): Promise<LoginApiResult> {
  let res: Response;
  try {
    res = await fetch(AUTH_LOGIN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ document_id: documentId, first_name: firstName, last_name: lastName }),
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
    const message = reason === "invalid_credentials" ? INVALID_CREDENTIALS[language] : INVALID_REQUEST[language];
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
