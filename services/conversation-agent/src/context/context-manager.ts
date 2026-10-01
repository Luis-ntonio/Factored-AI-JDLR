import {
  DegradedReason,
  Entities,
  EntityKey,
  ENTITY_KEYS,
  Intent,
  REQUIRED_ENTITIES_BY_INTENT,
  UnderstandOutput,
  UserRole,
  emptyEntities,
} from "@banking-agent/shared";
import { ConversationStateItem, ConversationStateStore, DdbResult } from "./state-store";
import { UnderstandBackendDeps, resolveUnderstanding } from "../understanding/understand-backend";

export interface BuildUnderstandOutputInput {
  caseId: string;
  customerId: string | null;
  messageId: string;
  message: string;
  /** Ya resuelto por `index.ts` (verificación del `sessionToken`, ver
   * `resolveRole.ts`) ANTES de llamar acá -- este módulo no sabe nada de
   * SSM/HMAC a propósito, mismo criterio de separación de responsabilidades
   * que el resto del pipeline (`context-manager.ts` orquesta el turno, no
   * verifica credenciales). SIEMPRE un valor concreto en runtime real
   * (`"anonimo"` si no hay sesión válida) -- nunca `undefined` acá, a
   * diferencia del campo opcional en el contrato compartido (ver docstring
   * de `UnderstandContext.role`). */
  role: UserRole;
  /** Pass-through puro hacia `UnderstandContext.selectedTransactionId` --
   * ver docstring de `ChatRequestBody.selectedTransactionId` en
   * `../index.ts`. `null`/`undefined` en cualquier turno que no sea una
   * respuesta a un CLARIFY post-Act de disputa ambigua. */
  selectedTransactionId?: string | null;
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
 * Decide si este turno CONTINÚA el `intent` del turno anterior (aunque el
 * clasificador de ESTE turno haya devuelto uno distinto) o si arranca un
 * intent nuevo.
 *
 * Bug real que esto corrige: `intent` se reclasificaba desde CERO en cada
 * turno a partir del texto del mensaje actual, sin memoria de la
 * conversación -- una respuesta corta a una pregunta CLARIFY (ej. "Es de mi
 * tarjeta de crédito" respondiendo "¿qué tipo de producto?" de una disputa
 * activa) suena, aislada de contexto, a una pregunta de producto nueva
 * (`product_info`), y pisaba el flujo de disputa en curso -- `lastIntent` se
 * persistía en `ConversationStateItem` pero nunca se leía de vuelta para
 * nada.
 *
 * Regla (deliberadamente conservadora, sin tocar el clasificador de intent
 * en sí): si HABÍA un `previousIntent` con `previousMissingFields`
 * pendientes (el turno anterior terminó en CLARIFY, sin resolver), Y el
 * mensaje de ESTE turno aportó un valor no nulo para AL MENOS UNO de esos
 * campos pendientes (`incomingEntities`, extraídas de forma independiente
 * del intent -- ver `router/entity-extractor.ts`/`bedrock-understander.ts`,
 * ninguna condiciona qué entity buscar según el intent clasificado), se
 * considera que el usuario está respondiendo esa pregunta pendiente y se
 * continúa `previousIntent`, descartando `freshIntent`.
 *
 * En cualquier otro caso (no había intent anterior pendiente, o este mensaje
 * no aporta nada de lo que se le pidió) se usa `freshIntent` tal cual -- un
 * cambio de tema real sigue funcionando sin cambios, porque sus entities no
 * van a llenar los `missing_fields` del intent anterior.
 *
 * Segundo bug real corregido acá (encontrado en la verificación E2E contra
 * AWS real de la fase CLARIFY post-Act, `policies.yaml`
 * `clarify-dispute-ambiguous-candidates`): `missing_fields` SOLO modela
 * preguntas `pre_action` (`REQUIRED_ENTITIES_BY_INTENT`) -- una pregunta
 * `post_action` (candidatas ambiguas, ya con `product_type`/`document_id`
 * completos desde el turno anterior) deja `previousMissingFields` VACÍO,
 * así que la regla de arriba nunca se activaba. Un mensaje corto
 * respondiendo esa pregunta (ej. clickear "Netflix", texto sin ninguna
 * palabra de "disputa"/"cargo") se reclasificaba como `unknown` y perdía
 * el intent en curso. `selectedTransactionId` (ver `UnderstandContext`,
 * respuesta estructurada del cliente a esa pregunta puntual) es una señal
 * EXPLÍCITA e inequívoca -- si está presente y el intent anterior era
 * `dispute_unrecognized_charge`, se continúa ese intent sin importar
 * `missing_fields`.
 */
export function resolveEffectiveIntent(
  freshIntent: Intent,
  incomingEntities: Entities,
  previousIntent: Intent | null,
  previousMissingFields: EntityKey[],
  selectedTransactionId?: string | null
): Intent {
  if (selectedTransactionId && previousIntent === "dispute_unrecognized_charge") {
    return previousIntent;
  }
  if (previousIntent === null || previousMissingFields.length === 0) {
    return freshIntent;
  }
  const answersPendingQuestion = previousMissingFields.some((key) => incomingEntities[key] !== null);
  return answersPendingQuestion ? previousIntent : freshIntent;
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
  store: ConversationStateStore,
  understandingDeps: UnderstandBackendDeps = {}
): Promise<UnderstandOutput> {
  const { caseId, customerId, messageId, message, role, selectedTransactionId } = input;

  // Seam de backend Understand: Bedrock (tool use forzado) con fallback
  // automático a la heurística existente ante error/baja confianza — ver
  // understanding/understand-backend.ts. Todo lo que sigue de acá en
  // adelante (lectura de estado, merge de entities, missing_fields,
  // persistencia, armado del UnderstandOutput) es IDÉNTICO sin importar qué
  // backend produjo estos tres valores.
  const { language, entities: incomingEntities, intent } = await resolveUnderstanding(
    { message, caseId, turnId: messageId },
    understandingDeps
  );

  let degraded = false;
  let degradedReason: DegradedReason = "none";
  let existingEntities: Entities = emptyEntities();
  let turnCount = 0;
  let previousIntent: Intent | null = null;

  // Corre en paralelo con la lectura de estado -- señal INDEPENDIENTE y
  // puramente aditiva (`UnderstandContext.priorDisputeCount`, ver
  // docstring en el contrato compartido), nunca marca `degraded` si falla:
  // a diferencia de `existingEntities`/`previousIntent` (core del merge de
  // este turno), esta solo alimenta una regla ESCALATE opcional de
  // policy-agent -- un fallo acá se trata como "sin señal de reincidencia"
  // (`null`), nunca como un turno degradado.
  async function getPriorDisputeCount(): Promise<DdbResult<number | null>> {
    if (!customerId) return { ok: true, value: null };
    return store.countPastDisputeCases(customerId, caseId);
  }

  const [readResult, priorDisputeResult] = await Promise.all([store.getState(caseId), getPriorDisputeCount()]);

  if (readResult.ok) {
    if (readResult.value) {
      existingEntities = readResult.value.entities;
      turnCount = readResult.value.turnCount;
      previousIntent = readResult.value.lastIntent;
    }
  } else {
    degraded = true;
    degradedReason = "dynamodb_read_failed";
  }

  const priorDisputeCount = priorDisputeResult.ok ? priorDisputeResult.value : null;

  const previousMissingFields = previousIntent ? computeMissingFields(previousIntent, existingEntities) : [];
  const effectiveIntent = resolveEffectiveIntent(
    intent,
    incomingEntities,
    previousIntent,
    previousMissingFields,
    selectedTransactionId
  );

  const mergedEntities = mergeEntities(existingEntities, incomingEntities);
  const missingFields = computeMissingFields(effectiveIntent, mergedEntities);
  const now = new Date().toISOString();

  const newState: ConversationStateItem = {
    caseId,
    customerId,
    entities: mergedEntities,
    lastIntent: effectiveIntent,
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
      intent: effectiveIntent,
      language,
      createdAt: now,
    }),
  ]);

  if (!degraded && (!writeStateResult.ok || !writeMessageResult.ok)) {
    degraded = true;
    degradedReason = "dynamodb_write_failed";
  }

  return {
    intent: effectiveIntent,
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
      role,
      selectedTransactionId: selectedTransactionId ?? undefined,
      priorDisputeCount,
    },
  };
}
