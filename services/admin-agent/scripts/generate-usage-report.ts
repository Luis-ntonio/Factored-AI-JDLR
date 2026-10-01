import * as path from "node:path";
import * as fs from "node:fs";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { CloudWatchLogsClient } from "@aws-sdk/client-cloudwatch-logs";
import { listConversations } from "../src/list-conversations";
import { getConversationTrace, type TurnTrace } from "../src/get-trace";

/**
 * "Opción B" del pedido de Data Analytics (ver chat: demanda + costo-por-
 * resolución + insights reales de la solución, no solo de datasets
 * sintéticos de evaluación) -- reusa exactamente el mismo código que
 * `services/admin-agent/src/{list-conversations,get-trace}.ts` (el mismo
 * lector que alimenta el dashboard de `/admin`), pero corrido DIRECTO
 * contra AWS real (mismo patrón que los harnesses de evaluación de
 * `services/policy-agent`/`services/transaction-agent`) para agregar
 * estadísticas reales sobre TODA la actividad de esta cuenta.
 *
 * Honestidad explícita (ver `docs/USAGE-ANALYTICS.md` generado): esto es
 * actividad de DESARROLLO/DEMO de esta sesión (curl/browser de
 * verificación, no tráfico de producción real) -- el reporte lo declara
 * en su propia sección de limitaciones, nunca se presenta como si fuera
 * volumen de clientes reales.
 *
 * Requiere credenciales reales (`AWS_PROFILE=banking-agent-dev`) y las
 * mismas env vars que el Lambda real (`CASE_STORE_TABLE_NAME`,
 * `STATE_MACHINE_LOG_GROUP_NAME`) -- nunca hardcodeadas acá.
 */

// Pricing publicado de Amazon Bedrock para la familia Claude Sonnet --
// misma aproximación documentada (no una tarifa medida en la cuenta real)
// que ya usa services/policy-agent/scripts/evaluate-decide-stage.ts.
const USD_PER_INPUT_TOKEN = 3.0 / 1_000_000;
const USD_PER_OUTPUT_TOKEN = 15.0 / 1_000_000;

const REPORT_PATH = path.resolve(process.cwd(), "../../docs/USAGE-ANALYTICS.md");

/**
 * `modelProposal.tokenUsage` aparece a profundidades DISTINTAS según el
 * paso -- `Decide` lo anida bajo `decideResult.Payload.modelProposal`,
 * `PostActionDecide` bajo `postActionResult.Payload.modelProposal` (ver
 * `terraform/modules/orchestration/asl/chat-orchestrator.asl.json.tftpl`,
 * cómo cada Pass arma su propio payload). En vez de hardcodear esas 2
 * rutas puntuales (frágil si la ASL cambia), busca `tokenUsage`
 * recursivamente en CUALQUIER profundidad del output de cada paso --
 * mismo criterio "nunca asumir una forma exacta sin validarla" del resto
 * del pipeline.
 */
function findTokenUsageRecursive(value: unknown, acc: { inputTokens: number; outputTokens: number }): void {
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (key === "tokenUsage" && child && typeof child === "object") {
      const usage = child as { inputTokens?: number; outputTokens?: number };
      acc.inputTokens += usage.inputTokens ?? 0;
      acc.outputTokens += usage.outputTokens ?? 0;
    } else {
      findTokenUsageRecursive(child, acc);
    }
  }
}

// SOLO estos 2 pasos "producen" un modelProposal nuevo (post-action's
// Prepare* Pass states arman un payload fresco que NO carga el estado
// completo anterior) -- los estados de RUTEO (Choice: RouteByDecision/
// RouteAutoIntent/etc.) o los `Pass` intermedios suelen reenviar el MISMO
// objeto de estado acumulado sin transformarlo, así que buscar
// `tokenUsage` en CUALQUIER step contaría el mismo token varias veces
// (una vez por cada step que simplemente reenvía el mismo payload). Se
// restringe a los dos pasos DUEÑOS del dato para evitar ese doble conteo.
const MODEL_PROPOSAL_OWNER_STEPS = new Set(["Decide", "PostActionDecide"]);

