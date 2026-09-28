import { BedrockRuntimeClient, ConverseCommand, ConverseCommandOutput } from "@aws-sdk/client-bedrock-runtime";
import {
  DISPUTE_REASONS,
  DOCUMENT_TYPES,
  DisputeReason,
  DocumentType,
  EMPLOYMENT_STATUSES,
  EmploymentStatus,
  Entities,
  INTENTS,
  Intent,
  LanguageCode,
  PRODUCT_TYPES,
  ProductType,
  emptyEntities,
} from "@banking-agent/shared";
import { BedrockConfig } from "./ssm-config";

/**
 * Backend "Understand" respaldado por Bedrock (Converse API con tool use
 * forzado — nunca prosa libre). El modelo decide intent/idioma/entities,
 * pero SIEMPRE dentro de los enums exactos del contrato `UnderstandOutput`
 * de `@banking-agent/shared` (decisión de arquitectura "Jev" confirmada por
 * el usuario): tool schema con `enum` en cada campo + validación/coerción
 * defensiva de la respuesta (nunca se confía ciegamente en que el modelo
 * respetó el schema).
 *
 * Esta función NUNCA lanza: cualquier fallo (red, throttle, parseo,
 * validación) devuelve `{ ok: false }` para que el orquestador
 * (`understand-backend.ts`) haga fallback a la heurística existente.
 */

const TOOL_NAME = "record_understanding";

/**
 * `confidence` es un dato INTERNO de este pipeline (para decidir fallback a
 * heurística) — nunca se agrega al contrato público `UnderstandOutput`.
 */
export interface BedrockUnderstanding {
  intent: Intent;
  language: LanguageCode;
  entities: Entities;
  confidence: number;
}

export type BedrockUnderstandResult = { ok: true; value: BedrockUnderstanding } | { ok: false };

export interface BedrockUnderstanderOptions {
  /** Cliente inyectable para tests (mock) — en Lambda real se construye desde @aws-sdk. */
  client?: BedrockRuntimeClient;
  maxRetries?: number;
  baseDelayMs?: number;
}

/**
 * Prompt de sistema: contexto del dominio (idéntico en intención a los
 * comentarios de `packages/shared/src/contracts/understand-output.ts`, para
 * que el modelo clasifique con el mismo criterio que la heurística) y regla
 * explícita de "nunca inventar" entities no mencionadas.
 */
