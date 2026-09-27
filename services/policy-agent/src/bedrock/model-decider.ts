import { ConverseCommand } from "@aws-sdk/client-bedrock-runtime";
import type {
  BedrockRuntimeClient,
  ConverseCommandOutput,
  ToolConfiguration,
} from "@aws-sdk/client-bedrock-runtime";
import type { EligibilityResult, UnderstandOutput } from "@banking-agent/shared";
import type { Decision } from "../types";

/**
 * Cliente que invoca Amazon Bedrock (Converse API, tool use FORZADO) para
 * obtener una PROPUESTA de decisión de riesgo del modelo, como segunda
 * opinión independiente de `evaluatePreAction`/`evaluatePostAction`
 * (`../evaluator.ts`, SIN modificar).
 *
 * IMPORTANTE (decisión de arquitectura confirmada por el usuario, ver
 * `../bedrock/guardrail.ts` para la cita completa): "el modelo decide, pero
 * policies.yaml corre igual después como guardrail... El modelo propone, el
 * código dispone." Este archivo es la mitad "el modelo propone" — nunca
 * decide nada por sí mismo, solo produce una propuesta que `guardrail.ts`
 * combina con el resultado del evaluador determinístico.
 *
 * Reliability: esta función NUNCA lanza. Ante cualquier fallo (Bedrock no
 * disponible, error de red, respuesta sin tool use, `decision` fuera del
 * enum válido) devuelve `null` ("propuesta no disponible"), nunca coacciona
 * a un valor por default -- a diferencia de conversation-agent (que sí
 * puede permitirse un fallback heurístico para clasificación de intención),
 * acá el resultado alimenta una decisión de riesgo: es más seguro descartar
 * la propuesta del modelo por completo que arriesgar una interpretación
 * incorrecta de una respuesta ambigua. El guardrail (`guardrail.ts`) ya
 * garantiza que `null` se trata como "usar solo el evaluador de reglas", el
 * mismo comportamiento que existía antes de esta integración.
 */

export type DecisionStage = "pre_action" | "post_action";

export interface ModelProposal {
  decision: Decision;
  /** 0-1, informativo/auditoría -- NUNCA participa en la comparación de
   * severidad del guardrail (esa comparación es únicamente `decision` vs.
   * `decision`, ver `guardrail.ts`). */
  confidence: number;
  reasoning: string;
}

const VALID_DECISIONS: readonly Decision[] = ["AUTO", "CLARIFY", "ESCALATE"];

const DECISION_TOOL_NAME = "propose_policy_decision";

/** Tool schema con tool use FORZADO -- el modelo SIEMPRE debe invocar esta
 * herramienta con una `decision` tipada (enum), nunca devolver texto libre
 * que haya que parsear/adivinar. */
const TOOL_CONFIG: ToolConfiguration = {
  tools: [
    {
      toolSpec: {
        name: DECISION_TOOL_NAME,
        description:
          "Propone una decisión de política (AUTO, CLARIFY o ESCALATE) para el caso recibido, con tu nivel de confianza y una razón breve.",
        inputSchema: {
          json: {
            type: "object",
            properties: {
              decision: {
                type: "string",
                enum: ["AUTO", "CLARIFY", "ESCALATE"],
                description:
                  "AUTO = resolver automáticamente sin intervención humana. CLARIFY = pedir un dato más al usuario, no ejecutar ninguna acción. ESCALATE = requiere revisión humana antes de continuar.",
              },
              confidence: {
                type: "number",
                minimum: 0,
                maximum: 1,
                description: "Nivel de confianza propio en esta decisión, de 0 (mínima) a 1 (máxima).",
              },
              reasoning: {
                type: "string",
                description: "Razón breve (1-2 oraciones) de por qué elegiste esta decisión.",
              },
            },
            required: ["decision", "confidence", "reasoning"],
          },
        },
      },
    },
  ],
  toolChoice: { tool: { name: DECISION_TOOL_NAME } },
};

/**
 * Prompt de sistema. Deliberadamente NO pega el contenido de policies.yaml
 * -- el modelo debe proponer una decisión razonable con su propio criterio
 * de riesgo/negocio general, no imitar el YAML. El guardrail determinístico
 * es justamente lo que garantiza que la política real se respete pase lo
 * que pase, así que no hace falta (ni conviene) que el modelo la conozca al
 * detalle.
 */
