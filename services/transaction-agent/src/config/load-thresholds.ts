import * as fs from "node:fs";
import * as yaml from "js-yaml";

/**
 * Lee `borderline_score_min`/`borderline_score_max` directamente de
 * `policies.yaml` (raíz del monorepo) usando `js-yaml`, MISMO mecanismo que
 * `services/policy-agent/src/evaluator.ts` (`loadPolicyFile`). Se lee
 * directamente en vez de reusar `loadPolicyFile` de `@banking-agent/policy-agent`
 * para no acoplar transaction-agent al paquete completo del evaluador solo
 * para leer dos números de config -- transaction-agent solo necesita
 * `config.borderline_score_min`/`_max`, no las reglas ni el evaluador de
 * `pre_action`/`post_action`.
 *
 * Deliberado (resolución de la pregunta abierta #2 de `policies.yaml`, ver
 * `packages/shared/src/contracts/eligibility-result.ts`): estos umbrales
 * viven en UN SOLO lugar (`policies.yaml`, bloque `config`). Si se
 * hardcodearan de nuevo acá, policy-agent y transaction-agent podrían
 * desincronizarse silenciosamente si alguien cambia el YAML sin tocar este
 * archivo -- leerlos en runtime desde la misma fuente elimina esa clase de
 * bug por construcción.
 */
export interface BorderlineThresholds {
  min: number;
  max: number;
}

export function loadBorderlineThresholds(policyFilePath: string): BorderlineThresholds {
  const raw = fs.readFileSync(policyFilePath, "utf-8");
  const parsed = yaml.load(raw) as unknown;

  if (typeof parsed !== "object" || parsed === null) {
    throw new Error(`policies.yaml en ${policyFilePath} no parseó como objeto`);
  }
  const p = parsed as Record<string, unknown>;
  const config = p.config as Record<string, unknown> | undefined;
  if (typeof config !== "object" || config === null) {
    throw new Error(`policies.yaml en ${policyFilePath} no tiene un objeto "config"`);
  }

  const min = config.borderline_score_min;
  const max = config.borderline_score_max;
  if (typeof min !== "number" || typeof max !== "number") {
    throw new Error(
      `policies.yaml en ${policyFilePath} no tiene "config.borderline_score_min"/"config.borderline_score_max" numéricos`
    );
  }

  return { min, max };
}
