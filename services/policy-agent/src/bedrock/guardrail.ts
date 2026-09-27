import { SEVERITY_ORDER } from "../types";
import type { PolicyDecisionResult } from "../types";
import type { ModelProposal } from "./model-decider";

/**
 * `PolicyDecisionResult` extendido con campos ADITIVOS y opcionales de
 * auditoría del guardrail modelo-vs-reglas. `decision`/`matchedRules`/
 * `winningRuleId`/`reason`/`askField` conservan EXACTAMENTE el mismo
 * significado que hoy (ver `../types.ts`) -- nunca se reinterpretan acá.
 * Consumidores existentes (ASL de la Step Function, escalation-agent,
 * frontend) que solo leen esos 5 campos siguen funcionando sin cambios.
 */
export interface ExtendedPolicyDecisionResult extends PolicyDecisionResult {
  /** Propuesta cruda del modelo (Bedrock), si estuvo disponible y fue
   * válida -- presente para auditoría incluso cuando NO "ganó" la decisión
   * final. `undefined` si Bedrock no estaba configurado/disponible, falló
   * tras reintentos, o devolvió una `decision` fuera del enum válido (todo
   * eso se trata como "propuesta no disponible", ver `model-decider.ts`). */
  modelProposal?: ModelProposal;
  /** Razonamiento del modelo (texto libre), presente SOLO cuando el modelo
   * ganó la decisión final (fue estrictamente más conservador que el
   * evaluador de reglas). Nunca sobreescribe `reason`, que sigue siendo el
   * texto ESTÁTICO auditable de la regla de `policies.yaml` que matcheó
   * (ver `sec-no-raw-pii-in-reason` en policies.yaml) -- este campo es
   * aditivo y se agrega aparte a propósito. */
  modelOverrideReason?: string;
  /** Quién determinó la `decision` final -- para logging/auditoría
   * (`"rules"` cuando el evaluador determinístico empató o ganó en
   * severidad, `"model"` cuando el modelo fue estrictamente más
   * conservador). Ausente cuando no hubo propuesta del modelo. */
  decisionSource?: "rules" | "model";
}

/**
 * Combina la decisión determinística de `policies.yaml`
 * (`ruleResult`, ya calculada por `evaluatePreAction`/`evaluatePostAction`
 * en `../evaluator.ts`, SIN CAMBIOS) con la propuesta del modelo de Bedrock
 * (`modelProposal`), aplicando el MISMO mecanismo "most-conservative-match-
 * wins" que `evaluator.ts` (`evaluateStage`) ya usa para combinar reglas
 * entre sí -- ahora también entre la propuesta del modelo y la del
 * evaluador de reglas, reusando el mismo `SEVERITY_ORDER` importado de
 * `../types` (no se duplica con otro nombre).
 *
 * Decisión de arquitectura CONFIRMADA por el usuario, citada literalmente:
 * "el modelo decide, pero policies.yaml corre igual después como
 * guardrail: si el evaluador determinístico da una decisión más
 * conservadora que la del modelo, esa gana. El modelo propone, el código
 * dispone." Este guardrail implementa esa cita en AMBOS sentidos posibles
 * de la comparación de severidad:
 *   - Si las reglas son igual o más conservadoras que el modelo (severidad
 *     de `ruleResult.decision` >= severidad de `modelProposal.decision`):
 *     ganan las reglas, sin cambios.
 *   - Si el MODELO es estrictamente más conservador que las reglas
 *     (severidad de `modelProposal.decision` > severidad de
 *     `ruleResult.decision`): gana el modelo -- "más conservador gana"
 *     nunca significa "las reglas ganan siempre" ni "el modelo gana
 *     siempre", es una comparación simétrica de severidad.
 *
 * Si `modelProposal` es `null` (Bedrock no disponible/no configurado, falló
 * tras reintentos, o devolvió una `decision` fuera del enum válido):
 * devuelve `ruleResult` TAL CUAL, sin ningún campo agregado -- comportamiento
 * IDÉNTICO al que existía antes de esta integración. Un fallo de Bedrock
 * nunca degrada la seguridad de la decisión: en el peor caso el sistema se
 * comporta exactamente como antes.
 */
export function applyModelGuardrail(
  ruleResult: PolicyDecisionResult,
  modelProposal: ModelProposal | null
): ExtendedPolicyDecisionResult {
  if (modelProposal === null) {
    return ruleResult;
  }

  const ruleSeverity = SEVERITY_ORDER[ruleResult.decision];
  const modelSeverity = SEVERITY_ORDER[modelProposal.decision];

  if (ruleSeverity >= modelSeverity) {
    // Las reglas son igual o más conservadoras que el modelo -> ganan las
    // reglas. decision/matchedRules/winningRuleId/reason/askField quedan
    // EXACTAMENTE igual que hoy; la propuesta del modelo se adjunta solo
    // como dato de auditoría, nunca afecta la decisión final.
    return {
      ...ruleResult,
      modelProposal,
      decisionSource: "rules",
    };
  }

  // El modelo es ESTRICTAMENTE más conservador que las reglas -> gana el
  // modelo ("el modelo propone, el código dispone": este guardrail -- el
  // código -- es el que efectivamente decide que, en este caso puntual, la
  // decisión final sea la del modelo, aplicando la misma regla fija de
  // "más conservador gana" que ya gobierna la combinación de reglas entre
  // sí). matchedRules/winningRuleId se conservan del evaluador de reglas
  // para auditoría (fueron las reglas que sí matchearon, aunque no
  // "ganaron" la decisión final). `reason` NO se sobreescribe -- sigue
  // siendo el texto estático auditable de la regla que matcheó; el
  // razonamiento del modelo va aparte, en `modelOverrideReason`.
  const overridden: ExtendedPolicyDecisionResult = {
    ...ruleResult,
    decision: modelProposal.decision,
    modelProposal,
    modelOverrideReason: modelProposal.reasoning,
    decisionSource: "model",
  };

  // `askField` solo tiene sentido cuando la decisión FINAL es CLARIFY (ver
  // docstring de `askField` en `../types.ts`: "Campo único a preguntar si
  // esta regla CLARIFY gana"). El modelo nunca propone un `askField` (no es
  // parte de su tool schema a propósito -- qué campo concreto preguntar
  // sigue siendo responsabilidad exclusiva de policies.yaml). Si la
  // decisión final ya no es CLARIFY, se descarta cualquier `askField`
  // heredado de `ruleResult` para no dejar un campo obsoleto/inconsistente
  // con la decisión final.
  if (overridden.decision !== "CLARIFY") {
    delete overridden.askField;
  }

  return overridden;
}
