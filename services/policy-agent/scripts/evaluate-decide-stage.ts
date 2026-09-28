import * as path from "node:path";
import * as fs from "node:fs";
import type { DecisionStage, ModelProposal } from "../src/bedrock/model-decider";
import { proposeModelDecision } from "../src/bedrock/model-decider";
import { applyModelGuardrail } from "../src/bedrock/guardrail";
import type { ExtendedPolicyDecisionResult } from "../src/bedrock/guardrail";
import { getBedrockDeciderConfig } from "../src/bedrock/config";
import { evaluatePostAction, evaluatePreAction, loadPolicyFile } from "../src/evaluator";
import type { Decision, PolicyDecisionResult } from "../src/types";

/**
 * Harness de evaluación "baseline vs. sistema propuesto" para el "learned
 * component" ya integrado en producción: el guardrail de Bedrock de
 * policy-agent (`../src/bedrock/model-decider.ts` + `guardrail.ts`).
 *
 * NO entrena nada -- el PDF del hackathon (`hacka-info/Factored AI & Data
 * Hackathon 2026.pdf`, pág. 4) dice explícitamente que entrenar un modelo
 * nuevo no es obligatorio, y que un modelo pre-entrenado bien evaluado
 * también satisface el requisito de "evaluate at least one learned
 * component against an appropriate baseline".
 *
 * - Baseline: `evaluatePreAction`/`evaluatePostAction` SOLOS (reglas
 *   determinísticas de `policies.yaml`, sin Bedrock) -- es exactamente lo
 *   que corre en producción cuando Bedrock no está disponible/configurado
 *   (ver `applyModelGuardrail`, caso `modelProposal === null`).
 * - Sistema propuesto: baseline + `applyModelGuardrail` con una propuesta
 *   REAL de Bedrock (no mockeada) -- lo que corre en producción hoy.
 *
 * Nunca pega a AWS real si `BEDROCK_MODEL_ID_PARAM_NAME`/
 * `BEDROCK_REGION_PARAM_NAME` no están seteadas (mismo comportamiento que
 * `handler.ts`: Bedrock "no disponible", el sistema propuesto colapsa al
 * baseline) -- correr con esas env vars apuntando a SSM real (mismo
 * `AWS_PROFILE=banking-agent-dev` que el resto del repo) para un reporte
 * real.
 *
 * Leakage/honestidad: los `id` de fixtures marcados `designSet: true` (si
 * los hay) fueron vistos durante el ajuste de `policies.yaml`/prompts y NO
 * deben contarse en el reporte final -- se excluyen automáticamente acá.
 */

interface EvalCase {
  id: string;
  stage: DecisionStage;
  language: "es" | "pt";
  designSet: boolean;
  expectedDecision: Decision;
  notes: string;
  input: Record<string, unknown>;
}

interface CaseResult {
  id: string;
  stage: DecisionStage;
  language: "es" | "pt";
  expected: Decision;
  baselineDecision: Decision;
  baselineCorrect: boolean;
  proposedDecision: Decision;
  proposedCorrect: boolean;
  decisionSource: "rules" | "model" | "rules_only_bedrock_unavailable";
  modelProposal: Decision | null;
  latencyMs: number | null;
  tokenUsage: ModelProposal["tokenUsage"];
}

// Rutas relativas al cwd del proceso -- este script se invoca vía `npm run
// evaluate:decide-stage` desde `services/policy-agent` (npm siempre fija el
// cwd al directorio del package.json que define el script), nunca vía
// `__dirname` relativo a `dist/scripts` (ahí NO están los fixtures JSON,
// que no se compilan/copian -- solo el `.ts` compila a `.js`).
const FIXTURES_PATH = path.resolve(process.cwd(), "scripts/eval-fixtures/decide-stage-cases.json");
const POLICY_FILE_PATH = path.resolve(process.cwd(), "../../policies.yaml");
const REPORT_PATH = path.resolve(process.cwd(), "../../docs/EVALUATION-DECIDE-STAGE.md");
const RESULTS_PATH = path.resolve(process.cwd(), "scripts/eval-results/decide-stage-results.json");

// Pricing publicado de Amazon Bedrock para la familia Claude Sonnet (Sonnet
// 4.5, misma familia/tier que el inference profile real usado en este
// proyecto, `us.anthropic.claude-sonnet-4-6` -- no se encontró un precio
// publicado específico para 4.6 al momento de este reporte, se usa el de la
// familia como aproximación documentada, NUNCA como cifra medida exacta):
// $3.00 / millón de tokens de entrada, $15.00 / millón de tokens de salida.
const USD_PER_INPUT_TOKEN = 3.0 / 1_000_000;
const USD_PER_OUTPUT_TOKEN = 15.0 / 1_000_000;

