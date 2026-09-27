import * as fs from "node:fs";
import * as yaml from "js-yaml";
import type { EligibilityResult, UnderstandOutput } from "@banking-agent/shared";
import {
  Condition,
  Decision,
  GroupAll,
  GroupAny,
  GroupNot,
  LeafCondition,
  MatchedRule,
  PolicyDecisionResult,
  PolicyFile,
  PolicyRule,
  SEVERITY_ORDER,
  Stage,
} from "./types";

/**
 * NOTA DE HONESTIDAD (ver README.md): este archivo no fue compilado ni
 * ejecutado por el autor. El reviewer debe correr `npm install && npm run
 * build && npm test` en `services/policy-agent` antes de confiar en este
 * evaluador para cualquier decisión real.
 */

/**
 * Contrato de entrada de transaction-agent para las reglas
 * `stage: post_action` de policies.yaml. CONFIRMADO (ver
 * `post_action_contract_status: CONFIRMED` en policies.yaml) —
 * `EligibilityResult` es ahora un tipo real de `@banking-agent/shared`
 * (`packages/shared/src/contracts/eligibility-result.ts`), producido por
 * `services/transaction-agent` (`computeEligibility`). Se re-exporta acá
 * por conveniencia para quien importe `@banking-agent/policy-agent`
 * directamente, pero la fuente de verdad canónica del tipo es
 * `packages/shared`, no este archivo.
 */
export type { EligibilityResult };

/** Carga y parsea policies.yaml desde disco. No valida JSON Schema completo
 * (ver limitación declarada en policies.yaml) — solo chequea que tenga la
 * forma mínima esperada. */
export function loadPolicyFile(filePath: string): PolicyFile {
  const raw = fs.readFileSync(filePath, "utf-8");
  const parsed = yaml.load(raw) as unknown;

  if (typeof parsed !== "object" || parsed === null) {
    throw new Error(`policies.yaml en ${filePath} no parseó como objeto`);
  }
  const p = parsed as Record<string, unknown>;
  if (!Array.isArray(p.rules)) {
    throw new Error(`policies.yaml en ${filePath} no tiene un array "rules"`);
  }
  if (typeof p.config !== "object" || p.config === null) {
    throw new Error(`policies.yaml en ${filePath} no tiene un objeto "config"`);
  }
  return p as unknown as PolicyFile;
}

function isEmptyValue(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === "string") return v.length === 0;
  return false;
}

/** Resuelve un dot-path (ej. "entities.employment_status",
 * "context.degraded", "missing_fields", "score_zone") sobre un objeto
 * genérico. Devuelve `undefined` si el path no existe — NUNCA lanza, para
 * que una regla mal escrita falle a "no matchea" en vez de romper todo el
 * pipeline (fail-safe hacia CLARIFY/ESCALATE por el fallback, nunca hacia un
 * crash que dejaría al usuario sin respuesta). */