const SYSTEM_PROMPT = `Sos el clasificador de la capa "Understand" de un agente bancario, en español (es) o portugués (pt) de Latinoamérica/Brasil. Cubrís dos flujos: "credit-product info & eligibility" (información de productos de crédito y verificación de elegibilidad) y "transaction-dispute intake" (el cliente reporta un cargo/transacción que no reconoce o considera indebido).

Tu única tarea es clasificar el ÚLTIMO mensaje del usuario llamando a la tool "${TOOL_NAME}" con:

1. "intent" (una de estas 6 opciones exactas):
   - "product_info": preguntas sobre catálogo/condiciones de productos de crédito (tasas, requisitos, plazos) SIN pedir un veredicto de elegibilidad propio.
   - "eligibility_check": el usuario quiere saber si califica/es elegible para un producto.
   - "faq": preguntas generales no transaccionales y no específicas de catálogo (horarios, canales de contacto, qué es una tasa efectiva anual, etc.).
   - "escalation_request": el usuario pide explícitamente hablar con un humano/agente/representante, sin importar si también hay datos de negocio en el mensaje. Esta intención SIEMPRE gana si está presente.
   - "dispute_unrecognized_charge": el usuario reporta un cargo/cobro/transacción en su cuenta o tarjeta que NO reconoce, que no hizo, o que considera duplicado/indebido/cobrado de más. Esta intención gana sobre "product_info" y "eligibility_check" aunque el mensaje también mencione una tarjeta/producto (ej. "no reconozco un cargo en mi tarjeta de crédito" es "dispute_unrecognized_charge", NO "product_info").
   - "unknown": no hay señal suficiente para clasificar con confianza. NUNCA "adivines" un intent solo para evitar unknown.

2. "language": "es" o "pt", el idioma de ESTE mensaje (no asumas el idioma de mensajes anteriores).

3. "entities": SOLO lo que el usuario mencionó EXPLÍCITAMENTE en este mensaje. Si un dato no fue mencionado, su valor debe ser null — NUNCA inventes, infieras o asumas un valor no dicho por el usuario. Campos:
   - "income": ingreso mensual declarado (número) o null.
   - "employment_status": "employed" | "self_employed" | "unemployed" | "retired" | "student" | null.
   - "requested_amount": monto de crédito solicitado (número) o null.
   - "document_id": el valor crudo del documento de identidad tal como lo escribió el usuario, o null.
   - "document_type": "DNI" | "CC" | "CPF" | "RG" | "passport" | "other" | null (según el documento mencionado; si no hay documento, null).
   - "product_type": "personal_loan" | "credit_card" | "auto_loan" | "mortgage" | null.
   - "existing_customer": true si el usuario indicó ser cliente existente, false si indicó explícitamente que no lo es, null si no lo mencionó.
   - "disputed_amount": monto del cargo/transacción disputada (número) o null. Solo relevante para "dispute_unrecognized_charge", pero completalo si el usuario lo mencionó sin importar el intent detectado.
   - "merchant": nombre del comercio/establecimiento tal como lo escribió el usuario (texto libre, sin normalizar), o null si no lo mencionó.
   - "transaction_date": fecha aproximada de la transacción disputada, como TEXTO LIBRE tal como la dijo el usuario (ej. "ayer", "la semana pasada", "el 3 de marzo") — NUNCA la conviertas a un formato de fecha/ISO, solo copiá la frase. null si no la mencionó.
   - "dispute_reason": "unrecognized_charge" si el usuario dice que no reconoce el cargo o no hizo la compra/transacción; "duplicate_or_overcharge" si dice que le cobraron de más, duplicado, o que el cobro es indebido; null si no hay señal clara. NUNCA uses "other" — esa categoría es exclusiva de una fase posterior, no la asignes vos.

4. "confidence": un número entre 0 y 1 que refleje qué tan seguro estás de esta clasificación completa (intent + language + entities). Usá valores bajos (< 0.5) si el mensaje es ambiguo, muy corto, o no tenés certeza.

Respondé SIEMPRE llamando a la tool, nunca con texto libre.`;

// Sin tipo de retorno explícito a propósito: el JSON Schema del tool debe
// ser estructuralmente asignable al `DocumentType` recursivo de
// @smithy/types (`null | boolean | number | string | DocumentType[] | {
// [key: string]: DocumentType }`) que espera `ToolInputSchema.json` — una
// anotación `Record<string, unknown>` rompe esa asignabilidad porque
// `unknown` es más ancho que `DocumentType`.
function buildInputSchema() {
  return {
    type: "object",
    properties: {
      intent: { type: "string", enum: [...INTENTS] },
      language: { type: "string", enum: ["es", "pt"] },
      entities: {
        type: "object",
        properties: {
          income: { type: ["number", "null"] },
          employment_status: { type: ["string", "null"], enum: [...EMPLOYMENT_STATUSES, null] },
          requested_amount: { type: ["number", "null"] },
          document_id: { type: ["string", "null"] },
          document_type: { type: ["string", "null"], enum: [...DOCUMENT_TYPES, null] },
          product_type: { type: ["string", "null"], enum: [...PRODUCT_TYPES, null] },
          existing_customer: { type: ["boolean", "null"] },
          disputed_amount: { type: ["number", "null"] },
          merchant: { type: ["string", "null"] },
          transaction_date: { type: ["string", "null"] },
          dispute_reason: { type: ["string", "null"], enum: [...DISPUTE_REASONS, null] },
        },
        required: [
          "income",
          "employment_status",
          "requested_amount",
          "document_id",
          "document_type",
          "product_type",
          "existing_customer",
          "disputed_amount",
          "merchant",
          "transaction_date",
          "dispute_reason",
        ],
      },
      confidence: { type: "number", minimum: 0, maximum: 1 },
    },
    required: ["intent", "language", "entities", "confidence"],
  };
}

