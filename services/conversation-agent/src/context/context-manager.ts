import {
  DegradedReason,
  Entities,
  EntityKey,
  ENTITY_KEYS,
  Intent,
  REQUIRED_ENTITIES_BY_INTENT,
  UnderstandOutput,
  emptyEntities,
} from "@banking-agent/shared";
import { detectLanguage } from "../router/language-detector";
import { extractEntities } from "../router/entity-extractor";
import { routeIntent } from "../router/intent-router";
import { ConversationStateItem, ConversationStateStore } from "./state-store";

export interface BuildUnderstandOutputInput {
  caseId: string;
  customerId: string | null;
  messageId: string;
  message: string;
}

/**
 * Fusiona entities ya conocidos (turnos anteriores, leídos de DynamoDB) con
 * los detectados en el mensaje actual. Regla: un valor nuevo NO nulo
 * sobreescribe el anterior (el usuario puede corregir un dato ya dado); un
 * valor nuevo nulo NUNCA borra un valor ya conocido — así se cumple "no
 * repreguntar lo ya dicho".
 */
export function mergeEntities(existing: Entities, incoming: Entities): Entities {
  const merged = { ...existing };
  for (const key of ENTITY_KEYS) {
    const incomingValue = incoming[key];
    if (incomingValue !== null && incomingValue !== undefined) {
      (merged as any)[key] = incomingValue;
    }
  }
  return merged;
}

export function computeMissingFields(intent: Intent, entities: Entities): EntityKey[] {
  return REQUIRED_ENTITIES_BY_INTENT[intent].filter((key) => entities[key] === null);
}

/**
 * Orquesta el turno completo de Understand: detección de idioma, extracción
 * de entities, routing de intención, lectura/fusión/escritura de estado
 * persistido, y armado del contrato `UnderstandOutput`.
 *
 * Reliability (docs/EVALUATION-CRITERIA.md): si la lectura de estado falla
 * (tras los reintentos acotados de `ConversationStateStore`), se degrada a
 * "sin memoria de esta sesión" (entities vacíos, se vuelve a preguntar todo
 * en este turno) en vez de inventar contexto o lanzar una excepción — se
 * marca `context.degraded = true` con la razón para que policy-agent y
 * observabilidad lo sepan. Si la escritura posterior también falla, el turno
 * igual se responde al usuario (no se pierde el turno), solo que el próximo
 * turno no tendrá memoria de este.
 */
export async function buildUnderstandOutput(
  input: BuildUnderstandOutputInput,
  store: ConversationStateStore
): Promise<UnderstandOutput> {
  const { caseId, customerId, messageId, message } = input;

  const language = detectLanguage(message).language;
  const incomingEntities = extractEntities(message, language);
  const intent = routeIntent(message, language, incomingEntities);

  let degraded = false;
  let degradedReason: DegradedReason = "none";
  let existingEntities: Entities = emptyEntities();
  let turnCount = 0;

  const readResult = await store.getState(caseId);
  if (readResult.ok) {
    if (readResult.value) {
      existingEntities = readResult.value.entities;
      turnCount = readResult.value.turnCount;
    }
  } else {
    degraded = true;
    degradedReason = "dynamodb_read_failed";
  }

  const mergedEntities = mergeEntities(existingEntities, incomingEntities);
  const missingFields = computeMissingFields(intent, mergedEntities);
  const now = new Date().toISOString();

  const newState: ConversationStateItem = {
    caseId,
    customerId,
    entities: mergedEntities,
    lastIntent: intent,
    lastLanguage: language,
    turnCount: turnCount + 1,
    updatedAt: now,
  };

  const [writeStateResult, writeMessageResult] = await Promise.all([
    store.putState(newState),
    store.appendMessage({
      caseId,
      messageId,
      customerId,
      role: "user",
      text: message,
      intent,
      language,
      createdAt: now,
    }),
  ]);

  if (!degraded && (!writeStateResult.ok || !writeMessageResult.ok)) {
    degraded = true;
    degradedReason = "dynamodb_write_failed";
  }

  return {
    intent,
    language,
    entities: mergedEntities,
    missing_fields: missingFields,
    context: {
      caseId,
      customerId,
      turnId: messageId,
      degraded,
      degradedReason,
      historyTurns: turnCount,
    },
  };
}
