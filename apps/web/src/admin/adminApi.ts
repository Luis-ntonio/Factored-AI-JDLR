import type { Intent, LanguageCode } from "@banking-agent/shared";

/**
 * Cliente del dashboard de admin (`GET /admin/conversations`, `GET
 * /admin/conversations/{caseId}/trace`) -- mismo estilo `{ok, ...}` sin
 * lanzar que `../api.ts`. Superficie SEPARADA del chat de clientes: usa
 * `x-admin-key`, nunca el `sessionToken` de `AuthContext.tsx`.
 */

const ADMIN_API_BASE = "https://kr49s6ij26.execute-api.us-east-1.amazonaws.com/admin";

export interface ConversationSummary {
  caseId: string;
  customerId: string | null;
  lastIntent: Intent;
  lastLanguage: LanguageCode;
  turnCount: number;
  updatedAt: string;
}

export interface TraceStep {
  name: string;
  stateType: string;
  durationMs: number | null;
  input: unknown;
  output: unknown;
}

export interface TurnTrace {
  turnId: string;
  executionArn: string;
  startedAt: string;
  userMessage: string | null;
  steps: TraceStep[];
  finalOutput: unknown;
}

export type AdminResult<T> = { ok: true; value: T } | { ok: false; error: string };

async function callAdminApi<T>(path: string, adminKey: string): Promise<AdminResult<T>> {
  let res: Response;
  try {
    res = await fetch(`${ADMIN_API_BASE}${path}`, {
      method: "GET",
      headers: { "x-admin-key": adminKey },
    });
  } catch {
    return { ok: false, error: "No se pudo conectar con el servidor." };
  }

  if (res.status === 401) {
    return { ok: false, error: "API key incorrecta." };
  }
  if (!res.ok) {
    return { ok: false, error: `El servidor respondió con un error (HTTP ${res.status}).` };
  }

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    return { ok: false, error: "Respuesta inesperada del servidor (JSON inválido)." };
  }

  const body = json as { ok?: boolean; reason?: string };
  if (!body.ok) {
    return { ok: false, error: body.reason ?? "El servidor no pudo procesar la solicitud." };
  }

  return { ok: true, value: json as T };
}

export async function fetchConversations(
  adminKey: string
): Promise<AdminResult<{ ok: true; conversations: ConversationSummary[] }>> {
  return callAdminApi("/conversations", adminKey);
}

export async function fetchTrace(
  adminKey: string,
  caseId: string
): Promise<AdminResult<{ ok: true; turns: TurnTrace[] }>> {
  return callAdminApi(`/conversations/${encodeURIComponent(caseId)}/trace`, adminKey);
}