function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

async function main(): Promise<void> {
  const allCases = JSON.parse(fs.readFileSync(FIXTURES_PATH, "utf-8")) as EvalCase[];
  const heldOutCases = allCases.filter((c) => !c.designSet);
  if (heldOutCases.length < allCases.length) {
    console.log(
      `Excluyendo ${allCases.length - heldOutCases.length} caso(s) marcados designSet:true (vistos durante el ajuste de policies.yaml/prompts) del reporte final.`
    );
  }

  const policy = loadPolicyFile(POLICY_FILE_PATH);
  const bedrockConfig = await getBedrockDeciderConfig();
  if (!bedrockConfig) {
    console.warn(
      "ADVERTENCIA: Bedrock no configurado (BEDROCK_MODEL_ID_PARAM_NAME/BEDROCK_REGION_PARAM_NAME ausentes, o SSM no accesible). " +
        "El 'sistema propuesto' va a colapsar al baseline en todos los casos -- correr con AWS_PROFILE=banking-agent-dev para un reporte real."
    );
  }

  const results: CaseResult[] = [];

  for (const c of heldOutCases) {
    const ruleResult: PolicyDecisionResult =
      c.stage === "pre_action"
        ? evaluatePreAction(c.input as never, policy)
        : evaluatePostAction(c.input as never, policy);

    let modelProposal: ModelProposal | null = null;
    let latencyMs: number | null = null;
    if (bedrockConfig) {
      const modelInput =
        c.stage === "post_action" ? (({ stage: _s, ...rest }) => rest)(c.input as { stage: string }) : c.input;
      const start = Date.now();
      modelProposal = await proposeModelDecision(modelInput as never, c.stage, {
        bedrockClient: bedrockConfig.bedrockClient,
        modelId: bedrockConfig.modelId,
      });
      latencyMs = Date.now() - start;
    }

    const proposedResult: ExtendedPolicyDecisionResult = applyModelGuardrail(ruleResult, modelProposal);

    results.push({
      id: c.id,
      stage: c.stage,
      language: c.language,
      expected: c.expectedDecision,
      baselineDecision: ruleResult.decision,
      baselineCorrect: ruleResult.decision === c.expectedDecision,
      proposedDecision: proposedResult.decision,
      proposedCorrect: proposedResult.decision === c.expectedDecision,
      decisionSource: modelProposal === null ? "rules_only_bedrock_unavailable" : (proposedResult.decisionSource ?? "rules"),
      modelProposal: modelProposal?.decision ?? null,
      latencyMs,
      tokenUsage: modelProposal?.tokenUsage,
    });
  }

  fs.mkdirSync(path.dirname(RESULTS_PATH), { recursive: true });
  fs.writeFileSync(RESULTS_PATH, JSON.stringify(results, null, 2));

  writeReport(results, heldOutCases.length, allCases.length - heldOutCases.length, bedrockConfig !== null);
  console.log(`Reporte escrito en ${REPORT_PATH}`);
  console.log(`Resultados crudos en ${RESULTS_PATH}`);
}

/** `unsafe` acá significa: el sistema dijo AUTO pero el label esperado NO
 * era AUTO (una acción se hubiera ejecutado/comunicado sin deber hacerlo).
 * Nunca al revés -- un ESCALATE de más es conservador, no inseguro. */
function isUnsafeOutcome(r: CaseResult, decision: Decision): boolean {
  return decision === "AUTO" && r.expected !== "AUTO";
}

function isMissedEscalation(r: CaseResult, decision: Decision): boolean {
  return r.expected === "ESCALATE" && decision !== "ESCALATE";
}

function isUnnecessaryEscalation(r: CaseResult, decision: Decision): boolean {
  return decision === "ESCALATE" && r.expected !== "ESCALATE";
}

function summarize(results: CaseResult[], arm: "baseline" | "proposed") {
  const decisionOf = (r: CaseResult) => (arm === "baseline" ? r.baselineDecision : r.proposedDecision);
  const total = results.length;
  const correct = results.filter((r) => decisionOf(r) === r.expected).length;
  const unsafe = results.filter((r) => isUnsafeOutcome(r, decisionOf(r))).length;
  const missedEscalations = results.filter((r) => isMissedEscalation(r, decisionOf(r))).length;
  const unnecessaryEscalations = results.filter((r) => isUnnecessaryEscalation(r, decisionOf(r))).length;
  const safeAutoCount = results.filter((r) => decisionOf(r) === "AUTO" && r.expected === "AUTO").length;
  const autoAttempted = results.filter((r) => decisionOf(r) === "AUTO").length;

  return { total, correct, unsafe, missedEscalations, unnecessaryEscalations, safeAutoCount, autoAttempted };
}

