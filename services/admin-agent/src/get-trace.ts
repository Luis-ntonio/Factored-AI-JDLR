import { CloudWatchLogsClient, FilterLogEventsCommand } from "@aws-sdk/client-cloudwatch-logs";

/**
 * Reconstruye la traza completa de un caso a partir de los logs REALES de
 * CloudWatch del Step Function (`banking-agent-dev-chat-orchestrator`,
 * `terraform/modules/orchestration/main.tf`, `logging_configuration {level
 * = "ALL", include_execution_data = true}`) -- CADA turno real (1 ejecución
 * Express = 1 turno) ya queda logueado completo: el input/output de CADA
 * paso del pipeline (Understand, Decide, RouteByDecision, Act(Transaction
 * /Retrieval), Verify, PostActionDecide, Respond(Auto/Clarify)/Escalate),
 * incluyendo `modelProposal.
 * reasoning` de Bedrock y `matchedRules`/`winningRuleId`/`reason` de
 * policy-agent -- sin este módulo, ese "pensamiento interno" ya existe,
 * pero nadie lo lee. Verificado contra logs reales de esta cuenta antes de
 * escribir este archivo (ver docs/STATUS.md, fase del dashboard de admin).
 *
 * NUNCA agrega logging nuevo ni toca la ASL -- solo lee lo que ya se
 * genera.
 */

export interface TraceStep {
  /** Nombre del estado en la ASL (ej. "Understand", "Decide", "Verify"). */
  name: string;
  /** Tipo de estado (Task/Choice/Pass) -- derivado del tipo de evento de
   * Step Functions (ej. "TaskStateEntered" -> "Task"). */
  stateType: string;
  /** `null` si no se pudo emparejar Entered/Exited (evento incompleto). */
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
  /** Output del ÚLTIMO paso de la ejecución -- la respuesta final que el
   * usuario recibió ese turno. */
  finalOutput: unknown;
}

export type GetTraceResult = { ok: true; value: TurnTrace[] } | { ok: false };

// Mismo charset que un UUID/caseId real de este sistema
// (`crypto.randomUUID()` en ChatPanel.tsx, o un caseId de prueba tipo
// "curl-verify-..."). Nunca se interpola `caseId` en el `filterPattern` de
// CloudWatch sin validarlo primero contra esto -- evita inyección en el
// filtro.
const SAFE_CASE_ID = /^[A-Za-z0-9_-]+$/;

interface RawLogEvent {
  details?: {
    input?: string;
    output?: string;
    name?: string;
  };
  id?: string;
  type?: string;
  event_timestamp?: string;
  execution_arn?: string;
}

function tryParseJson(text: string | undefined): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/** Nunca exponer un `sessionToken` firmado en el dashboard, aunque ya esté
 * vencido para cuando alguien lo mire -- mismo criterio de higiene que el
 * resto del pipeline (nunca loguear PII/secretos completos). Solo aparece
 * en el input crudo de `ExecutionStarted`/`Understand` (nadie más lo
 * reenvía río abajo, ver `UnderstandContext` -- nunca incluye el token). */
function redact(value: unknown): unknown {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const obj = { ...(value as Record<string, unknown>) };
    if ("sessionToken" in obj) obj.sessionToken = "[redacted]";
    return obj;
  }
  return value;
}

export async function getConversationTrace(
  logsClient: Pick<CloudWatchLogsClient, "send">,
  logGroupName: string,
  caseId: string
): Promise<GetTraceResult> {
  if (!SAFE_CASE_ID.test(caseId)) return { ok: false };

  try {
    const events: RawLogEvent[] = [];
    let nextToken: string | undefined;
    do {
      const result = await logsClient.send(
        new FilterLogEventsCommand({
          logGroupName,
          filterPattern: `"${caseId}"`,
          nextToken,
        })
      );
      for (const e of result.events ?? []) {
        if (!e.message) continue;
        try {
          events.push(JSON.parse(e.message) as RawLogEvent);
        } catch {
          // Línea que no es JSON válido -- se ignora, nunca rompe toda la
          // traza por un log malformado puntual.
        }
      }
      nextToken = result.nextToken;
    } while (nextToken);

    const byExecution = new Map<string, RawLogEvent[]>();
    for (const event of events) {
      if (!event.execution_arn) continue;
      const group = byExecution.get(event.execution_arn) ?? [];
      group.push(event);
      byExecution.set(event.execution_arn, group);
    }

    const turns: TurnTrace[] = [];
    for (const [executionArn, rawEvents] of byExecution) {
      rawEvents.sort((a, b) => Number(a.id ?? 0) - Number(b.id ?? 0));

      const startedEvent = rawEvents.find((e) => e.type === "ExecutionStarted");
      const startedInput = tryParseJson(startedEvent?.details?.input) as
        | { caseId?: string; turnId?: string; message?: string }
        | null;

      // Empareja *StateEntered con su *StateExited por `details.name` --
      // pila en vez de mapa simple para tolerar (en principio) un mismo
      // estado reintentado dentro de la misma ejecución.
      const enteredStack: Array<{ name: string; stateType: string; timestamp: number; input: unknown }> = [];
      const steps: TraceStep[] = [];

      for (const event of rawEvents) {
        const enteredMatch = event.type?.match(/^(\w+)StateEntered$/);
        const exitedMatch = event.type?.match(/^(\w+)StateExited$/);
        const timestamp = Number(event.event_timestamp ?? 0);

        if (enteredMatch && event.details?.name) {
          enteredStack.push({
            name: event.details.name,
            stateType: enteredMatch[1],
            timestamp,
            input: redact(tryParseJson(event.details.input)),
          });
        } else if (exitedMatch && event.details?.name) {
          const idx = enteredStack.findIndex((e) => e.name === event.details?.name);
          const entered = idx >= 0 ? enteredStack.splice(idx, 1)[0] : null;
          steps.push({
            name: event.details.name,
            stateType: entered?.stateType ?? exitedMatch[1],
            durationMs: entered ? timestamp - entered.timestamp : null,
            input: entered?.input ?? null,
            output: redact(tryParseJson(event.details.output)),
          });
        }
      }

      const finalOutput = steps.length > 0 ? steps[steps.length - 1].output : null;

      turns.push({
        turnId: startedInput?.turnId ?? "unknown",
        executionArn,
        startedAt: startedEvent ? new Date(Number(startedEvent.event_timestamp)).toISOString() : "",
        userMessage: startedInput?.message ?? null,
        steps,
        finalOutput,
      });
    }

    turns.sort((a, b) => a.startedAt.localeCompare(b.startedAt));

    return { ok: true, value: turns };
  } catch {
    return { ok: false };
  }
}
