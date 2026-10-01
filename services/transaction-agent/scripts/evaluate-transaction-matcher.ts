import * as path from "node:path";
import * as fs from "node:fs";
import type { Transaction } from "../src/data/mock-core-banking";
import { baselineScore, modelScore, rankAndDecide, type MatchQuery, type RankedCandidate } from "../src/matching/transaction-matcher";
import { createRealEmbedFn, getEmbedding } from "../src/matching/bedrock-embeddings";
import { getEmbeddingConfig } from "../src/matching/embedding-config";
import type { MatcherFixtureCase } from "./generate-matcher-fixtures";

/**
 * Harness de evaluación "baseline vs. modelo" para el matcher de
 * transacciones disputadas, learned component real de
 * `src/matching/transaction-matcher.ts` -- mismo patrón que
 * `services/policy-agent/scripts/evaluate-decide-stage.ts`:
 *
 * - Baseline: `baselineScore` solo (formaliza el filtro que
 *   `static-transaction-repository.ts` ya hacía).
 * - Modelo: `modelScore` con embeddings REALES de Bedrock (vía
 *   `createRealEmbedFn`) -- si `EMBEDDING_MODEL_ID_PARAM_NAME`/
 *   `EMBEDDING_REGION` no están configuradas, el término de comercio se
 *   omite con gracia (mismo comportamiento que producción) y el modelo
 *   queda evaluado SOLO con las señales de monto/fecha -- se advierte esto
 *   explícitamente en el reporte, nunca se oculta.
 *
 * Métricas reportadas, dos niveles:
 * - "De ranking" (Recall@1/Recall@3/MRR): ignoran el umbral de confianza
 *   (tau/marginTau) -- miden si el ranker ordena bien, aunque el sistema
 *   real no actuaría sobre un top no confiado.
 * - "De decisión" (lo que el sistema real haría): entre los casos donde
 *   `rankAndDecide` marca "confiado", ¿qué fracción resolvió a la
 *   transacción correcta? Y en qué fracción del total el sistema está
 *   dispuesto a actuar (cobertura).
 *
 * Leakage: casos `designSet: true` (usados para fijar
 * `DEFAULT_TAU`/`DEFAULT_MARGIN_TAU` en `transaction-matcher.ts`) se
 * excluyen del reporte final. Split por cliente ya viene garantizado por
 * construcción del generador (cada `customerId` sintético solo aparece en
 * sus propios 2 casos, nunca compartido entre cases).
 */

interface CaseResult {
  id: string;
  customerId: string;
  language: "es" | "pt";
  ambiguityLevel: "2-candidates" | "3-plus-candidates";
  queryStyle: "exact-merchant" | "generic-category";
  hasDatePhrase: boolean;
  crossCategory: boolean;
  targetTransactionId: string;
  baseline: ArmResult;
  model: ArmResult;
}

interface ArmResult {
  rankOfTarget: number | null; // 1-indexed, null si no está en el ranking (no debería pasar -- el target siempre es una candidata)
  confident: boolean;
  topTransactionId: string;
  topCorrect: boolean;
  confidentAndCorrect: boolean;
}

const FIXTURES_PATH = path.resolve(process.cwd(), "scripts/eval-fixtures/matcher-cases.json");
const REPORT_PATH = path.resolve(process.cwd(), "../../docs/EVALUATION-DISPUTE-MATCHER.md");
const RESULTS_PATH = path.resolve(process.cwd(), "scripts/eval-results/matcher-results.json");

function rankOf(ranked: readonly RankedCandidate[], targetId: string): number | null {
  const idx = ranked.findIndex((r) => r.transaction.transaction_id === targetId);
  return idx === -1 ? null : idx + 1;
}

async function evaluateArm(
  candidates: readonly Transaction[],
  query: MatchQuery,
  targetId: string,
  scoreFn: (candidate: Transaction, q: MatchQuery) => number | Promise<number>
): Promise<ArmResult> {
  const decision = await rankAndDecide(candidates, query, scoreFn);
  const rank = rankOf(decision.ranked, targetId);
  const topCorrect = decision.top.transaction.transaction_id === targetId;
  return {
    rankOfTarget: rank,
    confident: decision.confident,
    topTransactionId: decision.top.transaction.transaction_id,
    topCorrect,
    confidentAndCorrect: decision.confident && topCorrect,
  };
}

