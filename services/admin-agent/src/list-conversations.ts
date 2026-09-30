import { DynamoDBDocumentClient, ScanCommand } from "@aws-sdk/lib-dynamodb";
import type { Intent, LanguageCode } from "@banking-agent/shared";

/**
 * Lista las conversaciones (casos) reales de `banking-agent-dev-case-store`
 * -- `ScanCommand` filtrando `sk = "STATE#latest"` (un item por caso, el
 * estado ACUMULADO del caso, ver `services/conversation-agent/src/context/
 * state-store.ts`). `Scan` es aceptable a esta escala -- mismo criterio ya
 * aceptado para `retrieval-agent`/`DynamoDbCatalogRepository.listFaqs`
 * (16 items, nunca un catálogo real grande): un dashboard de admin interno
 * sobre una tabla de desarrollo/demo, no una consulta de cliente en el
 * camino caliente del chat.
 *
 * Nunca lanza -- cualquier fallo de DynamoDB devuelve `{ok: false}`, el
 * caller (`index.ts`) responde un error genérico, mismo criterio de
 * Reliability que el resto del pipeline.
 */
export interface ConversationSummary {
  caseId: string;
  customerId: string | null;
  lastIntent: Intent;
  lastLanguage: LanguageCode;
  turnCount: number;
  updatedAt: string;
}

export type ListConversationsResult = { ok: true; value: ConversationSummary[] } | { ok: false };

const MAX_RESULTS = 100;

export async function listConversations(
  docClient: Pick<DynamoDBDocumentClient, "send">,
  tableName: string
): Promise<ListConversationsResult> {
  try {
    const items: Record<string, unknown>[] = [];
    let lastEvaluatedKey: Record<string, unknown> | undefined;

    do {
      const result = await docClient.send(
        new ScanCommand({
          TableName: tableName,
          FilterExpression: "sk = :stateSk",
          ExpressionAttributeValues: { ":stateSk": "STATE#latest" },
          ExclusiveStartKey: lastEvaluatedKey,
        })
      );
      items.push(...((result.Items ?? []) as Record<string, unknown>[]));
      lastEvaluatedKey = result.LastEvaluatedKey as Record<string, unknown> | undefined;
    } while (lastEvaluatedKey);

    const summaries: ConversationSummary[] = items.map((item) => ({
      caseId: item.caseId as string,
      customerId: (item.customerId as string | null) ?? null,
      lastIntent: item.lastIntent as Intent,
      lastLanguage: item.lastLanguage as LanguageCode,
      turnCount: item.turnCount as number,
      updatedAt: item.updatedAt as string,
    }));

    summaries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

    return { ok: true, value: summaries.slice(0, MAX_RESULTS) };
  } catch {
    return { ok: false };
  }
}
