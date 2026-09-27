#!/usr/bin/env node
/**
 * Bundlea y empaqueta los 6 Lambdas de lógica de negocio del pipeline
 * (conversation-agent, policy-agent, retrieval-agent, transaction-agent,
 * verification-agent, escalation-agent) en un único archivo CJS por
 * servicio con esbuild, y copia `policies.yaml` (raíz del monorepo) dentro
 * del paquete de los tres servicios que lo leen en runtime (policy-agent,
 * transaction-agent, verification-agent).
 *
 * POR QUÉ esbuild en vez de zippear dist/+node_modules tal cual:
 * `@banking-agent/shared` es una dependencia de npm workspaces resuelta
 * como symlink en node_modules/, no un paquete publicado. Un zip ingenuo de
 * dist/+node_modules corre el riesgo real de terminar en un Lambda que
 * falla en runtime con "Cannot find module '@banking-agent/shared'"
 * (symlink roto fuera del contexto del monorepo) o en un zip inflado con
 * todas las dependencias transitivas del workspace. Bundlear con esbuild
 * (`--bundle`, entry point en TypeScript directo -- esbuild transila TS sin
 * type-check, el type-check real ya lo hace `npm run build`/`tsc` antes de
 * este paso) resuelve el grafo de módulos e inlinea todo lo que no está
 * marcado `external`, symlinks incluidos, evitando el problema de raíz.
 * Solo se excluye `@aws-sdk/*`: el runtime Node.js 20.x de Lambda trae el
 * SDK v3 completo preinstalado, no hace falta bundlearlo (ahorra tamaño de
 * paquete y evita duplicar una dependencia pesada).
 *
 * Invocado por Terraform (`null_resource.build_lambdas` en
 * `terraform/modules/agent`) en cada `terraform apply` que cambie el código
 * fuente de estos 6 servicios o de `packages/shared`. También se puede
 * correr a mano para inspeccionar el resultado sin aplicar Terraform:
 *
 *   npm run package:lambdas
 *   # o, equivalente:
 *   node terraform/scripts/package-lambdas.js
 *
 * Requiere `esbuild` ya instalado en la raíz del monorepo (`npm install`,
 * `esbuild` es devDependency del package.json raíz).
 *
 * Reliability de ESTE script (criterio de herramienta de build/CI, no de
 * Lambda en runtime -- mismo criterio que
 * services/retrieval-agent/scripts/seed-catalog.ts): si esbuild falla para
 * cualquier lambda, se propaga la excepción y el proceso termina con código
 * de salida distinto de 0, para que el `local-exec` de Terraform (o quien
 * corra este script en CI) se entere y no continúe con un paquete a medio
 * generar.
 */

const path = require("node:path");
const fs = require("node:fs");
const esbuild = require("esbuild");

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const OUT_ROOT = path.resolve(__dirname, "..", "modules", "agent", "build");
const POLICIES_YAML_SRC = path.join(REPO_ROOT, "policies.yaml");

/** @type {{name: string, entry: string, copyPolicies: boolean}[]} */
const LAMBDAS = [
  {
    name: "conversation-agent",
    entry: path.join(REPO_ROOT, "services/conversation-agent/src/index.ts"),
    copyPolicies: false,
  },
  {
    // Entry point deliberado: src/handler.ts (no index.ts) -- ver
    // services/policy-agent/src/index.ts, que solo re-exporta handler.ts.
    // Se bundlea igual a build/policy-agent/index.js (mismo nombre de
    // archivo que los otros 3) para que el `handler` de configuración del
    // Lambda sea uniformemente "index.handler" en los 4 servicios.
    name: "policy-agent",
    entry: path.join(REPO_ROOT, "services/policy-agent/src/handler.ts"),
    copyPolicies: true,
  },
  {
    name: "retrieval-agent",
    entry: path.join(REPO_ROOT, "services/retrieval-agent/src/index.ts"),
    copyPolicies: false,
  },
  {
    name: "transaction-agent",
    entry: path.join(REPO_ROOT, "services/transaction-agent/src/index.ts"),
    copyPolicies: true,
  },
  {
    // Entry point deliberado: src/handler.ts (no index.ts) -- mismo criterio
    // que policy-agent (ver arriba): verification-agent es un Task-a-Task
    // interno, nunca expuesto vía API Gateway
    // (services/verification-agent/src/index.ts solo re-exporta handler.ts).
    name: "verification-agent",
    entry: path.join(REPO_ROOT, "services/verification-agent/src/handler.ts"),
    // Lee config.borderline_score_min/_max de policies.yaml en runtime
    // (POLICY_FILE_PATH) para recalcular score_zone de forma independiente
    // -- mismo mecanismo que policy-agent/transaction-agent.
    copyPolicies: true,
  },
  {
    // Entry point deliberado: src/handler.ts (no index.ts) -- mismo criterio
    // que policy-agent/verification-agent: escalation-agent es un
    // Task-a-Task interno, nunca expuesto vía API Gateway
    // (services/escalation-agent/src/index.ts solo re-exporta handler.ts).
    name: "escalation-agent",
    entry: path.join(REPO_ROOT, "services/escalation-agent/src/handler.ts"),
    // Pura transformación de datos ya recibidos en el evento -- no lee
    // policies.yaml ni ninguna otra configuración en runtime.
    copyPolicies: false,
  },
];

function main() {
  fs.mkdirSync(OUT_ROOT, { recursive: true });

  for (const lambda of LAMBDAS) {
    const outDir = path.join(OUT_ROOT, lambda.name);
    fs.mkdirSync(outDir, { recursive: true });
    const outfile = path.join(outDir, "index.js");

    console.log(`[package-lambdas] bundling ${lambda.name}: ${lambda.entry} -> ${outfile}`);

    esbuild.buildSync({
      entryPoints: [lambda.entry],
      outfile,
      bundle: true,
      platform: "node",
      target: "node20",
      format: "cjs",
      // El SDK v3 completo viene preinstalado en el runtime Node.js 20.x de
      // Lambda -- no se bundlea, se resuelve en runtime desde el layer del
      // propio runtime.
      external: ["@aws-sdk/*"],
      logLevel: "info",
      sourcemap: false,
      minify: false,
    });

    if (lambda.copyPolicies) {
      const dest = path.join(outDir, "policies.yaml");
      fs.copyFileSync(POLICIES_YAML_SRC, dest);
      console.log(`[package-lambdas] copied policies.yaml -> ${dest}`);
    }
  }

  console.log("[package-lambdas] done.");
}

main();