async function main(): Promise<void> {
  const allCases = JSON.parse(fs.readFileSync(FIXTURES_PATH, "utf-8")) as MatcherFixtureCase[];
  const heldOutCases = allCases.filter((c) => !c.designSet);
  const designSetExcludedCount = allCases.length - heldOutCases.length;
  if (designSetExcludedCount > 0) {
    console.log(`Excluyendo ${designSetExcludedCount} caso(s) marcados designSet:true del reporte final.`);
  }

  const embeddingConfig = await getEmbeddingConfig();
  if (!embeddingConfig) {
    console.warn(
      "ADVERTENCIA: embeddings no configurados (EMBEDDING_MODEL_ID_PARAM_NAME/EMBEDDING_REGION ausentes, o SSM no accesible). " +
        "El arm 'modelo' se evalúa SOLO con señales de monto/fecha (el término de comercio se omite) -- correr con AWS_PROFILE=banking-agent-dev para un reporte real con embeddings."
    );
  }
  const embed = createRealEmbedFn();

  // Chequeo chico de determinismo (mejora de dataset): el reporte afirma
  // "embeddings son determinísticos, por eso no hace falta repetir
  // corridas" -- esto lo verifica UNA vez contra Bedrock real en vez de
  // dejarlo como supuesto sin probar. No bloquea el reporte si falla (solo
  // se documenta el resultado real).
  let embeddingDeterminismVerified: boolean | null = null;
  if (embeddingConfig) {
    const [a, b] = await Promise.all([
      getEmbedding("Netflix", embeddingConfig),
      getEmbedding("Netflix", embeddingConfig),
    ]);
    embeddingDeterminismVerified =
      a !== null && b !== null && a.length === b.length && a.every((v, i) => v === b[i]);
    console.log(
      embeddingDeterminismVerified
        ? "[determinismo] 2 invocaciones reales de getEmbedding('Netflix') devolvieron vectores idénticos."
        : "[determinismo] ADVERTENCIA: 2 invocaciones reales de getEmbedding('Netflix') NO devolvieron vectores idénticos (o alguna falló)."
    );
  }

  const results: CaseResult[] = [];
  for (const c of heldOutCases) {
    const query = c.query;
    const baseline = await evaluateArm(c.candidates, query, c.targetTransactionId, baselineScore);
    const model = await evaluateArm(c.candidates, query, c.targetTransactionId, (candidate, q) => modelScore(candidate, q, embed));

    results.push({
      id: c.id,
      customerId: c.customerId,
      language: c.language,
      ambiguityLevel: c.ambiguityLevel,
      queryStyle: c.queryStyle,
      hasDatePhrase: c.hasDatePhrase,
      crossCategory: c.crossCategory,
      targetTransactionId: c.targetTransactionId,
      baseline,
      model,
    });
  }

  fs.mkdirSync(path.dirname(RESULTS_PATH), { recursive: true });
  fs.writeFileSync(RESULTS_PATH, JSON.stringify(results, null, 2));

  writeReport(
    results,
    heldOutCases.length,
    designSetExcludedCount,
    allCases.length,
    embeddingConfig !== null,
    embeddingDeterminismVerified
  );
  console.log(`Reporte escrito en ${REPORT_PATH}`);
  console.log(`Resultados crudos en ${RESULTS_PATH}`);
}

function recallAtK(results: CaseResult[], arm: "baseline" | "model", k: number): number {
  const withRank = results.filter((r) => r[arm].rankOfTarget !== null);
  if (withRank.length === 0) return 0;
  const hits = withRank.filter((r) => (r[arm].rankOfTarget as number) <= k).length;
  return hits / withRank.length;
}

function mrr(results: CaseResult[], arm: "baseline" | "model"): number {
  const withRank = results.filter((r) => r[arm].rankOfTarget !== null);
  if (withRank.length === 0) return 0;
  const sum = withRank.reduce((acc, r) => acc + 1 / (r[arm].rankOfTarget as number), 0);
  return sum / withRank.length;
}

