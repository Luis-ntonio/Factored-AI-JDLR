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

/** Perfiles/objetivos del simulador -- MISMO catálogo fijo que
 * `services/admin-agent/src/simulation/{profiles,objectives}.ts`,
 * duplicado acá a propósito (es la ÚNICA fuente de verdad documentada una
 * vez en el backend; el frontend solo necesita id+label para los selects,
 * nunca el detalle completo del perfil). Si el catálogo del backend
 * cambia, actualizar esta lista en el mismo commit. */
export const SIMULATION_PROFILE_OPTIONS = [
  { id: "maría-premium-es", label: "María (Premium, es)" },
  { id: "maría-premium-pt", label: "María (Premium, pt)" },
  { id: "carlos-plus-es", label: "Carlos (Plus, es)" },
  { id: "carlos-plus-pt", label: "Carlos (Plus, pt)" },
  { id: "julieta-basic-es", label: "Julieta (Basic, es)" },
  { id: "julieta-basic-pt", label: "Julieta (Basic, pt)" },
  { id: "roberto-student-es", label: "Roberto (Student, es)" },
  { id: "roberto-student-pt", label: "Roberto (Student, pt)" },
] as const;

export const SIMULATION_OBJECTIVE_OPTIONS = [
  { id: "dispute-ambiguous", label: "Disputa con comercio ambiguo" },
  { id: "eligibility-missing-data", label: "Elegibilidad con datos incompletos" },
  { id: "escalation-high-amount", label: "Disputa de monto alto (escalación esperada)" },
  { id: "product-info-quick", label: "Consulta simple de producto" },
] as const;

export type SimulationRunStatus = "pending" | "running" | "completed" | "failed";
export type ChatStatus = "ok" | "clarify" | "escalate" | "unavailable";

export interface SimulationTurnRecord {
  caseId: string;
  turnId: string;
  userMessage: string;
  status: ChatStatus;
}

export interface SimulationRunItem {
  runId: string;
  profileId: string;
  objectiveId: string;
  status: SimulationRunStatus;
  turns: SimulationTurnRecord[];
  expectedStatus: ChatStatus;
  finalStatus?: ChatStatus;
  passed?: boolean;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export type AdminResult<T> = { ok: true; value: T } | { ok: false; error: string };

async function callAdminApi<T>(
  path: string,
  adminKey: string,
  init: { method?: string; body?: unknown } = {}
): Promise<AdminResult<T>> {
  let res: Response;
  try {
    res = await fetch(`${ADMIN_API_BASE}${path}`, {
      method: init.method ?? "GET",
      headers: {
        "x-admin-key": adminKey,
        ...(init.body ? { "content-type": "application/json" } : {}),
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
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

export async function createSimulation(
  adminKey: string,
  profileId: string,
  objectiveId: string
): Promise<AdminResult<{ ok: true; runId: string }>> {
  return callAdminApi("/simulations", adminKey, { method: "POST", body: { profileId, objectiveId } });
}

export async function fetchSimulations(
  adminKey: string
): Promise<AdminResult<{ ok: true; runs: SimulationRunItem[] }>> {
  return callAdminApi("/simulations", adminKey);
}

export async function fetchSimulationRun(
  adminKey: string,
  runId: string
): Promise<AdminResult<{ ok: true; run: SimulationRunItem }>> {
  return callAdminApi(`/simulations/${encodeURIComponent(runId)}`, adminKey);
}
