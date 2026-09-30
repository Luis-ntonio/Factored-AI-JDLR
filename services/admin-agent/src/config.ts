import { GetParameterCommand, SSMClient } from "@aws-sdk/client-ssm";

/**
 * Resuelve en runtime el API key de admin desde SSM Parameter Store
 * (SecureString) -- mismo patrón de caché en memoria + reintentos
 * acotados que `services/auth-agent/src/config.ts`.
 *
 * Variable de entorno: `ADMIN_API_KEY_PARAM_NAME` (nombre del parámetro,
 * no el valor -- provisto por Terraform, `terraform/modules/secrets`,
 * `aws_ssm_parameter.admin_api_key`). El valor real lo carga el usuario
 * fuera de banda (mismo mecanismo ya usado para `resend_api_key`), nunca
 * se hardcodea ni se versiona.
 *
 * Deliberadamente SEPARADO del `sessionToken` de clientes
 * (`packages/shared/src/session-token.ts`) -- este dashboard es una
 * superficie interna (nunca expuesta a un cliente bancario), no encaja en
 * el modelo de roles `anonimo`/`cliente`/`cliente_estrella`.
 */
export interface AdminConfig {
  adminApiKey: string;
}

let cachedConfig: AdminConfig | null | undefined;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface GetAdminConfigOptions {
  /** Inyectable para tests -- nunca pega a AWS real desde `npm test`. */
  ssmClient?: Pick<SSMClient, "send">;
  maxRetries?: number;
  baseDelayMs?: number;
}

export async function getAdminConfig(options: GetAdminConfigOptions = {}): Promise<AdminConfig> {
  if (cachedConfig !== undefined && cachedConfig !== null) return cachedConfig;

  const paramName = process.env.ADMIN_API_KEY_PARAM_NAME;
  if (!paramName) {
    throw new Error("ADMIN_API_KEY_PARAM_NAME env var no configurada");
  }

  const maxRetries = options.maxRetries ?? 2;
  const baseDelayMs = options.baseDelayMs ?? 75;
  const ssmClient = options.ssmClient ?? new SSMClient({});

  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await ssmClient.send(new GetParameterCommand({ Name: paramName, WithDecryption: true }));
      const value = result.Parameter?.Value;
      if (typeof value !== "string" || value.length === 0) {
        throw new Error(`Parámetro SSM ${paramName} vacío o sin valor`);
      }
      cachedConfig = { adminApiKey: value };
      return cachedConfig;
    } catch (error) {
      lastError = error;
      if (attempt < maxRetries) {
        await sleep(baseDelayMs * Math.pow(2, attempt));
      }
    }
  }

  throw new Error(`No se pudo leer el API key de admin desde SSM (${paramName}): ${String(lastError)}`);
}

/** Solo para tests -- resetea el caché en memoria entre casos. */
export function resetAdminConfigCacheForTests(): void {
  cachedConfig = undefined;
}
