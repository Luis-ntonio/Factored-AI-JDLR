/**
 * Contrato canónico de salida de la capa "Understand" (conversation-agent).
 *
 * Este archivo es la FUENTE DE VERDAD del contrato — ver `docs/CONTRACTS.md`
 * para la explicación legible por humanos (por qué vive acá, quién lo
 * consume, ejemplos completos). Si cambias algo acá, actualiza ese doc en el
 * mismo commit; si el `.md` y este archivo alguna vez difieren, este archivo
 * gana.
 *
 * Consumidores:
 *  - policy-agent (`policies.yaml` referencia literalmente los nombres de
 *    `Intent`, las keys de `Entities`, y los valores posibles de
 *    `missing_fields` — no renombres campos sin coordinar).
 *  - retrieval-agent / transaction-agent (fases posteriores) leen `entities`
 *    y `context` para ejecutar la acción ya autorizada por policy-agent.
 *
 * Runtime elegido para conversation-agent: Node.js 20.x + TypeScript (ver
 * docs/CONTRACTS.md, sección "Runtime"). Este paquete se compila a CommonJS
 * y no tiene dependencias externas — cualquier Lambda (Node o incluso un
 * proceso Python vía el JSON Schema equivalente documentado en el .md) puede
 * consumir la FORMA de este contrato aunque no importe este código TS
 * directamente.
 */

/** Idioma detectado para ESTE mensaje individual (no asumido por sesión). */
export type LanguageCode = "es" | "pt";

/**
 * Sub-intención dentro del único flujo soportado
 * ("credit-product info & eligibility").
 *
 * - product_info: preguntas sobre catálogo/condiciones de productos de
 *   crédito (tasas, requisitos, plazos) sin pedir un veredicto de
 *   elegibilidad propio.
 * - eligibility_check: el usuario quiere saber si califica para un producto
 *   (implica que, tarde o temprano, se necesitan los entities de
 *   elegibilidad).
 * - faq: preguntas generales no transaccionales y no específicas de catálogo
 *   (horarios, canales de contacto, qué es una tasa efectiva anual, etc.).
 * - escalation_request: el usuario pide explícitamente hablar con un humano/
 *   agente/representante, independientemente de si hay datos completos.
 * - unknown: no clasificable con confianza suficiente. Debe forzar CLARIFY
 *   aguas abajo (policy-agent) — conversation-agent NUNCA elige un intent
 *   "adivinado" solo para evitar un unknown.
 */
export type Intent =
  | "product_info"
  | "eligibility_check"
  | "faq"
  | "escalation_request"
  | "unknown";

export const INTENTS: readonly Intent[] = [
  "product_info",
  "eligibility_check",
  "faq",
  "escalation_request",
  "unknown",
];

/** Estado laboral declarado por el usuario. */
export type EmploymentStatus =
  | "employed"
  | "self_employed"
  | "unemployed"
  | "retired"
  | "student"
  | "unknown";

export const EMPLOYMENT_STATUSES: readonly EmploymentStatus[] = [
  "employed",
  "self_employed",
  "unemployed",
  "retired",
  "student",
  "unknown",
];

/** Producto de crédito sobre el que pregunta o quiere ser evaluado. */
export type ProductType =
  | "personal_loan"
  | "credit_card"
  | "auto_loan"
  | "mortgage"
  | "unknown";

export const PRODUCT_TYPES: readonly ProductType[] = [
  "personal_loan",
  "credit_card",
  "auto_loan",
  "mortgage",
  "unknown",
];

/**
 * Tipo de documento de identidad, inferido por patrón/idioma del mensaje.
 * Se modela separado de `document_id` (que es el valor crudo) porque
 * policy-agent necesita saber el TIPO para decidir reglas de validación por
 * país (ej. CPF en pt-BR vs. DNI/CC en es-LATAM), y porque el patrón regex
 * de extracción difiere por tipo.
 */
export type DocumentType = "DNI" | "CC" | "CPF" | "RG" | "passport" | "other" | "unknown";

export const DOCUMENT_TYPES: readonly DocumentType[] = [
  "DNI",
  "CC",
  "CPF",
  "RG",
  "passport",
  "other",
  "unknown",
];

/**
 * Slots de entidades acumulados a lo largo de la conversación (context
 * manager). Cada campo es independiente: `null` significa "todavía no
 * provisto por el usuario en ningún turno de este case", NO "usuario
 * respondió que no aplica" (para eso, ver convenciones por campo abajo).
 *
 * IMPORTANTE para policy-agent: estos son los nombres EXACTOS que debe usar
 * `policies.yaml`. No hay alias.
 */
export interface Entities {
  /**
   * Ingreso mensual declarado por el usuario, en la unidad numérica que haya
   * dicho (sin conversión de moneda — ver limitación documentada en
   * docs/CONTRACTS.md: no se resuelve moneda/país automáticamente en esta
   * fase). `null` si no fue mencionado todavía.
   * Ejemplo: 2500
   */
  income: number | null;

  employment_status: EmploymentStatus | null;

  /**
   * Monto de crédito solicitado, mismas limitaciones de moneda que `income`.
   * Ejemplo: 10000
   */
  requested_amount: number | null;

  /**
   * Valor crudo del documento de identidad tal como lo escribió el usuario
   * (dígitos, sin espacios/guiones normalizados aparte de un trim básico).
   * PII — ver docs/CONTRACTS.md sección Security/Reliability sobre manejo:
   * conversation-agent lo persiste en DynamoDB (la tabla existente, sin
   * cifrado a nivel de aplicación en este checkpoint) pero lo excluye de
   * logs estructurados (usa `document_id_masked` en logs, nunca el valor
   * crudo).
   */
  document_id: string | null;

