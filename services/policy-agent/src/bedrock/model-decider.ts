import { ConverseCommand } from "@aws-sdk/client-bedrock-runtime";
import type {
  BedrockRuntimeClient,
  ConverseCommandOutput,
  ToolConfiguration,
} from "@aws-sdk/client-bedrock-runtime";
import type { DisputeVerificationResult, EligibilityResult, UnderstandOutput } from "@banking-agent/shared";
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
  /** Uso real de tokens reportado por Bedrock (`ConverseResponse.usage`) --
   * puramente informativo/auditoría (mismo criterio que `confidence`), usado
   * por `scripts/evaluate-decide-stage.ts` para el reporte de costo real
   * (no una estimación por caracteres). `undefined` si la respuesta no trae
   * `usage` (nunca debería pasar en runtime real, pero no se asume). */
  tokenUsage?: { inputTokens: number; outputTokens: number };
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
  const common = `Sos el motor de decisión de riesgo de un agente bancario de IA. Este agente atiende DOS flujos distintos -- información de productos de crédito y elegibilidad, y disputa/desconocimiento de cargos -- y vos evaluás casos de cualquiera de los dos, según la forma del objeto que recibas (se te indica abajo cómo distinguirlos). Tu única tarea es proponer UNA decisión sobre cómo continuar con la solicitud del usuario, usando tu propio criterio de riesgo/negocio general -- no estás imitando ni memorizando un archivo de reglas interno, tu propuesta es una segunda opinión independiente que después se combina con una política determinística separada.

Elegí exactamente una de estas tres decisiones:
- AUTO: hay datos suficientes, es de bajo riesgo, se puede resolver automáticamente sin intervención humana.
- CLARIFY: falta información o la solicitud es ambigua; hay que pedirle al usuario un dato adicional antes de continuar. No se ejecuta ninguna acción.
- ESCALATE: la solicitud está fuera de alcance normal, implica alto riesgo, o requiere autorización/revisión humana antes de continuar.

Reglas de desempate que debés aplicar vos mismo al elegir:
- Si dudás entre AUTO y CLARIFY, elegí CLARIFY.
- Si dudás entre CLARIFY y ESCALATE, elegí ESCALATE.
Estas reglas de desempate son para AMBIGÜEDAD real sobre el riesgo del caso -- nunca uses ESCALATE solo porque el objeto recibido no coincide con la forma que esperabas: si ves campos que no reconocés, primero fijate si coinciden con alguna de las formas descritas abajo antes de asumir que el caso es riesgoso.

Siempre invocá la herramienta ofrecida con tu decisión, tu nivel de confianza (0 a 1) y una razón breve. Nunca respondas en texto libre.`;

  if (stage === "pre_action") {
    return `${common}

El objeto que vas a recibir es un "UnderstandOutput": la interpretación que ya hizo otro agente del mensaje del usuario, ANTES de autorizar cualquier acción. Campos relevantes:
- intent: qué quiere el usuario (product_info, eligibility_check, faq, dispute_unrecognized_charge, escalation_request, unknown).
- entities: datos que el usuario ya dio. Para eligibility_check/product_info: ingreso, estado laboral, monto solicitado, documento de identidad, tipo de producto, si es cliente existente, etc. Para dispute_unrecognized_charge: disputed_amount (monto del cargo que el usuario no reconoce), merchant (comercio donde se hizo el cargo), transaction_date (fecha aproximada del cargo, texto libre tipo "ayer"/"la semana pasada" -- SOLO informativo, el sistema real busca la transacción por monto/comercio, nunca por esta fecha, así que una fecha vaga NUNCA es motivo para pedir un dato más preciso ni para dudar del caso), dispute_reason (por qué el usuario dice que no lo reconoce). Un campo en null significa que todavía no se proveyó.
- missing_fields: qué datos requeridos todavía faltan para el intent actual -- esta es la única fuente confiable de "qué falta"; si está vacío, no falta nada, sin importar qué tan vago te parezca algún dato individual como transaction_date.
- context: metadata del turno (por ejemplo si hubo un problema de infraestructura al leer el historial, o cuántos turnos previos hay).`;
  }

  return `${common}

El objeto que vas a recibir es el resultado YA CALCULADO de una acción bancaria (no es el mensaje original del usuario), de UNA de estas dos formas posibles -- fijate qué campos están presentes para saber cuál es:

1. "EligibilityResult" (evaluación de elegibilidad crediticia): tiene los campos productType (el producto de crédito evaluado), eligibility_score (puntaje 0-100) y score_zone (zona de riesgo derivada del score: "approved", "borderline", "declined"). Un score en zona límite ("borderline") normalmente amerita revisión humana antes de comunicar el resultado al usuario.

2. "DisputeVerificationResult" (verificación de una disputa de cargo): tiene los campos transactionFound (si se localizó exactamente la transacción que el usuario disputa), fraudSuspected (si esa transacción tiene indicios reales de fraude), productBlocked (si ya se bloqueó preventivamente la tarjeta asociada), opcionalmente transactionId, y opcionalmente ambiguousCandidates (lista de 2 o más transacciones reales del cliente que podrían ser la disputada, cuando el sistema no pudo elegir una sola con confianza). Como criterio de riesgo general: sospecha de fraude (fraudSuspected: true) amerita revisión humana. No encontrar NINGUNA transacción real (transactionFound: false Y ambiguousCandidates ausente o vacío) también amerita revisión humana. En cambio, transactionFound: false CON ambiguousCandidates no vacío es un caso distinto y MENOS severo: el sistema sí encontró transacciones reales del cliente, solo no puede elegir una sola por sí solo -- la respuesta correcta es CLARIFY (pedirle al cliente que confirme cuál de esas candidatas reales es la correcta), nunca ESCALATE, y nunca lo trates igual que "no se encontró nada". transactionFound: true con fraudSuspected: false es el caso de bajo riesgo por excelencia de este flujo -- en ese caso, productBlocked: true es simplemente la acción preventiva ESTÁNDAR, reversible y de bajo riesgo que ya se ejecutó (bloquear la tarjeta mientras se resuelve la disputa, igual que cualquier banco hace de forma rutinaria y automática ante un cargo no reconocido confirmado), NO una señal adicional de riesgo que amerite escalar -- no la trates como si fuera un bloqueo definitivo o una decisión de alto impacto todavía pendiente de aprobar.`;
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

    const usage = response.usage;
    const tokenUsage =
      typeof usage?.inputTokens === "number" && typeof usage?.outputTokens === "number"
        ? { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens }
        : undefined;

    return { decision: decision as Decision, confidence, reasoning, tokenUsage };
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
 * `EligibilityResult`/`DisputeVerificationResult` completo si
 * `stage === "post_action"` -- cuál de los dos depende del intent que
 * originó el caso, ver `buildSystemPrompt`). Nunca lanza: ante cualquier
 * fallo tras agotar los reintentos, o una respuesta con `decision` inválida,
 * devuelve `null` ("no disponible").
 */
export async function proposeModelDecision(
  input: UnderstandOutput | EligibilityResult | DisputeVerificationResult,
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