function extractTokenUsage(turn: TurnTrace): { inputTokens: number; outputTokens: number } {
  const acc = { inputTokens: 0, outputTokens: 0 };
  for (const step of turn.steps) {
    if (MODEL_PROPOSAL_OWNER_STEPS.has(step.name)) {
      findTokenUsageRecursive(step.output, acc);
    }
  }
  return acc;
}

function extractFinalStatus(turn: TurnTrace): string {
  const output = turn.finalOutput as { status?: string } | null;
  return output?.status ?? "unknown";
}

function totalDurationMs(turn: TurnTrace): number {
  return turn.steps.reduce((sum, s) => sum + (s.durationMs ?? 0), 0);
}

function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

async function main(): Promise<void> {
  const tableName = process.env.CASE_STORE_TABLE_NAME;
  const logGroupName = process.env.STATE_MACHINE_LOG_GROUP_NAME;
  if (!tableName || !logGroupName) {
    throw new Error("CASE_STORE_TABLE_NAME / STATE_MACHINE_LOG_GROUP_NAME env vars requeridas (mismas que usa el Lambda real).");
  }

  const docClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
  const logsClient = new CloudWatchLogsClient({});

  console.log(`[generate-usage-report] Escaneando conversaciones de ${tableName}...`);
  const conversationsResult = await listConversations(docClient, tableName);
  if (!conversationsResult.ok) {
    throw new Error("No se pudo escanear la tabla case-store -- ver credenciales/permisos.");
  }
  const conversations = conversationsResult.value;
  console.log(`[generate-usage-report] ${conversations.length} conversación(es) encontrada(s). Reconstruyendo trazas...`);

  // Acota la ventana de FilterLogEvents a los últimos 14 días -- sin esto,
  // CADA una de las N conversaciones escanea el log group COMPLETO
  // (potencialmente toda su retención de 30 días, con include_execution_data
  // = true generando volumen real), lento en agregado para N conversaciones
  // en secuencia. El dashboard de admin (lookup de UN caso puntual) sigue
  // sin acotar -- ver docstring de GetConversationTraceOptions.
  const startTime = Date.now() - 14 * 24 * 60 * 60 * 1000;

  const allTurns: TurnTrace[] = [];
  for (const [idx, conversation] of conversations.entries()) {
    process.stdout.write(`[generate-usage-report] (${idx + 1}/${conversations.length}) ${conversation.caseId}...\n`);
    const traceResult = await getConversationTrace(logsClient, logGroupName, conversation.caseId, { startTime });
    if (traceResult.ok) allTurns.push(...traceResult.value);
  }
  console.log(`[generate-usage-report] ${allTurns.length} turno(s) real(es) reconstruido(s) de los logs.`);

  const byIntent = new Map<string, number>();
  for (const conversation of conversations) {
    byIntent.set(conversation.lastIntent, (byIntent.get(conversation.lastIntent) ?? 0) + 1);
  }

  const byStatus = new Map<string, number>();
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  const durations: number[] = [];

  for (const turn of allTurns) {
    const status = extractFinalStatus(turn);
    byStatus.set(status, (byStatus.get(status) ?? 0) + 1);

    const usage = extractTokenUsage(turn);
    totalInputTokens += usage.inputTokens;
    totalOutputTokens += usage.outputTokens;

    const duration = totalDurationMs(turn);
    if (duration > 0) durations.push(duration);
  }

  const totalCostUsd = totalInputTokens * USD_PER_INPUT_TOKEN + totalOutputTokens * USD_PER_OUTPUT_TOKEN;
  const costPerTurnUsd = allTurns.length > 0 ? totalCostUsd / allTurns.length : null;
  const p50 = percentile(durations, 50);
  const p95 = percentile(durations, 95);

  writeReport({
    conversationCount: conversations.length,
    turnCount: allTurns.length,
    byIntent,
    byStatus,
    totalInputTokens,
    totalOutputTokens,
    totalCostUsd,
    costPerTurnUsd,
    p50,
    p95,
  });

  console.log(`[generate-usage-report] Reporte escrito en ${REPORT_PATH}`);
}