  /** Tipo de documento inferido junto con `document_id`. */
  document_type: DocumentType | null;

  product_type: ProductType | null;

  /**
   * true si el usuario indicó ser cliente existente del banco, false si
   * indicó explícitamente que no lo es, null si no se mencionó.
   */
  existing_customer: boolean | null;
}

/** Entities completamente vacías — útil como valor inicial de un case nuevo. */
export function emptyEntities(): Entities {
  return {
    income: null,
    employment_status: null,
    requested_amount: null,
    document_id: null,
    document_type: null,
    product_type: null,
    existing_customer: null,
  };
}

/** Nombres válidos de campo dentro de `Entities` (para tipar `missing_fields`). */
export type EntityKey = keyof Entities;

export const ENTITY_KEYS: readonly EntityKey[] = [
  "income",
  "employment_status",
  "requested_amount",
  "document_id",
  "document_type",
  "product_type",
  "existing_customer",
];

/**
 * Matriz de entities requeridos por intención, para que policy-agent y
 * conversation-agent calculen `missing_fields` de forma consistente. Vive
 * acá (no solo en policy-agent) porque conversation-agent necesita el mismo
 * criterio para poblar `missing_fields` en su propio output — es el punto de
 * acoplamiento explícito entre ambos agentes, documentado a propósito.
 *
 * policy-agent puede aplicar reglas ADICIONALES más estrictas en
 * `policies.yaml` (ej. exigir document_type además de document_id para
 * ESCALATE de identidad) — esta matriz es el mínimo, no el techo.
 */
export const REQUIRED_ENTITIES_BY_INTENT: Readonly<Record<Intent, readonly EntityKey[]>> = {
  product_info: ["product_type"],
  eligibility_check: [
    "product_type",
    "income",
    "employment_status",
    "requested_amount",
    "document_id",
    "existing_customer",
  ],
  faq: [],
  escalation_request: [],
  unknown: [],
};

/** Motivo de degradación cuando el context manager no pudo leer/escribir estado. */
export type DegradedReason =
  | "dynamodb_read_failed"
  | "dynamodb_write_failed"
  | "internal_error"
  | "none";

/**
 * Metadata de sesión/caso y salud del pipeline para ESTE turno. No es
 * "negocio" (eso vive en `entities`) — es lo que policy-agent y
 * observabilidad necesitan para trazabilidad y para decidir cómo tratar un
 * turno degradado.
 */
export interface UnderstandContext {
  /** Igual al `caseId` usado en `pk = CASE#<caseId>` de la tabla case-store. */
  caseId: string;

  /**
   * Igual al `customerId` usado en `gsi1pk = CUSTOMER#<customerId>`.
   * `null` si el turno todavía no tiene un customer identificado (ej.
   * usuario anónimo antes de dar su documento).
   */
  customerId: string | null;

  /** messageId de ESTE turno (igual al `sk = MSG#<messageId>` que se escribió). */
  turnId: string;

  /**
   * true si esta respuesta se generó sin poder leer y/o escribir el estado
   * persistido en DynamoDB (ver docs/CONTRACTS.md, "Fallback de
   * Reliability"). Cuando es true, conversation-agent puede haber
   * re-preguntado datos que el usuario ya había dado en un turno anterior —
   * policy-agent y observabilidad deben tratar este turno como de menor
   * confianza (ej. no ESCALATE automático solo por esto, pero sí loguear /
   * alertar).
   */
  degraded: boolean;

  /** Motivo de la degradación. "none" cuando `degraded` es false. */
  degradedReason: DegradedReason;

  /** Cantidad de turnos previos (mensajes) considerados al reconstruir el contexto. */
  historyTurns: number;
}

/**
 * Contrato de salida exacto de conversation-agent. Ver docs/CONTRACTS.md
 * para ejemplos completos en ES y PT.
 */
export interface UnderstandOutput {
  intent: Intent;
  language: LanguageCode;
  entities: Entities;
  /** Subconjunto de `ENTITY_KEYS` que sigue faltando para la intención actual. */
  missing_fields: EntityKey[];
  context: UnderstandContext;
}

/**
 * Type guard mínimo, sin dependencias externas, para validar en runtime que
 * un objeto cumple la forma de `UnderstandOutput` antes de pasarlo a
 * policy-agent. No reemplaza un JSON Schema completo; es suficiente para
 * este checkpoint (ver docs/CONTRACTS.md, limitaciones).
 */
export function isUnderstandOutput(value: unknown): value is UnderstandOutput {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;

  if (!INTENTS.includes(v.intent as Intent)) return false;
  if (v.language !== "es" && v.language !== "pt") return false;
  if (!Array.isArray(v.missing_fields)) return false;
  if (!v.missing_fields.every((f) => ENTITY_KEYS.includes(f as EntityKey))) return false;

  if (typeof v.entities !== "object" || v.entities === null) return false;
  const e = v.entities as Record<string, unknown>;
  if (!ENTITY_KEYS.every((k) => k in e)) return false;

  if (typeof v.context !== "object" || v.context === null) return false;
  const c = v.context as Record<string, unknown>;
  if (typeof c.caseId !== "string") return false;
  if (typeof c.turnId !== "string") return false;
  if (typeof c.degraded !== "boolean") return false;

  return true;
}
