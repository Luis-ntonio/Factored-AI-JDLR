import type { LanguageCode } from "@banking-agent/shared";
import type { ChatResponse } from "./types";

/** Errores de RED (nunca del backend real -- ver `SendMessageResult`) --
 * bifurcados por idioma porque pueden ocurrir en cualquier turno, incluida
 * una conversación ya en curso en portugués (no hay "primer turno" que
 * justifique defaultear a español si ya conocemos `currentLanguage`). Mismo
 * patrón `Record<LanguageCode, ...>` que el resto de `apps/web/src`. */
const NETWORK_ERROR: Record<LanguageCode, string> = {
  es: "No se pudo conectar con el servidor. Verifica tu conexión e intenta de nuevo.",
  pt: "Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.",
};

const INVALID_JSON_ERROR: Record<LanguageCode, string> = {
  es: "El servidor respondió con un formato inesperado (JSON inválido).",
  pt: "O servidor respondeu com um formato inesperado (JSON inválido).",
};

const HTTP_ERROR: Record<LanguageCode, (status: number) => string> = {
  es: (status) => `El servidor respondió con un error (HTTP ${status}). Intenta de nuevo.`,
  pt: (status) => `O servidor respondeu com um erro (HTTP ${status}). Tente novamente.`,
};

const UNEXPECTED_SHAPE_ERROR: Record<LanguageCode, string> = {
  es: "La respuesta del servidor no tiene el formato esperado.",
  pt: "A resposta do servidor não tem o formato esperado.",
};

/** Endpoint público real del pipeline (POST /chat), ya con CORS habilitado
 * para este dev server (verificado por devops contra AWS real). */
export const CHAT_API_URL = "https://kr49s6ij26.execute-api.us-east-1.amazonaws.com/chat";

const KNOWN_STATUSES = new Set(["ok", "clarify", "escalate", "unavailable"]);

/** Type guard mínimo: solo valida que `status` sea uno de los 4 valores
 * conocidos del contrato. No valida exhaustivamente cada campo interno
 * (`result`/`policyDecision`/`escalation`) porque esos ya vienen tipados por
 * `@banking-agent/shared` del lado del backend — acá nos protegemos de un
 * body inesperado (JSON malformado, respuesta de un proxy/error genérico,
 * etc.), no de un backend que miente sobre su propio contrato. */
function isChatResponse(value: unknown): value is ChatResponse {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.status === "string" && KNOWN_STATUSES.has(v.status);
}

export type SendMessageResult = { ok: true; data: ChatResponse } | { ok: false; error: string };

/**
 * Envía un turno al pipeline real. SIEMPRE resuelve (nunca lanza) — cualquier
 * fallo de red, timeout, status HTTP no-2xx inesperado, o JSON malformado se
 * traduce a `{ ok: false, error }` para que la UI lo muestre como mensaje de
 * chat en vez de crashear.
 */
export async function sendChatMessage(
  caseId: string,
  turnId: string,
  message: string,
  language: LanguageCode,
): Promise<SendMessageResult> {
  let res: Response;
  try {
    res = await fetch(CHAT_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ caseId, turnId, message }),
    });
  } catch {
    return { ok: false, error: NETWORK_ERROR[language] };
  }

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    return { ok: false, error: INVALID_JSON_ERROR[language] };
  }

  // El contrato documenta SIEMPRE HTTP 200, pero nos defendemos igual de un
  // no-2xx inesperado (ej. API Gateway/WAF devolviendo un error genérico).
  if (!res.ok) {
    return { ok: false, error: HTTP_ERROR[language](res.status) };
  }

  if (!isChatResponse(json)) {
    return { ok: false, error: UNEXPECTED_SHAPE_ERROR[language] };
  }

  return { ok: true, data: json };
}
