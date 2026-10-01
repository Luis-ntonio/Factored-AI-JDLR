import type { BedrockRuntimeClient } from "@aws-sdk/client-bedrock-runtime";
import type { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { randomUUID } from "node:crypto";
import { findSimulationProfile } from "./profiles";
import { findSimulationObjective } from "./objectives";
import { generateNextUserMessage, type LastBotTurn, type UserSimulatorHistoryEntry } from "./user-simulator";
import { getSimulationRun, putSimulationRun, type SimulationRunItem, type SimulationTurnRecord } from "./store";

/**
 * Worker de la simulación -- corre DESACOPLADO del request HTTP que la
 * disparó (invocado vía `lambda:InvokeFunction` con `InvocationType:
 * "Event"`, ver `../index.ts`), porque una simulación de varios turnos
 * reales (p50=2165ms/p95=10226ms por turno, `docs/USAGE-ANALYTICS.md`)
 * puede superar el límite sincrónico de 29s de API Gateway.
 *
 * Cada turno es un `POST /chat` REAL (el mismo endpoint público que usa
 * `apps/web/src/api.ts`) -- nunca se invoca la Step Function directo ni se
 * simula el pipeline: esto prueba el sistema desplegado de punta a punta,
 * igual que un browser real. Login real contra `POST /auth/login` primero
 * (mismo contrato que `services/auth-agent/src/login.ts`), con los datos
 * reales del perfil elegido.
 *
 * El juicio final es ESTRUCTURAL: `passed = finalStatus ===
 * expectedStatus` del objetivo -- nunca otro LLM opinando sobre si "salió
 * bien" (ver docstring de `user-simulator.ts`).
 */

const MAX_TURNS = 6;

interface ChatApiResponseLike {
  status: "ok" | "clarify" | "escalate" | "unavailable";
  reason?: string;
  policyDecision?: { reason?: string; askField?: string };
  ambiguousCandidates?: Array<{ transactionId: string; merchant: string | null; amount: number; date: string }>;
  escalation?: { reason?: string } & Record<string, unknown>;
  result?: unknown;
}

interface LoginApiResponseLike {
  ok: boolean;
  token?: string;
  reason?: string;
}

function summarizeBotResponse(json: ChatApiResponseLike): string {
  if (json.status === "clarify") {
    return json.policyDecision?.reason ?? "El bot pidió más información.";
  }
  if (json.status === "escalate") {
    return json.escalation?.reason ?? "El bot escaló la solicitud a un humano.";
  }
  if (json.status === "unavailable") {
    return json.reason ?? "El bot no pudo procesar la solicitud (servicio no disponible).";
  }
  return "El bot resolvió la solicitud.";
}

export interface RunSimulationDeps {
  docClient: Pick<DynamoDBDocumentClient, "send">;
  caseStoreTableName: string;
  bedrockClient: Pick<BedrockRuntimeClient, "send">;
  bedrockModelId: string;
  chatApiUrl: string;
  authLoginUrl: string;
  /** Inyectable para tests -- en runtime real, el `fetch` global de
   * Node 20.x (mismo que usa `apps/web/src/api.ts` en el browser). */
  fetchFn?: typeof fetch;
  maxTurns?: number;
}

async function persist(deps: RunSimulationDeps, run: SimulationRunItem): Promise<void> {
  run.updatedAt = new Date().toISOString();
  await putSimulationRun(deps.docClient, deps.caseStoreTableName, run);
}

/**
 * Corre la simulación completa para un `runId` que YA existe en la tabla
 * con `status: "pending"` (creado por `POST /admin/simulations`, ver
 * `../index.ts`). Nunca lanza -- cualquier fallo intermedio se persiste
 * como `status: "failed"` + `error`, nunca deja la corrida en un estado a
 * medio terminar sin explicación.
 */
export async function runSimulation(runId: string, deps: RunSimulationDeps): Promise<void> {
  const maxTurns = deps.maxTurns ?? MAX_TURNS;
  const fetchFn = deps.fetchFn ?? fetch;

  const existing = await getSimulationRun(deps.docClient, deps.caseStoreTableName, runId);
  if (!existing.ok || !existing.value) {
    // No hay dónde persistir el fallo (el item ni existe) -- solo loguear.
    // eslint-disable-next-line no-console
    console.error("admin-agent run-simulation: runId no encontrado", { runId });
    return;
  }

  const run = existing.value;
  const profile = findSimulationProfile(run.profileId);
  const objective = findSimulationObjective(run.objectiveId);

  if (!profile || !objective) {
    run.status = "failed";
    run.error = "profileId/objectiveId desconocido";
    await persist(deps, run);
    return;
  }

  run.status = "running";
  await persist(deps, run);

  try {
    const loginRes = await fetchFn(deps.authLoginUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        document_id: profile.documentId,
        first_name: profile.firstName,
        last_name: profile.lastName,
      }),
    });
    const loginJson = (await loginRes.json()) as LoginApiResponseLike;
    if (!loginJson.ok || !loginJson.token) {
      run.status = "failed";
      run.error = `login falló: ${loginJson.reason ?? "razón desconocida"}`;
      await persist(deps, run);
      return;
    }
    const sessionToken = loginJson.token;

    const caseId = `sim-${runId}`;
    const history: UserSimulatorHistoryEntry[] = [];
    let lastBotTurn: LastBotTurn | null = null;
    let finalStatus: ChatApiResponseLike["status"] = "unavailable";
    let nextMessage = objective.seedMessage[profile.languageCode];
    let selectedTransactionId: string | undefined;

    for (let turn = 0; turn < maxTurns; turn++) {
      const turnId = randomUUID();
      history.push({ role: "user", text: nextMessage });

      const chatRes = await fetchFn(deps.chatApiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caseId, turnId, message: nextMessage, sessionToken, selectedTransactionId }),
      });
      const json = (await chatRes.json()) as ChatApiResponseLike;
      finalStatus = json.status;

      run.turns.push({ caseId, turnId, userMessage: nextMessage, status: json.status } satisfies SimulationTurnRecord);
      await persist(deps, run);

      const summary = summarizeBotResponse(json);
      history.push({ role: "assistant", text: summary });

      if (json.status === "ok" || json.status === "escalate" || json.status === "unavailable") break;

      lastBotTurn = {
        status: json.status,
        summary,
        askField: json.policyDecision?.askField,
        ambiguousCandidates: json.ambiguousCandidates,
      };

      const nextTurn = await generateNextUserMessage(profile, objective, history, lastBotTurn, {
        bedrockClient: deps.bedrockClient,
        modelId: deps.bedrockModelId,
      });

      if (!nextTurn || nextTurn.isDone) break;

      nextMessage = nextTurn.nextMessage;
      selectedTransactionId = nextTurn.selectedTransactionId;
    }

    run.finalStatus = finalStatus;
    run.passed = finalStatus === objective.expectedStatus;
    run.status = "completed";
    await persist(deps, run);
  } catch (error) {
    run.status = "failed";
    run.error = String(error);
    await persist(deps, run);
  }
}
