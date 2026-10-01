import { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";

/**
 * Persistencia de corridas de simulación -- reusa la MISMA tabla
 * `banking-agent-dev-case-store` (`terraform/modules/data`), un item nuevo
 * por corrida, sin tabla ni GSI nuevo:
 *   pk     = SIM#<runId>
 *   sk     = META
 *   gsi1pk = SIMULATIONS   (valor CONSTANTE, nunca un customerId real --
 *            el GSI `by-customer` ya existe como hash-only, listar por este
 *            valor constante es exactamente lo que necesita
 *            `listSimulationRuns`, sin ampliar el permiso de Scan que ya
 *            tiene admin-agent solo para `listConversations`).
 *
 * Nunca lanza -- mismo criterio de Reliability que `list-conversations.ts`/
 * `get-trace.ts`: cualquier fallo de DynamoDB devuelve `{ok: false}`.
 */

export type SimulationRunStatus = "pending" | "running" | "completed" | "failed";

export interface SimulationTurnRecord {
  caseId: string;
  turnId: string;
  userMessage: string;
  status: "ok" | "clarify" | "escalate" | "unavailable";
}

export interface SimulationRunItem {
  runId: string;
  profileId: string;
  objectiveId: string;
  status: SimulationRunStatus;
  turns: SimulationTurnRecord[];
  expectedStatus: "ok" | "clarify" | "escalate" | "unavailable";
  finalStatus?: "ok" | "clarify" | "escalate" | "unavailable";
  passed?: boolean;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

const GSI_NAME = "by-customer";
const GSI1PK_VALUE = "SIMULATIONS";

function toItem(run: SimulationRunItem): Record<string, unknown> {
  return {
    pk: `SIM#${run.runId}`,
    sk: "META",
    gsi1pk: GSI1PK_VALUE,
    ...run,
  };
}

function fromItem(item: Record<string, unknown>): SimulationRunItem {
  return {
    runId: item.runId as string,
    profileId: item.profileId as string,
    objectiveId: item.objectiveId as string,
    status: item.status as SimulationRunStatus,
    turns: (item.turns as SimulationTurnRecord[]) ?? [],
    expectedStatus: item.expectedStatus as SimulationRunItem["expectedStatus"],
    finalStatus: item.finalStatus as SimulationRunItem["finalStatus"],
    passed: item.passed as boolean | undefined,
    error: item.error as string | undefined,
    createdAt: item.createdAt as string,
    updatedAt: item.updatedAt as string,
  };
}

export type PutSimulationRunResult = { ok: true } | { ok: false };

export async function putSimulationRun(
  docClient: Pick<DynamoDBDocumentClient, "send">,
  tableName: string,
  run: SimulationRunItem
): Promise<PutSimulationRunResult> {
  try {
    await docClient.send(new PutCommand({ TableName: tableName, Item: toItem(run) }));
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

export type GetSimulationRunResult = { ok: true; value: SimulationRunItem | null } | { ok: false };

export async function getSimulationRun(
  docClient: Pick<DynamoDBDocumentClient, "send">,
  tableName: string,
  runId: string
): Promise<GetSimulationRunResult> {
  try {
    const result = await docClient.send(
      new GetCommand({ TableName: tableName, Key: { pk: `SIM#${runId}`, sk: "META" } })
    );
    if (!result.Item) return { ok: true, value: null };
    return { ok: true, value: fromItem(result.Item as Record<string, unknown>) };
  } catch {
    return { ok: false };
  }
}

export type ListSimulationRunsResult = { ok: true; value: SimulationRunItem[] } | { ok: false };

const MAX_RESULTS = 100;

export async function listSimulationRuns(
  docClient: Pick<DynamoDBDocumentClient, "send">,
  tableName: string
): Promise<ListSimulationRunsResult> {
  try {
    const items: Record<string, unknown>[] = [];
    let lastEvaluatedKey: Record<string, unknown> | undefined;

    do {
      const result = await docClient.send(
        new QueryCommand({
          TableName: tableName,
          IndexName: GSI_NAME,
          KeyConditionExpression: "gsi1pk = :g",
          ExpressionAttributeValues: { ":g": GSI1PK_VALUE },
          ExclusiveStartKey: lastEvaluatedKey,
        })
      );
      items.push(...((result.Items ?? []) as Record<string, unknown>[]));
      lastEvaluatedKey = result.LastEvaluatedKey as Record<string, unknown> | undefined;
    } while (lastEvaluatedKey);

    const runs = items.map(fromItem);
    runs.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    return { ok: true, value: runs.slice(0, MAX_RESULTS) };
  } catch {
    return { ok: false };
  }
}