function writeReport(stats: {
  conversationCount: number;
  turnCount: number;
  byIntent: Map<string, number>;
  byStatus: Map<string, number>;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostUsd: number;
  costPerTurnUsd: number | null;
  p50: number | null;
  p95: number | null;
}): void {
  const lines: string[] = [];
  lines.push("# Uso real del sistema -- generado de logs reales de CloudWatch");
  lines.push("");
  lines.push(
    "_Generado automáticamente por `services/admin-agent/scripts/generate-usage-report.ts`, reusando el mismo código que alimenta el dashboard de `/admin` (`list-conversations.ts`/`get-trace.ts`), corrido DIRECTO contra AWS real. NO editar a mano -- volver a correr el script para refrescar._"
  );
  lines.push("");
  lines.push(
    "**Limitación honesta, declarada explícitamente**: esta es actividad de DESARROLLO/DEMO acumulada durante esta sesión de trabajo (curl/browser de verificación de cada fase, no tráfico de clientes reales). Los números de abajo describen qué tan activamente se probó el sistema, no un patrón de demanda de producción -- útil como evidencia de que el pipeline completo (Understand→Decide→Act→Verify→Escalate) corrió de punta a punta muchas veces reales, no como proyección de volumen real."
  );
  lines.push("");
  lines.push("## Resumen");
  lines.push("");
  lines.push(`- **Conversaciones (casos) registradas**: ${stats.conversationCount}`);
  lines.push(`- **Turnos reales reconstruidos de los logs**: ${stats.turnCount}`);
  lines.push("");
  lines.push("## Demanda por intent (último intent de cada conversación)");
  lines.push("");
  lines.push("| Intent | Conversaciones |");
  lines.push("| --- | --- |");
  for (const [intent, count] of [...stats.byIntent.entries()].sort((a, b) => b[1] - a[1])) {
    lines.push(`| ${intent} | ${count} |`);
  }
  lines.push("");
  lines.push("## Resultado final por turno");
  lines.push("");
  lines.push("| Status | Turnos |");
  lines.push("| --- | --- |");
  for (const [status, count] of [...stats.byStatus.entries()].sort((a, b) => b[1] - a[1])) {
    lines.push(`| ${status} | ${count} |`);
  }
  lines.push("");
  lines.push("## Costo y latencia reales (Bedrock, todos los turnos con al menos una invocación)");
  lines.push("");
  lines.push(
    `- Tokens reales: ${stats.totalInputTokens} entrada + ${stats.totalOutputTokens} salida. Costo estimado total: $${stats.totalCostUsd.toFixed(
      4
    )}${stats.costPerTurnUsd !== null ? `, ~$${stats.costPerTurnUsd.toFixed(6)} por turno` : ""} (pricing publicado Claude Sonnet, familia usada en este proyecto -- aproximación documentada, no una tarifa medida en la factura real de la cuenta).`
  );
  lines.push(
    stats.p50 !== null
      ? `- Latencia total del pipeline por turno (suma de la duración real de cada paso de la Step Function): p50 = ${stats.p50}ms, p95 = ${stats.p95}ms.`
      : "- Sin datos de latencia en esta corrida."
  );
  lines.push("");
  lines.push("## Limitaciones declaradas");
  lines.push("");
  lines.push(
    "- Volumen bajo y no representativo de producción real -- son las pruebas/demos acumuladas de esta sesión de desarrollo, no tráfico de clientes."
  );
  lines.push(
    "- `byIntent` refleja el ÚLTIMO intent de cada conversación (`ConversationStateItem.lastIntent`), no todos los intents que pasaron por esa conversación si hubo cambios de tema."
  );
  lines.push(
    "- El costo de Bedrock es SOLO el costo del modelo -- no incluye Lambda/DynamoDB/API Gateway/CloudWatch (marginal a este volumen, pero no cero en un escenario real de producción)."
  );
  lines.push("");

  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, lines.join("\n"));
}

main().catch((error) => {
  console.error("generate-usage-report falló", error);
  process.exitCode = 1;
});
