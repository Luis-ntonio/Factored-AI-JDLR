/**
 * Tipos del evaluador de policies.yaml.
 *
 * IMPORTANTE (ver README.md de este paquete): este código NO fue compilado
 * ni ejecutado por el autor (policy-agent no tiene acceso a un shell en este
 * checkpoint). El reviewer debe correr `npm install && npm run build &&
 * npm test` en este workspace antes de dar esta pieza por válida.
 *
 * Los nombres de campo que puede referenciar `field:` en policies.yaml (para
 * stage: pre_action) son rutas literales sobre un `UnderstandOutput` tal
 * como lo define `packages/shared/src/contracts/understand-output.ts` — ver
 * ese archivo para la fuente de verdad de los nombres.
 */

export type Decision = "AUTO" | "CLARIFY" | "ESCALATE";

export const SEVERITY_ORDER: Record<Decision, number> = {
  AUTO: 0,
  CLARIFY: 1,
  ESCALATE: 2,
};

export type ConditionOp =
  | "eq"
  | "neq"
  | "in"
  | "not_in"
  | "empty"
  | "not_empty"
  | "gt"
  | "gte"
  | "lt"
  | "lte";

/** Condición hoja: compara un campo (dot-path) contra un valor literal o una
 * referencia a `config.<key>` en policies.yaml. Nunca es código arbitrario
 * (no hay `eval`) — deliberado para que el YAML sea seguro de cargar y de
 * auditar sin ejecutar nada. */
export interface LeafCondition {
  field: string;
  op: ConditionOp;
  value?: unknown;
  value_ref?: string;
}

export interface GroupAll {
  all: Condition[];
}

export interface GroupAny {
  any: Condition[];
}

export interface GroupNot {
  not: Condition;
}

export type Condition = LeafCondition | GroupAll | GroupAny | GroupNot;

export type Stage = "pre_action" | "post_action";

export interface PolicyRule {
  id: string;
  stage: Stage;
  when: Condition;
  decision: Decision;
  /** Texto ESTÁTICO, nunca interpolado con valores crudos de `entities` —
   * ver policies.yaml sección `security` (regla sec-no-raw-pii-in-reason). */
  reason: string;
  /** Campo único a preguntar si esta regla CLARIFY gana. */
  ask_field?: string;
  /** Lista de prioridad de campos a preguntar (se cruza contra
   * `missing_fields` del turno) si esta regla CLARIFY gana. */
  ask_field_priority?: string[];
}

export interface PolicyFile {
  version: number;
  meta?: Record<string, unknown>;
  evaluation_semantics?: Record<string, unknown>;
  security?: Record<string, unknown>;
  config: Record<string, number | string>;
  rules: PolicyRule[];
  post_action_contract_status?: string;
  post_action_rules?: PolicyRule[];
}

export interface MatchedRule {
  id: string;
  decision: Decision;
}

export interface PolicyDecisionResult {
  decision: Decision;
  /** Todas las reglas que matchearon, en orden de aparición en el archivo —
   * para auditoría/logging completo, no solo la ganadora. */
  matchedRules: MatchedRule[];
  /** La regla cuya `reason`/`ask_field` se usa para construir la respuesta
   * al usuario (primera, en orden de archivo, entre las de severidad
   * máxima). `null` si no matcheó ninguna regla (fallback por defecto). */
  winningRuleId: string | null;
  reason: string;
  askField?: string;
}
