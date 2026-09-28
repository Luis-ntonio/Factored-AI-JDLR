#!/usr/bin/env node
/**
 * Carga la API key real de Resend en el parámetro SSM que Terraform ya creó
 * como placeholder (`terraform/modules/secrets`, `aws_ssm_parameter.
 * resend_api_key`, con `lifecycle.ignore_changes = [value]` -- por eso un
 * `terraform apply` futuro nunca pisa el valor real que este script pone).
 *
 * Alternativa al AWS CLI (no instalado en esta máquina) -- usa el mismo
 * @aws-sdk/client-ssm que ya está en node_modules del monorepo, mismo
 * patrón que apps/web/scripts/deploy.mjs.
 *
 * La key SIEMPRE se pasa por variable de entorno, nunca como argumento de
 * línea de comandos (evita que quede en el historial de la shell) y nunca
 * se imprime en la salida de este script.
 *
 * Uso (PowerShell):
 *   $env:RESEND_API_KEY = "re_xxx..."
 *   $env:AWS_PROFILE = "banking-agent-dev"
 *   node terraform/scripts/set-resend-api-key.mjs
 *
 * Uso (bash/Git Bash):
 *   RESEND_API_KEY="re_xxx..." AWS_PROFILE=banking-agent-dev node terraform/scripts/set-resend-api-key.mjs
 */
import { execSync } from "node:child_process";
import { join } from "node:path";
import { PutParameterCommand, SSMClient } from "@aws-sdk/client-ssm";

const REPO_ROOT = new URL("../../", import.meta.url).pathname.replace(/^\/([a-zA-Z]):/, "$1:");

function terraformOutputs() {
  try {
    const raw = execSync("terraform output -json", {
      cwd: join(REPO_ROOT, "terraform", "envs", "dev"),
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return JSON.parse(raw);
  } catch {
    // Sin state todavía (apply no corrió) o sin outputs -- se usa el
    // nombre de parámetro literal (name_prefix fijo de este ambiente,
    // ver terraform/modules/secrets/main.tf).
    return {};
  }
}

async function main() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error("Falta la variable de entorno RESEND_API_KEY. Ver el docstring de este script para el uso exacto.");
    process.exitCode = 1;
    return;
  }

  const outputs = terraformOutputs();
  const parameterName = outputs.resend_api_key_parameter_name?.value ?? "/banking-agent-dev/auth/resend_api_key";

  const ssm = new SSMClient({});
  await ssm.send(
    new PutParameterCommand({
      Name: parameterName,
      Value: apiKey,
      Type: "SecureString",
      Overwrite: true,
    })
  );

  console.log(`Listo. Parámetro ${parameterName} actualizado (valor no impreso).`);
}

main().catch((err) => {
  console.error("set-resend-api-key.mjs falló:", err.message ?? err);
  process.exitCode = 1;
});
