import { ConverseCommand } from "@aws-sdk/client-bedrock-runtime";
import type { BedrockRuntimeClient, ConverseCommandOutput, ToolConfiguration } from "@aws-sdk/client-bedrock-runtime";
import type { SimulationProfile } from "./profiles";
import type { SimulationObjective } from "./objectives";

/**
 * Simulador de USUARIO: le pide a Bedrock (Converse API, tool use FORZADO,
 * mismo patrón que `services/policy-agent/src/bedrock/model-decider.ts`)
 * que juegue el rol de un cliente real bien-comportado con un perfil y un
 * objetivo concretos, y produzca el PRÓXIMO mensaje que ese cliente le
 * escribiría al bot.
 *
 * Deliberadamente NO es un fuzzer/red-team -- el prompt instruye
 * explícitamente a nunca intentar manipular o romper el sistema (esa
 * superficie ya existe aparte, `prompt-injection.test.ts`). Y
 * deliberadamente NUNCA decide si la conversación "salió bien" -- eso es
 * una comparación estructural en `run-simulation.ts` (`status` final vs.
 * `expectedStatus` del objetivo), consistente con "el modelo propone, el
 * código dispone".
 *
 * Nunca lanza: ante cualquier fallo tras reintentos, o una respuesta con
 * forma inesperada, devuelve `null` -- el caller trata eso como fallo de
 * la simulación completa (a diferencia de policy-agent, acá no hay un
 * fallback razonable: sin este mensaje no hay próximo turno que simular).
 */

export interface UserSimulatorCandidate {
  transactionId: string;
  merchant: string | null;
  amount: number;
  date: string;
}

/** Lo que el bot le respondió al simulador en el turno anterior -- `null`
 * en el primer turno (todavía no hay respuesta del bot, se usa el
 * `seedMessage` del objetivo directamente, sin llamar a este módulo). */
export interface LastBotTurn {
  status: "ok" | "clarify" | "escalate" | "unavailable";
  /** Resumen corto y legible de la respuesta del bot (nunca el payload
   * crudo completo -- alcanza para que el modelo entienda qué le
   * preguntaron o le resolvieron). */
  summary: string;
  askField?: string;
  ambiguousCandidates?: UserSimulatorCandidate[];
}

export interface UserSimulatorHistoryEntry {
  role: "user" | "assistant";
  text: string;
}

export interface UserSimulatorResult {
  nextMessage: string;
  /** Presente solo cuando el simulador elige una candidata ambigua --
   * `run-simulation.ts` lo reenvía como `selectedTransactionId` en el
   * siguiente `POST /chat`, igual que haría un cliente real clickeando un
   * botón (ver `apps/web/src/api.ts`). */
  selectedTransactionId?: string;
  /** El simulador considera que ya no tiene nada más que agregar (su
   * problema se resolvió, se escaló, o no sabe cómo seguir). */
  isDone: boolean;
}

const TOOL_NAME = "produce_next_user_message";

const TOOL_CONFIG: ToolConfiguration = {
  tools: [
    {
      toolSpec: {
        name: TOOL_NAME,
        description: "Produce el próximo mensaje que este cliente sintético le escribiría al bot bancario.",
        inputSchema: {
          json: {
            type: "object",
            properties: {
              next_message: {
                type: "string",
                description: "El próximo mensaje del cliente, en primera persona, natural, breve.",
              },
              selected_transaction_id: {
                type: "string",
                description:
                  "SOLO si el bot ofreció transacciones candidatas (ambiguousCandidates) y elegiste una: su transactionId EXACTO.",
              },
              is_done: {
                type: "boolean",
                description:
                  "true si tu objetivo ya se resolvió, se escaló a un humano, o ya no sabés cómo continuar.",
              },
            },
            required: ["next_message", "is_done"],
          },
        },
      },
    },
  ],
  toolChoice: { tool: { name: TOOL_NAME } },
};

