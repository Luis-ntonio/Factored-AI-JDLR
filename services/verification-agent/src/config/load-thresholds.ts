import * as fs from "node:fs";
import * as yaml from "js-yaml";

/**
 * Lee `config.borderline_score_min`/`config.borderline_score_max`
 * directamente de `policies.yaml` (raíz del monorepo) con `js-yaml`, MISMO
 * mecanismo y MISMA fuente que usan `services/policy-agent/src/evaluator.ts`
 * (`loadPolicyFile`) y `services/transaction-agent/src/config/load-thresholds.ts`
 * (`loadBorderlineThresholds`).
 *
 * Decisión propia deliberada: este archivo es una copia funcionalmente
 * idéntica a `services/transaction-agent/src/config/load-thresholds.ts`, NO
 * una dependencia cross-package hacia `@banking-agent/transaction-agent`.
 * Cada servicio de `services/*` es su propio paquete Lambda independiente
 * (mismo criterio ya aplicado por `retrieval-agent` al no depender de
 * `transaction-agent` ni viceversa) -- acoplar el bundle de verification-agent
 * al código completo de transaction-agent solo para reusar 15 líneas de
 * lectura de YAML introduciría una dependencia de despliegue innecesaria
 * (un cambio no relacionado en transaction-agent podría romper el build de
 * verification-agent) a cambio de evitar una duplicación mínima y estable.
 * `policies.yaml` sigue siendo la ÚNICA fuente de verdad de los números en
 * sí -- lo que se duplica acá es el MECANISMO de lectura, no el valor.
 *
 * Esto es precisamente lo que permite a verification-agent hacer una
 * verificación INDEPENDIENTE de `score_zone` (recalculada desde la misma
 * fuente de umbrales, sin confiar ciegamente en el `score_zone` que ya viene
 * calculado por transaction-agent) -- ver `src/verify.ts`.
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