function buildSystemPrompt(stage: DecisionStage): string {
  const common = `Sos el motor de decisión de riesgo de un agente bancario de IA para el flujo de información de productos de crédito y elegibilidad. Tu única tarea es proponer UNA decisión sobre cómo continuar con la solicitud del usuario, usando tu propio criterio de riesgo/negocio general -- no estás imitando ni memorizando un archivo de reglas interno, tu propuesta es una segunda opinión independiente que después se combina con una política determinística separada.

Elegí exactamente una de estas tres decisiones:
- AUTO: hay datos suficientes, es de bajo riesgo, se puede resolver automáticamente sin intervención humana.
- CLARIFY: falta información o la solicitud es ambigua; hay que pedirle al usuario un dato adicional antes de continuar. No se ejecuta ninguna acción.
- ESCALATE: la solicitud está fuera de alcance normal, implica alto riesgo, o requiere autorización/revisión humana antes de continuar.

Reglas de desempate que debés aplicar vos mismo al elegir:
- Si dudás entre AUTO y CLARIFY, elegí CLARIFY.
- Si dudás entre CLARIFY y ESCALATE, elegí ESCALATE.

Siempre invocá la herramienta ofrecida con tu decisión, tu nivel de confianza (0 a 1) y una razón breve. Nunca respondas en texto libre.`;

  if (stage === "pre_action") {
    return `${common}

El objeto que vas a recibir es un "UnderstandOutput": la interpretación que ya hizo otro agente del mensaje del usuario, ANTES de autorizar cualquier acción. Campos relevantes:
- intent: qué quiere el usuario (product_info, eligibility_check, faq, escalation_request, unknown).
- entities: datos que el usuario ya dio (ingreso, estado laboral, monto solicitado, documento de identidad, tipo de producto, si es cliente existente, etc.) -- un campo en null significa que todavía no se proveyó.
- missing_fields: qué datos requeridos todavía faltan para el intent actual.
- context: metadata del turno (por ejemplo si hubo un problema de infraestructura al leer el historial, o cuántos turnos previos hay).`;
  }

  return `${common}

El objeto que vas a recibir es un "EligibilityResult": el resultado numérico ya calculado de una evaluación de elegibilidad crediticia para este usuario (no es el mensaje original del usuario). Campos relevantes:
- productType: el producto de crédito evaluado.
- eligibility_score: puntaje de elegibilidad en escala 0-100.
- score_zone: zona de riesgo derivada del score ("approved", "borderline", "declined"). Un score en zona límite ("borderline") normalmente amerita revisión humana antes de comunicar el resultado al usuario.`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Extrae y valida defensivamente la propuesta del `toolUse` de la
 * respuesta de Bedrock. `null` ante cualquier forma inesperada -- incluida
 * una `decision` fuera de `VALID_DECISIONS` (ver nota de Reliability en el
 * docstring del archivo: nunca coaccionamos a un default). */
function extractProposal(response: ConverseCommandOutput): ModelProposal | null {
  try {
    const content = response.output?.message?.content ?? [];
    const toolUseBlock = content.find((block) => block.toolUse !== undefined)?.toolUse;
    if (!toolUseBlock || toolUseBlock.name !== DECISION_TOOL_NAME) return null;

    const input = toolUseBlock.input as Record<string, unknown> | undefined;
    if (!input) return null;

    const decision = input.decision;
    if (typeof decision !== "string" || !VALID_DECISIONS.includes(decision as Decision)) {
      return null;
    }

    const confidenceRaw = input.confidence;
    const confidence =
      typeof confidenceRaw === "number" && Number.isFinite(confidenceRaw)
        ? Math.min(1, Math.max(0, confidenceRaw))
        : 0;

    const reasoningRaw = input.reasoning;
    const reasoning = typeof reasoningRaw === "string" ? reasoningRaw.trim() : "";

    return { decision: decision as Decision, confidence, reasoning };
  } catch {
    return null;
  }
}

export interface ModelDeciderDeps {
  /** Inyectable para tests -- en runtime real, `../bedrock/config.ts`
   * construye un `BedrockRuntimeClient` real a partir de la región leída de
   * SSM. Tipado con `Pick<..., "send">` para poder inyectar un mock sin
   * heredar de la clase real del SDK. */
  bedrockClient: Pick<BedrockRuntimeClient, "send">;
  modelId: string;
  /** Reintentos acotados con backoff corto -- mismo patrón que
   * `services/conversation-agent/src/context/state-store.ts`
   * (`withRetry`): 2 reintentos por defecto, backoff `baseDelayMs * 2^attempt`. */
  maxRetries?: number;
  baseDelayMs?: number;
}

/**
 * Pide al modelo una propuesta de decisión para `input` (un
 * `UnderstandOutput` completo si `stage === "pre_action"`, o un
 * `EligibilityResult` completo si `stage === "post_action"`). Nunca lanza:
 * ante cualquier fallo tras agotar los reintentos, o una respuesta con
 * `decision` inválida, devuelve `null` ("no disponible").
 */
export async function proposeModelDecision(
  input: UnderstandOutput | EligibilityResult,
  stage: DecisionStage,
  deps: ModelDeciderDeps
): Promise<ModelProposal | null> {
  const maxRetries = deps.maxRetries ?? 2;
  const baseDelayMs = deps.baseDelayMs ?? 75;

  const command = new ConverseCommand({
    modelId: deps.modelId,
    system: [{ text: buildSystemPrompt(stage) }],
    messages: [
      {
        role: "user",
        content: [{ text: JSON.stringify(input) }],
      },
    ],
    toolConfig: TOOL_CONFIG,
  });

  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await deps.bedrockClient.send(command);
      return extractProposal(response as ConverseCommandOutput);
    } catch (error) {
      lastError = error;
      if (attempt < maxRetries) {
        await sleep(baseDelayMs * Math.pow(2, attempt));
      }
    }
  }

  // eslint-disable-next-line no-console
  console.error("policy-agent model-decider: Bedrock no disponible tras reintentos", { error: lastError });
  return null;
}