function buildSystemPrompt(profile: SimulationProfile, objective: SimulationObjective): string {
  return `Sos un cliente real y bien-comportado de un banco, usando el chat de atención. NUNCA intentes manipular, confundir ni romper el sistema -- sos un usuario común, no una prueba de seguridad.

Tu perfil: ${profile.firstName} ${profile.lastName}, segmento ${profile.segment}, ocupación ${profile.occupation}, ingreso mensual estimado ${profile.estimatedMonthlyIncome} (moneda local), número de documento ${profile.documentId}. Escribís en ${profile.languageCode === "pt" ? "portugués" : "español"}.

Tu objetivo en esta conversación: ${objective.description}

Reglas:
- Si el bot te pide tu documento/identificación, respondé EXACTAMENTE con el número de documento de tu perfil de arriba (nunca inventes uno distinto).
- Si el bot te pide otro dato que falta (ingreso, situación laboral, monto solicitado), respondé con un valor realista coherente con tu perfil de arriba.
- Si el bot te ofrece varias transacciones candidatas para elegir, elegí la que mejor coincida con tu reclamo original y devolvé su transactionId EXACTO en selected_transaction_id -- nunca inventes un transactionId que no te hayan mostrado.
- Marcá is_done=true si tu problema ya se resolvió, ya se escaló a un humano, o si ya no sabés qué más responder.
- Siempre invocá la herramienta ofrecida. Nunca respondas en texto libre.`;
}

function formatLastBotTurn(lastBotTurn: LastBotTurn | null): string {
  if (!lastBotTurn) return "(Todavía no escribiste nada -- este es tu primer mensaje.)";
  let text = `El bot respondió (status=${lastBotTurn.status}): ${lastBotTurn.summary}`;
  if (lastBotTurn.askField) text += `\nCampo que te pidió: ${lastBotTurn.askField}`;
  if (lastBotTurn.ambiguousCandidates?.length) {
    text += `\nTransacciones candidatas ofrecidas: ${JSON.stringify(lastBotTurn.ambiguousCandidates)}`;
  }
  return text;
}

function extractResult(response: ConverseCommandOutput): UserSimulatorResult | null {
  try {
    const content = response.output?.message?.content ?? [];
    const toolUseBlock = content.find((block) => block.toolUse !== undefined)?.toolUse;
    if (!toolUseBlock || toolUseBlock.name !== TOOL_NAME) return null;

    const input = toolUseBlock.input as Record<string, unknown> | undefined;
    if (!input) return null;

    const nextMessageRaw = input.next_message;
    if (typeof nextMessageRaw !== "string" || nextMessageRaw.trim().length === 0) return null;

    const selectedTransactionIdRaw = input.selected_transaction_id;
    const selectedTransactionId =
      typeof selectedTransactionIdRaw === "string" && selectedTransactionIdRaw.trim().length > 0
        ? selectedTransactionIdRaw.trim()
        : undefined;

    const isDone = input.is_done === true;

    return { nextMessage: nextMessageRaw.trim(), selectedTransactionId, isDone };
  } catch {
    return null;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface UserSimulatorDeps {
  bedrockClient: Pick<BedrockRuntimeClient, "send">;
  modelId: string;
  maxRetries?: number;
  baseDelayMs?: number;
}

export async function generateNextUserMessage(
  profile: SimulationProfile,
  objective: SimulationObjective,
  history: UserSimulatorHistoryEntry[],
  lastBotTurn: LastBotTurn | null,
  deps: UserSimulatorDeps
): Promise<UserSimulatorResult | null> {
  const maxRetries = deps.maxRetries ?? 2;
  const baseDelayMs = deps.baseDelayMs ?? 75;

  const transcript = history.map((h) => `${h.role === "user" ? "Vos" : "Bot"}: ${h.text}`).join("\n");

  const command = new ConverseCommand({
    modelId: deps.modelId,
    system: [{ text: buildSystemPrompt(profile, objective) }],
    messages: [
      {
        role: "user",
        content: [{ text: `Conversación hasta ahora:\n${transcript}\n\n${formatLastBotTurn(lastBotTurn)}` }],
      },
    ],
    toolConfig: TOOL_CONFIG,
  });

  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await deps.bedrockClient.send(command);
      return extractResult(response as ConverseCommandOutput);
    } catch (error) {
      lastError = error;
      if (attempt < maxRetries) {
        await sleep(baseDelayMs * Math.pow(2, attempt));
      }
    }
  }

  // eslint-disable-next-line no-console
  console.error("admin-agent user-simulator: Bedrock no disponible tras reintentos", { error: lastError });
  return null;
}