function getByPath(obj: unknown, path: string): unknown {
  const parts = path.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function resolveExpected(
  cond: LeafCondition,
  config: Record<string, number | string>
): unknown {
  if (cond.value_ref !== undefined) {
    if (!(cond.value_ref in config)) {
      throw new Error(
        `Regla referencia config.${cond.value_ref}, que no existe en el bloque "config" de policies.yaml`
      );
    }
    return config[cond.value_ref];
  }
  return cond.value;
}

function evalLeaf(
  cond: LeafCondition,
  input: unknown,
  config: Record<string, number | string>
): boolean {
  const actual = getByPath(input, cond.field);
  const expected = resolveExpected(cond, config);

  switch (cond.op) {
    case "eq":
      return actual === expected;
    case "neq":
      return actual !== expected;
    case "in":
      return Array.isArray(expected) && expected.includes(actual);
    case "not_in":
      return Array.isArray(expected) && !expected.includes(actual);
    case "empty":
      return isEmptyValue(actual);
    case "not_empty":
      return !isEmptyValue(actual);
    case "gt":
      return typeof actual === "number" && typeof expected === "number" && actual > expected;
    case "gte":
      return typeof actual === "number" && typeof expected === "number" && actual >= expected;
    case "lt":
      return typeof actual === "number" && typeof expected === "number" && actual < expected;
    case "lte":
      return typeof actual === "number" && typeof expected === "number" && actual <= expected;
    default:
      // Nunca debería llegar acá si policies.yaml usa los `op` documentados.
      return false;
  }
}

function isGroupAll(c: Condition): c is GroupAll {
  return typeof c === "object" && c !== null && "all" in c;
}
function isGroupAny(c: Condition): c is GroupAny {
  return typeof c === "object" && c !== null && "any" in c;
}
function isGroupNot(c: Condition): c is GroupNot {
  return typeof c === "object" && c !== null && "not" in c;
}

export function evalCondition(
  cond: Condition,
  input: unknown,
  config: Record<string, number | string>
): boolean {
  if (isGroupAll(cond)) {
    return cond.all.every((c) => evalCondition(c, input, config));
  }
  if (isGroupAny(cond)) {
    return cond.any.some((c) => evalCondition(c, input, config));
  }
  if (isGroupNot(cond)) {
    return !evalCondition(cond.not, input, config);
  }
  return evalLeaf(cond as LeafCondition, input, config);
}

/**
 * Semántica de evaluación (ver policies.yaml, bloque `evaluation_semantics`,
 * para la explicación completa con ejemplo):
 *
 * 1. Se filtran las reglas de la `stage` pedida.
 * 2. Se evalúan TODAS (no "primera que matchea gana").
 * 3. Si ninguna matchea -> fallback ESCALATE (nunca AUTO por defecto).
 * 4. Si una o más matchean -> gana la de severidad más alta
 *    (ESCALATE > CLARIFY > AUTO) — formaliza "cuando dudes, elegí la
 *    opción más conservadora".
 * 5. Entre las de severidad máxima, la primera en orden de aparición en el
 *    archivo determina el `reason`/`ask_field` mostrado; TODAS las que
 *    matchearon quedan en `matchedRules` para auditoría.
 */
function evaluateStage(
  stage: Stage,
  input: unknown,
  policy: PolicyFile
): PolicyDecisionResult {
  const rules: PolicyRule[] =
    stage === "pre_action" ? policy.rules : policy.post_action_rules ?? [];

  const matches = rules.filter((r) => r.stage === stage && evalCondition(r.when, input, policy.config));

  if (matches.length === 0) {
    return {
      decision: "ESCALATE",
      matchedRules: [],
      winningRuleId: null,
      reason:
        (policy.evaluation_semantics?.["default_reason"] as string | undefined) ??
        "Ninguna regla explícita de policies.yaml matcheó este caso; fallback conservador (nunca AUTO por defecto).",
    };
  }

  const maxSeverity = Math.max(...matches.map((r) => SEVERITY_ORDER[r.decision]));
  const winners = matches.filter((r) => SEVERITY_ORDER[r.decision] === maxSeverity);
  const winningRule = winners[0];

  const matchedRules: MatchedRule[] = matches.map((r) => ({ id: r.id, decision: r.decision }));

  const result: PolicyDecisionResult = {
    decision: winningRule.decision,
    matchedRules,
    winningRuleId: winningRule.id,
    reason: winningRule.reason.trim(),
  };

  if (winningRule.decision === "CLARIFY") {
    const askField = pickAskField(winningRule, input);
    if (askField) result.askField = askField;
  }

  return result;
}

/** Determina qué campo preguntar para una regla CLARIFY ganadora. Nunca
 * expone el VALOR de una entity, solo el NOMBRE del campo a pedir — no hay
 * riesgo de fuga de PII acá (ver policies.yaml, sección `security`). */
function pickAskField(rule: PolicyRule, input: unknown): string | undefined {
  if (rule.ask_field) return rule.ask_field;
  if (rule.ask_field_priority) {
    const missing = getByPath(input, "missing_fields");
    if (Array.isArray(missing)) {
      for (const candidate of rule.ask_field_priority) {
        if (missing.includes(candidate)) return candidate;
      }
    }
    // Sin missing_fields disponible (ej. input no es un UnderstandOutput) o
    // ninguno de la lista de prioridad está en missing_fields: se cae al
    // primer elemento de la prioridad como mejor esfuerzo.
    return rule.ask_field_priority[0];
  }
  return undefined;
}

/** Evalúa las reglas `stage: pre_action` de policies.yaml contra un
 * UnderstandOutput real (contrato de @banking-agent/shared). Este es el
 * punto de entrada esperado desde el orquestador del pipeline. */
export function evaluatePreAction(
  input: UnderstandOutput,
  policy: PolicyFile
): PolicyDecisionResult {
  return evaluateStage("pre_action", input, policy);
}

/**
 * Evalúa las reglas `stage: post_action` contra un `EligibilityResult` real
 * producido por `services/transaction-agent` (`computeEligibility`). Contrato
 * CONFIRMADO (ver policies.yaml, `post_action_contract_status: CONFIRMED`) —
 * ya no es una propuesta. IMPORTANTE: esto no implica que exista todavía un
 * orquestador end-to-end desplegado en AWS que invoque transaction-agent y
 * luego pase su resultado acá en un mismo flujo real de producción; cada
 * pieza está probada por separado (y con tests de integración que encadenan
 * los paquetes compilados) pero la conexión productiva sigue pendiente (ver
 * policies.yaml, sección "LIMITACIONES CONOCIDAS").
 */
export function evaluatePostAction(
  input: EligibilityResult,
  policy: PolicyFile
): PolicyDecisionResult {
  return evaluateStage("post_action", input, policy);
}