function buildCommand(modelId: string, message: string): ConverseCommand {
  return new ConverseCommand({
    modelId,
    system: [{ text: SYSTEM_PROMPT }],
    messages: [{ role: "user", content: [{ text: message }] }],
    toolConfig: {
      tools: [
        {
          toolSpec: {
            name: TOOL_NAME,
            description:
              "Registra la clasificación estructurada (intent, idioma, entities, confianza) del último mensaje del usuario.",
            inputSchema: { json: buildInputSchema() },
          },
        },
      ],
      toolChoice: { tool: { name: TOOL_NAME } },
    },
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Reintentos acotados con backoff corto, mismo patrón que `withRetry` de
 * `context/state-store.ts` (2 reintentos, `baseDelayMs * 2^attempt`, nunca
 * lanza). Duplicado deliberadamente acá (en vez de importarlo) para no tocar
 * `state-store.ts` ni acoplar dos módulos que no comparten dominio.
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number,
  baseDelayMs: number
): Promise<{ ok: true; value: T } | { ok: false; error: unknown }> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const value = await fn();
      return { ok: true, value };
    } catch (error) {
      lastError = error;
      if (attempt < maxRetries) {
        await sleep(baseDelayMs * Math.pow(2, attempt));
      }
    }
  }
  return { ok: false, error: lastError };
}

function coerceIntent(raw: unknown): { value: Intent; valid: boolean } {
  if (typeof raw === "string" && (INTENTS as readonly string[]).includes(raw)) {
    return { value: raw as Intent, valid: true };
  }
  return { value: "unknown", valid: false };
}

function coerceLanguage(raw: unknown): { value: LanguageCode; valid: boolean } {
  if (raw === "es" || raw === "pt") {
    return { value: raw, valid: true };
  }
  // Mismo default documentado que la heurística (language-detector.ts):
  // "es" como default final ante ambigüedad. No importa demasiado el valor
  // exacto acá porque, al ser inválido, forzamos confidence efectivo a 0
  // más abajo (fallback completo a heurística).
  return { value: "es", valid: false };
}

function coerceEnumOrNull<T extends string>(raw: unknown, validValues: readonly T[]): { value: T | null; valid: boolean } {
  if (raw === null || raw === undefined) {
    return { value: null, valid: true };
  }
  if (typeof raw === "string" && (validValues as readonly string[]).includes(raw)) {
    return { value: raw as T, valid: true };
  }
  return { value: null, valid: false };
}

function coerceNumberOrNull(raw: unknown): { value: number | null; valid: boolean } {
  if (raw === null || raw === undefined) {
    return { value: null, valid: true };
  }
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return { value: raw, valid: true };
  }
  return { value: null, valid: false };
}

function coerceStringOrNull(raw: unknown): { value: string | null; valid: boolean } {
  if (raw === null || raw === undefined) {
    return { value: null, valid: true };
  }
  if (typeof raw === "string") {
    return { value: raw, valid: true };
  }
  return { value: null, valid: false };
}

function coerceBooleanOrNull(raw: unknown): { value: boolean | null; valid: boolean } {
  if (raw === null || raw === undefined) {
    return { value: null, valid: true };
  }
  if (typeof raw === "boolean") {
    return { value: raw, valid: true };
  }
  return { value: null, valid: false };
}

/**
 * Valida/coerciona defensivamente el tool call de vuelta de Bedrock, sin
 * confiar ciegamente en que el modelo respetó el JSON Schema del tool (a
 * pesar de `toolChoice` forzado, puede alucinar un valor fuera de enum).
 *
 * Regla: cualquier campo fuera de su enum válido se coerciona a un valor
 * seguro (`intent` inválido -> "unknown"; enum de entity inválido -> null;
 * nunca se propaga el string crudo no tipado) y, si CUALQUIER campo fue
 * inválido, el `confidence` efectivo se pisa a 0 para forzar fallback
 * completo a heurística en ese turno — más seguro que confiar parcialmente
 * en una respuesta que ya mostró no respetar el contrato.
 */