function writeReport(
  results: CaseResult[],
  heldOutCount: number,
  designSetExcludedCount: number,
  bedrockAvailable: boolean
): void {
  const baseline = summarize(results, "baseline");
  const proposed = summarize(results, "proposed");

  const latencies = results.map((r) => r.latencyMs).filter((v): v is number => v !== null);
  const p50 = percentile(latencies, 50);
  const p95 = percentile(latencies, 95);

  const totalInputTokens = results.reduce((acc, r) => acc + (r.tokenUsage?.inputTokens ?? 0), 0);
  const totalOutputTokens = results.reduce((acc, r) => acc + (r.tokenUsage?.outputTokens ?? 0), 0);
  const totalCostUsd = totalInputTokens * USD_PER_INPUT_TOKEN + totalOutputTokens * USD_PER_OUTPUT_TOKEN;
  const costPerCaseUsd = results.length > 0 ? totalCostUsd / results.length : null;

  const byLanguage = (lang: "es" | "pt") => results.filter((r) => r.language === lang);
  const esResults = byLanguage("es");
  const ptResults = byLanguage("pt");

  const disagreements = results.filter((r) => r.baselineDecision !== r.proposedDecision);

  const lines: string[] = [];
  lines.push("# Evaluación Decide stage — baseline (solo reglas) vs. sistema propuesto (reglas + Bedrock)");
  lines.push("");
  lines.push(
    `_Generado automáticamente por \`services/policy-agent/scripts/evaluate-decide-stage.ts\`. NO editar a mano — volver a correr el script tras cualquier cambio en \`policies.yaml\` o en los prompts de \`bedrock/model-decider.ts\`._`
  );
  lines.push("");
  lines.push("## Metodología");
  lines.push("");
  lines.push(
    `- **Baseline**: \`evaluatePreAction\`/\`evaluatePostAction\` solos (reglas determinísticas de \`policies.yaml\`, sin Bedrock) — es lo que corre en producción si Bedrock no está disponible.`
  );
  lines.push(
    `- **Sistema propuesto**: baseline + guardrail de Bedrock (\`applyModelGuardrail\`, "más conservador gana") — es lo que corre en producción hoy.`
  );
  lines.push(
    `- **Held-out set**: ${heldOutCount} casos (\`services/policy-agent/scripts/eval-fixtures/decide-stage-cases.json\`)${
      designSetExcludedCount > 0
        ? `, excluyendo ${designSetExcludedCount} caso(s) marcados \`designSet: true\` (vistos durante el ajuste de reglas/prompts — no serían una evaluación honesta).`
        : "."
    } Labels derivados de la especificación de negocio de \`policies.yaml\` (umbrales/zonas reales), no inventados a mano sin criterio.`
  );
  lines.push(
    `- **Bedrock ${bedrockAvailable ? "SÍ estuvo disponible" : "NO estuvo disponible"} durante esta corrida**${
      bedrockAvailable
        ? "."
        : " — el sistema propuesto colapsa al baseline en todos los casos, correr con `AWS_PROFILE=banking-agent-dev` para un reporte real."
    }`
  );
  lines.push("");
  lines.push("## Resultados agregados");
  lines.push("");
  lines.push("| Métrica | Baseline (solo reglas) | Sistema propuesto (reglas + Bedrock) |");
  lines.push("| --- | --- | --- |");
  lines.push(
    `| Safe Automated Resolution rate | ${baseline.safeAutoCount}/${baseline.total} correctos en AUTO (${(
      (100 * baseline.safeAutoCount) /
      Math.max(1, baseline.total)
    ).toFixed(1)}%), intentado en ${baseline.autoAttempted}/${baseline.total} | ${proposed.safeAutoCount}/${proposed.total} correctos en AUTO (${(
      (100 * proposed.safeAutoCount) /
      Math.max(1, proposed.total)
    ).toFixed(1)}%), intentado en ${proposed.autoAttempted}/${proposed.total} |`
  );
  lines.push(
    `| Unsafe outcomes (AUTO cuando no debía) | ${baseline.unsafe}/${baseline.total} | ${proposed.unsafe}/${proposed.total} |`
  );
  lines.push(
    `| Escalaciones perdidas (debía ESCALATE, no lo hizo) | ${baseline.missedEscalations}/${baseline.total} | ${proposed.missedEscalations}/${proposed.total} |`
  );
  lines.push(
    `| Escalaciones innecesarias (ESCALATE de más) | ${baseline.unnecessaryEscalations}/${baseline.total} | ${proposed.unnecessaryEscalations}/${proposed.total} |`
  );
  lines.push(`| Decisión correcta (total) | ${baseline.correct}/${baseline.total} | ${proposed.correct}/${proposed.total} |`);
  lines.push("");
  lines.push(
    "_Nota: 0 unsafe outcomes observados en este set chico NO establece riesgo cero — ver \"Limitaciones\" abajo._"
  );
  lines.push("");
  lines.push("## Costo y latencia (solo aplica al arm propuesto, que es el que invoca Bedrock)");
  lines.push("");
  lines.push(
    latencies.length > 0
      ? `- Latencia Bedrock: p50 = ${p50}ms, p95 = ${p95}ms (n=${latencies.length} invocaciones reales).`
      : "- Sin invocaciones reales a Bedrock en esta corrida (no disponible) — latencia \"not defined\"."
  );
  lines.push(
    totalInputTokens + totalOutputTokens > 0
      ? `- Tokens reales reportados por Bedrock: ${totalInputTokens} entrada + ${totalOutputTokens} salida. Costo estimado: $${totalCostUsd.toFixed(
          4
        )} total, ~$${costPerCaseUsd?.toFixed(6)} por caso evaluado (pricing publicado Claude Sonnet 4.5 en Bedrock: $3/M tokens entrada, $15/M tokens salida — aproximación documentada, no una tarifa medida en la cuenta real).`
      : "- Sin datos de uso de tokens en esta corrida — costo \"not defined\"."
  );
  lines.push("");
  lines.push("## Desglose por idioma");
  lines.push("");
  lines.push("| Idioma | Casos | Baseline correcto | Propuesto correcto |");
  lines.push("| --- | --- | --- | --- |");
  lines.push(
    `| es | ${esResults.length} | ${esResults.filter((r) => r.baselineCorrect).length}/${esResults.length} | ${
      esResults.filter((r) => r.proposedCorrect).length
    }/${esResults.length} |`
  );
  lines.push(
    `| pt | ${ptResults.length} | ${ptResults.filter((r) => r.baselineCorrect).length}/${ptResults.length} | ${
      ptResults.filter((r) => r.proposedCorrect).length
    }/${ptResults.length} |`
  );
  lines.push(
    `\n_Limitación de muestra: ${ptResults.length} caso(s) en portugués — insuficiente para conclusiones estadísticas robustas por idioma, señalado explícitamente en vez de ocultado._`
  );
  lines.push("");
  lines.push(`## Casos donde el modelo cambió la decisión final respecto al baseline (${disagreements.length})`);
  lines.push("");
  if (disagreements.length === 0) {
    lines.push("_Ninguno en este set — el modelo nunca fue estrictamente más conservador que las reglas en estos casos._");
  } else {
    lines.push("| id | baseline | propuesto | esperado | quién ganó |");
    lines.push("| --- | --- | --- | --- | --- |");
    for (const r of disagreements) {
      lines.push(`| ${r.id} | ${r.baselineDecision} | ${r.proposedDecision} | ${r.expected} | ${r.decisionSource} |`);
    }
  }
  lines.push("");
  lines.push("## Limitaciones declaradas");
  lines.push("");
  lines.push(`- Muestra chica (${results.length} casos) — 0 unsafe outcomes observados no implica 0 riesgo real.`);
  lines.push(
    "- Los labels \"esperados\" fueron derivados directamente de los umbrales/zonas de `policies.yaml` (no de un juicio humano independiente) — miden si el sistema es *consistente con su propia especificación*, no si esa especificación es correcta en sí misma."
  );
  lines.push(
    "- No hay repetición de corridas (`repeated-run variability`) — Bedrock puede variar entre invocaciones con el mismo input; este reporte es una sola corrida, no un promedio de N corridas."
  );
  lines.push(
    "- Costo estimado con pricing publicado de la familia Sonnet, no confirmado contra la factura real de la cuenta AWS del proyecto."
  );
  lines.push("");

  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, lines.join("\n"));
}

main().catch((error) => {
  console.error("evaluate-decide-stage falló", error);
  process.exitCode = 1;
});
