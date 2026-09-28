#!/usr/bin/env node
/**
 * Bundlea y empaqueta los 7 Lambdas de lógica de negocio del pipeline
 * (conversation-agent, policy-agent, retrieval-agent, transaction-agent,
 * verification-agent, escalation-agent, auth-agent) en un único archivo CJS por
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
 *
 * `external` de `@aws-sdk/*`, por qué NO es uniforme en los 6 servicios
 * (fase "Habilitar Bedrock real"): el runtime Node.js 20.x de Lambda trae
 * preinstalado el SDK v3 completo de los servicios "core" de AWS (entre
 * ellos `@aws-sdk/client-dynamodb`/`@aws-sdk/lib-dynamodb`, ya verificado
 * funcionando en producción para retrieval-agent/transaction-agent/
 * conversation-agent) -- para esos paquetes, `external` ahorra tamaño de
 * zip sin riesgo. NO hay garantía equivalente de que la capa administrada
 * del runtime incluya `@aws-sdk/client-bedrock-runtime` ni
 * `@aws-sdk/client-ssm` (paquetes que conversation-agent/policy-agent
 * empezaron a usar en esta fase para invocar Bedrock y leer su config desde
 * SSM Parameter Store) -- si se marcaran `external` sin esa garantía, el
 * riesgo real es un Lambda que falla en runtime con "Cannot find module
 * '@aws-sdk/client-bedrock-runtime'". Por eso `conversation-agent` usa una
 * lista explícita de `external` (NO el wildcard `@aws-sdk/*`) que sigue
 * excluyendo dynamodb/lib-dynamodb pero bundlea bedrock-runtime/ssm, y
 * `policy-agent` (que hoy no usa ningún paquete `@aws-sdk/*` "core") no
 * excluye nada, bundleando lo que haga falta. Los otros 4 servicios no
 * tocan Bedrock/SSM -- se quedan con el wildcard `@aws-sdk/*` de siempre.
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
const { execSync } = require("node:child_process");
const esbuild = require("esbuild");

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const OUT_ROOT = path.resolve(__dirname, "..", "modules", "agent", "build");
const POLICIES_YAML_SRC = path.join(REPO_ROOT, "policies.yaml");

// BUG REAL encontrado (2026-09-28): `auth-agent/src/index.ts` importa
// `@banking-agent/transaction-agent/dist/data/mock-core-banking` -- una
// ruta que resuelve, vía el symlink de npm workspaces, al JS YA COMPILADO
// de transaction-agent, no a su fuente TypeScript. `local.source_dirs`
// (terraform/modules/agent/main.tf) hashea el `.ts` fuente y SÍ dispara un
// rebuild cuando cambia -- pero este script, hasta este fix, nunca
// recompilaba `transaction-agent` antes de bundlear con esbuild, así que
// esbuild inlineaba lo que hubiera en `dist/` en ese momento, sin importar
// qué tan fresco fuera. Confirmado en producción: un cambio real en
// `mock-core-banking.ts` (email de prueba de un customer) no se reflejó en
// el Lambda de auth-agent desplegado hasta correr este `npm run build`
// EXPLÍCITAMENTE antes de un segundo `terraform apply`. Se corre acá,
// siempre, antes de bundlear, para que esto no vuelva a pasar.
console.log("[package-lambdas] recompilando @banking-agent/transaction-agent (dependencia de dist/ de auth-agent)...");
execSync("npm run build --workspace=@banking-agent/transaction-agent", { cwd: REPO_ROOT, stdio: "inherit" });

// Paquetes del SDK v3 "core" que el runtime administrado Node.js 20.x de
// Lambda SÍ trae preinstalados -- seguro marcarlos `external` (no bundlear).
const AWS_SDK_CORE_EXTERNAL = ["@aws-sdk/client-dynamodb", "@aws-sdk/lib-dynamodb"];

/** @type {{name: string, entry: string, copyPolicies: boolean, external: string[]}[]} */
const LAMBDAS = [
  {
    name: "conversation-agent",
    entry: path.join(REPO_ROOT, "services/conversation-agent/src/index.ts"),
    copyPolicies: false,
    // Lista explícita (NO el wildcard "@aws-sdk/*"): sigue sin bundlear
    // dynamodb/lib-dynamodb (preinstalados en el runtime), pero SÍ bundlea
    // client-bedrock-runtime/client-ssm (sin garantía de que el runtime los
    // traiga preinstalados -- ver comentario arriba).
    external: AWS_SDK_CORE_EXTERNAL,
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
    // No usa ningún @aws-sdk/* "core" -- bundlea todo lo que haga falta
    // (client-bedrock-runtime/client-ssm incluidos), nada external.
    external: [],
  },
  {
    name: "retrieval-agent",
    entry: path.join(REPO_ROOT, "services/retrieval-agent/src/index.ts"),
    copyPolicies: false,
    external: ["@aws-sdk/*"],
  },
  {
    name: "transaction-agent",
    entry: path.join(REPO_ROOT, "services/transaction-agent/src/index.ts"),
    copyPolicies: true,
    external: ["@aws-sdk/*"],
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
    external: ["@aws-sdk/*"],
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
    external: ["@aws-sdk/*"],
  },
  {
    // Login de plataforma, expuesto vía API Gateway (POST /auth/login) --
    // NUNCA invocado por la Step Function, mismo motivo por el que
    // conversation-agent tampoco lo es. No lee policies.yaml. Mismo
    // criterio que policy-agent (external: []): no usa ningún @aws-sdk/*
    // "core" (dynamodb), solo client-ssm, sin garantía de que el runtime
    // administrado lo traiga preinstalado -- se bundlea completo.
    name: "auth-agent",
    entry: path.join(REPO_ROOT, "services/auth-agent/src/index.ts"),
    copyPolicies: false,
    external: [],
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
      external: lambda.external,
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