function coerceToolInput(raw: Record<string, unknown>): BedrockUnderstanding {
  let allValid = true;

  const intentResult = coerceIntent(raw.intent);
  allValid = allValid && intentResult.valid;

  const languageResult = coerceLanguage(raw.language);
  allValid = allValid && languageResult.valid;

  const rawEntities = (typeof raw.entities === "object" && raw.entities !== null ? raw.entities : {}) as Record<
    string,
    unknown
  >;
  if (typeof raw.entities !== "object" || raw.entities === null) {
    allValid = false;
  }

  const entities: Entities = emptyEntities();

  const income = coerceNumberOrNull(rawEntities.income);
  entities.income = income.value;
  allValid = allValid && income.valid;

  const employmentStatus = coerceEnumOrNull<EmploymentStatus>(rawEntities.employment_status, EMPLOYMENT_STATUSES);
  entities.employment_status = employmentStatus.value;
  allValid = allValid && employmentStatus.valid;

  const requestedAmount = coerceNumberOrNull(rawEntities.requested_amount);
  entities.requested_amount = requestedAmount.value;
  allValid = allValid && requestedAmount.valid;

  const documentId = coerceStringOrNull(rawEntities.document_id);
  entities.document_id = documentId.value;
  allValid = allValid && documentId.valid;

  const documentType = coerceEnumOrNull<DocumentType>(rawEntities.document_type, DOCUMENT_TYPES);
  entities.document_type = documentType.value;
  allValid = allValid && documentType.valid;

  const productType = coerceEnumOrNull<ProductType>(rawEntities.product_type, PRODUCT_TYPES);
  entities.product_type = productType.value;
  allValid = allValid && productType.valid;

  const existingCustomer = coerceBooleanOrNull(rawEntities.existing_customer);
  entities.existing_customer = existingCustomer.value;
  allValid = allValid && existingCustomer.valid;

  const disputedAmount = coerceNumberOrNull(rawEntities.disputed_amount);
  entities.disputed_amount = disputedAmount.value;
  allValid = allValid && disputedAmount.valid;

  const merchant = coerceStringOrNull(rawEntities.merchant);
  entities.merchant = merchant.value;
  allValid = allValid && merchant.valid;

  const transactionDate = coerceStringOrNull(rawEntities.transaction_date);
  entities.transaction_date = transactionDate.value;
  allValid = allValid && transactionDate.valid;

  const disputeReason = coerceEnumOrNull<DisputeReason>(rawEntities.dispute_reason, DISPUTE_REASONS);
  entities.dispute_reason = disputeReason.value;
  allValid = allValid && disputeReason.valid;

  const rawConfidence = raw.confidence;
  const confidence =
    typeof rawConfidence === "number" && Number.isFinite(rawConfidence)
      ? Math.min(1, Math.max(0, rawConfidence))
      : 0;

  return {
    intent: intentResult.value,
    language: languageResult.value,
    entities,
    // Cualquier campo inválido -> confidence efectivo 0, sin importar lo que
    // haya dicho el modelo, para forzar fallback completo a heurística.
    confidence: allValid ? confidence : 0,
  };
}

function extractToolInput(response: ConverseCommandOutput): Record<string, unknown> | null {
  const content = response.output?.message?.content;
  if (!content) return null;
  for (const block of content) {
    if (block.toolUse && block.toolUse.name === TOOL_NAME) {
      const input = block.toolUse.input;
      if (typeof input === "object" && input !== null) {
        return input as Record<string, unknown>;
      }
    }
  }
  return null;
}

export async function understandWithBedrock(
  message: string,
  config: BedrockConfig,
  options: BedrockUnderstanderOptions = {}
): Promise<BedrockUnderstandResult> {
  const client = options.client ?? new BedrockRuntimeClient({ region: config.region });
  const maxRetries = options.maxRetries ?? 2;
  const baseDelayMs = options.baseDelayMs ?? 75;

  const retryResult = await withRetry(
    () => client.send(buildCommand(config.modelId, message)),
    maxRetries,
    baseDelayMs
  );

  if (!retryResult.ok) {
    return { ok: false };
  }

  try {
    const toolInput = extractToolInput(retryResult.value);
    if (!toolInput) {
      return { ok: false };
    }
    return { ok: true, value: coerceToolInput(toolInput) };
  } catch {
    return { ok: false };
  }
}