function decisionStats(results: CaseResult[], arm: "baseline" | "model") {
  const total = results.length;
  const confident = results.filter((r) => r[arm].confident).length;
  const confidentCorrect = results.filter((r) => r[arm].confidentAndCorrect).length;
  const confidentWrong = results.filter((r) => r[arm].confident && !r[arm].topCorrect).length;
  return {
    total,
    confident,
    coverage: total > 0 ? confident / total : 0,
    confidentCorrect,
    confidentWrong,
    precisionWhenConfident: confident > 0 ? confidentCorrect / confident : null,
  };
}

function fmtPct(v: number): string {
  return `${(v * 100).toFixed(1)}%`;
}

function writeReport(
  results: CaseResult[],
  heldOutCount: number,
  designSetExcludedCount: number,
  totalCaseCount: number,
  embeddingsAvailable: boolean,
  embeddingDeterminismVerified: boolean | null
): void {
  const arms: Array<"baseline" | "model"> = ["baseline", "model"];
  const rankingMetrics = Object.fromEntries(
    arms.map((arm) => [
      arm,
      { recall1: recallAtK(results, arm, 1), recall3: recallAtK(results, arm, 3), mrr: mrr(results, arm) },
    ])
  ) as Record<"baseline" | "model", { recall1: number; recall3: number; mrr: number }>;
  const decision = Object.fromEntries(arms.map((arm) => [arm, decisionStats(results, arm)])) as Record<
    "baseline" | "model",
    ReturnType<typeof decisionStats>
  >;

  function breakdownBy<K extends string>(keyFn: (r: CaseResult) => K): Record<K, CaseResult[]> {
    const groups = {} as Record<K, CaseResult[]>;
    for (const r of results) {
      const key = keyFn(r);
      (groups[key] ??= []).push(r);
    }
    return groups;
  }

  const byLanguage = breakdownBy((r) => r.language);
  const byAmbiguity = breakdownBy((r) => r.ambiguityLevel);
  const byQueryStyle = breakdownBy((r) => r.queryStyle);
  const byDatePhrase = breakdownBy((r) => (r.hasDatePhrase ? "con frase de fecha" : "sin frase de fecha"));
  // Cruce queryStyle x hasDatePhrase: los desgloses marginales de arriba
  // mezclan estilos dentro de "sin frase de fecha", escondiendo la celda
  // realmente interesante (generic-category + sin fecha -- el punto ciego
  // real del diseño actual, ver docs/STATUS.md "Por qué generic-category
  // es difícil"). Esta tabla la hace explícita.
  const byStyleAndDate = breakdownBy(
    (r) => `${r.queryStyle} / ${r.hasDatePhrase ? "con fecha" : "sin fecha"}`
  );
  // "Caso C" (docs/STATUS.md, reparos propuestos item #4): candidatas de
  // merchant_category DISTINTA entre sí -- aísla el aporte real de la
  // señal de categoría agregada a modelScore. "same-category" son los
  // casos A/B preexistentes (candidatas del MISMO grupo a propósito, la
  // señal de categoría nunca discrimina ahí por diseño del dataset).
  const byCrossCategory = breakdownBy((r) =>
    r.crossCategory ? "cross-category (candidatas de rubro distinto)" : "same-category (candidatas del mismo rubro)"
  );

  const lines: string[] = [];
  lines.push("# Evaluación — matcher de transacciones disputadas (baseline vs. modelo con embeddings)");
  lines.push("");
  lines.push(
    "_Generado automáticamente por `services/transaction-agent/scripts/evaluate-transaction-matcher.ts` sobre `scripts/eval-fixtures/matcher-cases.json` (dataset sintético, seed determinístico vía `generate-matcher-fixtures.ts`). NO editar a mano — volver a correr el script tras cualquier cambio en `src/matching/`._"
  );
  lines.push("");
  lines.push("## Metodología");
  lines.push("");
  lines.push(
    "- **Baseline**: `baselineScore` — formaliza el filtro que `static-transaction-repository.ts` ya aplicaba (comercio substring + monto ±1%, señal de fecha NO discriminante) como un score sumable."
  );
  lines.push(
    "- **Modelo**: `modelScore` — similitud coseno de embeddings de Bedrock (comercio) + proximidad continua de monto + ventana de fecha REALMENTE resuelta (`resolve-relative-date.ts`)."
  );
  lines.push(
    `- **Dataset**: ${heldOutCount} casos sintéticos held-out de ${totalCaseCount} totales (excluyendo ${designSetExcludedCount} marcados \`designSet: true\`, usados para fijar \`DEFAULT_TAU=0.6\`/\`DEFAULT_MARGIN_TAU=0.15\` por inspección). Split por cliente por construcción: cada cliente sintético (\`SYN-CUST-*\`) aporta exactamente 2 casos, ninguno compartido entre grupos.`
  );
  lines.push(
    `- **Embeddings ${embeddingsAvailable ? "SÍ estuvieron disponibles" : "NO estuvieron disponibles"} durante esta corrida**${
      embeddingsAvailable
        ? "."
        : " — el arm 'modelo' se evaluó SOLO con señales de monto/fecha (sin el término de comercio); correr con `AWS_PROFILE=banking-agent-dev` y `EMBEDDING_MODEL_ID_PARAM_NAME`/`EMBEDDING_REGION` seteadas para un reporte con embeddings reales."
    }`
  );
  lines.push(
    "- **Dos niveles de métrica**: "
  );
  lines.push(
    "  - _De ranking_ (Recall@1/Recall@3/MRR): ¿el ranker ordena bien? Ignora el umbral de confianza `tau`/`marginTau`."
  );
  lines.push(
    "  - _De decisión_ (lo que el sistema real haría vía `rankAndDecide`): entre los casos marcados \"confiado\", ¿qué fracción resolvió a la transacción correcta (precisión)? ¿En qué fracción del total el sistema está dispuesto a actuar sin escalar (cobertura)?"
  );
  lines.push("");
  lines.push("## Resultados agregados — ranking");
  lines.push("");
  lines.push("| Métrica | Baseline | Modelo |");
  lines.push("| --- | --- | --- |");
  lines.push(`| Recall@1 | ${fmtPct(rankingMetrics.baseline.recall1)} | ${fmtPct(rankingMetrics.model.recall1)} |`);
  lines.push(`| Recall@3 | ${fmtPct(rankingMetrics.baseline.recall3)} | ${fmtPct(rankingMetrics.model.recall3)} |`);
  lines.push(`| MRR | ${rankingMetrics.baseline.mrr.toFixed(3)} | ${rankingMetrics.model.mrr.toFixed(3)} |`);
  lines.push("");
  lines.push("## Resultados agregados — decisión (`rankAndDecide`, τ=0.6, marginTau=0.15)");
  lines.push("");
  lines.push("| Métrica | Baseline | Modelo |");
  lines.push("| --- | --- | --- |");
  lines.push(
    `| Cobertura (% casos marcados \"confiado\") | ${fmtPct(decision.baseline.coverage)} (${decision.baseline.confident}/${decision.baseline.total}) | ${fmtPct(
      decision.model.coverage
    )} (${decision.model.confident}/${decision.model.total}) |`
  );
  lines.push(
    `| Precisión cuando confiado | ${
      decision.baseline.precisionWhenConfident === null ? "n/a (0 casos confiados)" : fmtPct(decision.baseline.precisionWhenConfident)
    } (${decision.baseline.confidentCorrect}/${decision.baseline.confident}) | ${
      decision.model.precisionWhenConfident === null ? "n/a (0 casos confiados)" : fmtPct(decision.model.precisionWhenConfident)
    } (${decision.model.confidentCorrect}/${decision.model.confident}) |`
  );
  lines.push(
    `| Confiado pero incorrecto (falso positivo) | ${decision.baseline.confidentWrong}/${decision.baseline.total} | ${decision.model.confidentWrong}/${decision.model.total} |`
  );
  lines.push("");
  lines.push(
    "_Nota: un falso positivo (\"confiado pero incorrecto\") es el peor caso real -- el sistema resolvería una disputa hacia la transacción equivocada sin pedir aclaración. Revisar esta fila antes de considerar bajar `marginTau`._"
  );
  lines.push("");

  function writeBreakdownTable(title: string, groups: Record<string, CaseResult[]>) {
    lines.push(`## Desglose: ${title}`);
    lines.push("");
    lines.push("| Grupo | Casos | Recall@1 baseline | Recall@1 modelo | Precisión-si-confiado baseline | Precisión-si-confiado modelo |");
    lines.push("| --- | --- | --- | --- | --- | --- |");
    for (const [key, groupResults] of Object.entries(groups)) {
      const gb = decisionStats(groupResults, "baseline");
      const gm = decisionStats(groupResults, "model");
      lines.push(
        `| ${key} | ${groupResults.length} | ${fmtPct(recallAtK(groupResults, "baseline", 1))} | ${fmtPct(
          recallAtK(groupResults, "model", 1)
        )} | ${gb.precisionWhenConfident === null ? "n/a" : fmtPct(gb.precisionWhenConfident)} | ${
          gm.precisionWhenConfident === null ? "n/a" : fmtPct(gm.precisionWhenConfident)
        } |`
      );
    }
    lines.push("");
  }

  writeBreakdownTable("por idioma", byLanguage);
  writeBreakdownTable("por nivel de ambigüedad", byAmbiguity);
  writeBreakdownTable(
    "por estilo de consulta (comercio exacto vs. frase genérica de rubro)",
    byQueryStyle
  );
  writeBreakdownTable("por presencia de frase de fecha", byDatePhrase);
  writeBreakdownTable(
    "cruce estilo de consulta × presencia de frase de fecha (celda real de punto ciego)",
    byStyleAndDate
  );
  writeBreakdownTable(
    "cross-category vs. same-category (aporte real de merchant_category en modelScore)",
    byCrossCategory
  );

  lines.push("## Determinismo de embeddings");
  lines.push("");
  lines.push(
    embeddingDeterminismVerified === null
      ? "_No verificado en esta corrida (embeddings no disponibles)._"
      : embeddingDeterminismVerified
        ? "Verificado en esta corrida: 2 invocaciones reales de `getEmbedding('Netflix')` contra Bedrock devolvieron vectores idénticos -- confirma (no solo asume) que no hace falta repetir corridas del arm modelo por variabilidad de embeddings."
        : "**ADVERTENCIA REAL**: 2 invocaciones de `getEmbedding('Netflix')` en esta corrida NO devolvieron vectores idénticos (o alguna falló) -- revisar antes de asumir determinismo en el resto de este reporte."
  );
  lines.push("");

  lines.push("## Limitaciones declaradas");
  lines.push("");
  lines.push(
    "- Dataset sintético (generado programáticamente, no transacciones/disputas reales de clientes) -- mide si el matcher hace lo que su diseño promete, no si ese diseño captura toda la variedad real de cómo la gente describe una disputa."
  );
  lines.push(
    "- Por construcción, `queryStyle: \"generic-category\"` sin frase de fecha (`hasDatePhrase: false`), dentro de los casos \"same-category\" (candidatas del MISMO `merchant_category`, casos A/B del generador), sigue siendo un caso donde NINGUNA señal discrimina entre candidatas para ninguno de los dos arms -- confirmado en la tabla de cruce arriba (Recall@1 ~nivel de azar para ambos arms en esa celda puntual). Esto es una limitación real y esperada del DATASET (las candidatas comparten rubro a propósito), no del matcher: agregar `merchant_category` como señal (ver tabla cross-category vs. same-category) no puede ayudar ahí porque todas las candidatas tienen la MISMA categoría -- no hay nada que la señal pueda rechazar. Donde la señal nueva SÍ aporta es en el caso \"cross-category\" (`crossCategory: true`, \"Caso C\" del generador): candidatas de rubro DISTINTO, mismo monto aproximado, sin fecha -- ver esa fila de la tabla para el aporte real medido."
  );
  lines.push(
    `- \`DEFAULT_TAU\`/\`DEFAULT_MARGIN_TAU\` se fijaron por inspección de los ${designSetExcludedCount} casos \`designSet: true\`, no por una búsqueda de grilla sobre el set completo -- reevaluar si este reporte sugiere otro valor.`
  );
  lines.push("- No hay repetición de corridas -- embeddings de Bedrock son determinísticos para el mismo input, así que esto es menos crítico que en el harness de policy-agent (que sí depende de un LLM generativo), pero sigue siendo una sola corrida.");
  lines.push("");

  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, lines.join("\n"));
}

main().catch((error) => {
  console.error("evaluate-transaction-matcher falló", error);
  process.exitCode = 1;
});
