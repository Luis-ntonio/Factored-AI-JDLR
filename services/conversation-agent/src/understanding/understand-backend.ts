import type { BedrockRuntimeClient } from "@aws-sdk/client-bedrock-runtime";
import type { SSMClient } from "@aws-sdk/client-ssm";
import { Entities, Intent, LanguageCode } from "@banking-agent/shared";
import { detectLanguage } from "../router/language-detector";
import { extractEntities } from "../router/entity-extractor";
import { routeIntent } from "../router/intent-router";
import { understandWithBedrock } from "./bedrock-understander";
import { getBedrockConfig } from "./ssm-config";

/**
 * Orquestador de la capa Understand: decide qué backend produce
 * `{language, entities, intent}` para este turno.
 *
 * Patrón de arquitectura confirmado por el usuario ("Jev"): el modelo
 * (Bedrock, vía tool use forzado en `bedrock-understander.ts`) decide
 * primero cuando está habilitado, pero SIEMPRE con fallback automático a la
 * heurística existente (`router/*`, sin tocar) ante error o baja confianza.
 * La heurística nunca se borra ni se deprecia — es el fallback de
 * Reliability.
 *
 * Umbral de confianza configurable pedido por el usuario: por debajo de
 * este valor, la respuesta de Bedrock (aunque "válida") se descarta y se
 * usa heurística en su lugar, porque una clasificación insegura del modelo
 * es peor que una heurística determinística y ya testeada.
 */
export const UNDERSTANDING_CONFIDENCE_THRESHOLD = 0.5;

export type UnderstandingBackendName = "bedrock" | "heuristic";

export type UnderstandingBackendReason = "success" | "low_confidence" | "bedrock_error" | "backend_disabled";

export interface UnderstandBackendInput {
  message: string;
  /** Solo para logging estructurado correlacionado (no cambia la lógica). */
  caseId?: string;
  turnId?: string;
}

export interface UnderstandBackendDeps {
  /** Inyectables para tests (mock) — en Lambda real se construyen desde @aws-sdk. */
  ssmClient?: SSMClient;
  bedrockClient?: BedrockRuntimeClient;
}

export interface UnderstandBackendResult {
  language: LanguageCode;
  entities: Entities;
  intent: Intent;
}

function runHeuristic(message: string): UnderstandBackendResult {
  const language = detectLanguage(message).language;
  const entities = extractEntities(message, language);
  const intent = routeIntent(message, language, entities);
  return { language, entities, intent };
}

/**
 * Logging estructurado (mismo criterio que `compute-eligibility.ts` de
 * transaction-agent: `console.log(JSON.stringify({service, event, ...}))`),
 * correlacionado por caseId/turnId, para que QA pueda confirmar en
 * CloudWatch que Bedrock efectivamente se invocó (y no cayó directo a
 * fallback por accidente).
 */
function logBackendUsed(fields: {
  backend: UnderstandingBackendName;
  reason: UnderstandingBackendReason;
  confidence: number | null;
  caseId?: string;
  turnId?: string;
}): void {
  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify({
      service: "conversation-agent",
      event: "understanding_backend_used",
      ...fields,
    })
  );
}

function resolveBackendName(): UnderstandingBackendName {
  const raw = (process.env.UNDERSTANDING_BACKEND ?? "bedrock").trim().toLowerCase();
  return raw === "heuristic" ? "heuristic" : "bedrock";
}

/**
 * Resuelve `{language, entities, intent}` para ESTE turno, según
 * `UNDERSTANDING_BACKEND` (`"bedrock"` default, o `"heuristic"`).
 *
 * NUNCA lanza: cualquier fallo de Bedrock (SSM no configurado, red,
 * throttle, respuesta inválida) o confianza insuficiente hace fallback
 * silencioso a la heurística existente — el turno del usuario nunca se
 * pierde por esto.
 */
export async function resolveUnderstanding(
  input: UnderstandBackendInput,
  deps: UnderstandBackendDeps = {}
): Promise<UnderstandBackendResult> {
  const { message, caseId, turnId } = input;
  const backendName = resolveBackendName();

  if (backendName === "heuristic") {
    logBackendUsed({ backend: "heuristic", reason: "backend_disabled", confidence: null, caseId, turnId });
    return runHeuristic(message);
  }

  const config = await getBedrockConfig(deps.ssmClient);
  if (!config) {
    logBackendUsed({ backend: "heuristic", reason: "bedrock_error", confidence: null, caseId, turnId });
    return runHeuristic(message);
  }

  const result = await understandWithBedrock(message, config, { client: deps.bedrockClient });
  if (!result.ok) {
    logBackendUsed({ backend: "heuristic", reason: "bedrock_error", confidence: null, caseId, turnId });
    return runHeuristic(message);
  }

  if (result.value.confidence < UNDERSTANDING_CONFIDENCE_THRESHOLD) {
    logBackendUsed({
      backend: "heuristic",
      reason: "low_confidence",
      confidence: result.value.confidence,
      caseId,
      turnId,
    });
    return runHeuristic(message);
  }

  logBackendUsed({ backend: "bedrock", reason: "success", confidence: result.value.confidence, caseId, turnId });
  return {
    language: result.value.language,
    entities: result.value.entities,
    intent: result.value.intent,
  };
}
