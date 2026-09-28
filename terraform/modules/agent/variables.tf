variable "project_name" {
  description = "Nombre corto del proyecto, usado como prefijo de naming/tagging (contrato compartido con data, edge, secrets, orchestration)."
  type        = string
}

variable "environment" {
  description = "Nombre del ambiente (dev/uat/prod). Checkpoint actual solo usa 'dev'."
  type        = string
}

variable "tags" {
  description = "Tags adicionales a mergear con las tags base de proyecto/ambiente."
  type        = map(string)
  default     = {}
}

variable "repo_root" {
  description = <<-EOT
    Path absoluto a la raíz del monorepo. Usado para invocar
    `terraform/scripts/package-lambdas.js` (bundling con esbuild de los 4
    Lambdas de lógica de negocio) y para calcular los triggers de re-build
    (hash de los `src/` de cada servicio + `packages/shared/src` +
    `policies.yaml`).
  EOT
  type        = string
}

variable "enable_lambda_build" {
  description = <<-EOT
    Permite desactivar el build automático (null_resource + esbuild) si los
    zips ya fueron generados manualmente (`npm run package:lambdas`) y se
    quiere evitar recompilar en cada apply. Default true.
  EOT
  type        = bool
  default     = true
}

# --- Referencias a recursos de otros módulos (pasadas explícitamente para
# evitar dependencias implícitas entre módulos y mantener el grafo de
# Terraform legible desde envs/dev/main.tf) ---

variable "case_store_table_name" {
  description = "Nombre de la tabla DynamoDB de case/session/conversation state (module.data.table_name)."
  type        = string
}

variable "case_store_table_arn" {
  description = "ARN de la tabla DynamoDB de case/session/conversation state (module.data.table_arn)."
  type        = string
}

variable "catalog_table_name" {
  description = "Nombre de la tabla DynamoDB del catálogo de productos/FAQs (module.data.product_catalog_table_name)."
  type        = string
}

variable "catalog_table_arn" {
  description = "ARN de la tabla DynamoDB del catálogo de productos/FAQs (module.data.product_catalog_table_arn)."
  type        = string
}

variable "lambda_timeout" {
  description = "Timeout (segundos) de los 4 Lambdas de lógica de negocio. Deben terminar bien por debajo del timeout del dispatcher (~28s) y del límite duro de 29s de API Gateway HTTP API."
  type        = number
  default     = 15
}

variable "lambda_memory_size" {
  description = "Memoria (MB) asignada a los 4 Lambdas de lógica de negocio."
  type        = number
  default     = 256
}

variable "log_retention_days" {
  description = "Retención en CloudWatch Logs de los log groups de los 4 Lambdas de lógica de negocio."
  type        = number
  default     = 30
}

# --- Bedrock IAM real (fase "Habilitar Bedrock real" -- ver README.md,
# sección "Bedrock IAM: decisión de diferir (RESUELTO)"). SOLO consumidas
# por conversation_agent/policy_agent -- ningún otro rol de este módulo
# necesita estas variables. ---

variable "bedrock_model_id" {
  description = <<-EOT
    ID del inference profile de Amazon Bedrock (ver module.secrets). Usado
    para construir el ARN exacto (`arn:aws:bedrock:<region>:<account_id>:
    inference-profile/<este valor>`) al que se scopea `bedrock:InvokeModel`/
    `bedrock:Converse` en el IAM de conversation_agent/policy_agent. Nunca
    `Resource = "*"`.
  EOT
  type        = string
}

variable "bedrock_region" {
  description = <<-EOT
    Región AWS donde se invoca Bedrock y donde viven los parámetros SSM de
    bedrock_model_id/bedrock_region (mismo valor que envs/dev pasa hoy a
    module.secrets). Default "us-east-1", igual que var.aws_region de este
    ambiente -- este checkpoint despliega todo en una sola región.
  EOT
  type        = string
  default     = "us-east-1"
}

variable "bedrock_model_id_ssm_parameter_name" {
  description = "Nombre del parámetro SSM (module.secrets.bedrock_model_id_parameter_name) que conversation-agent/policy-agent leen en runtime vía ssm:GetParameter, en vez de hardcodear el model ID en su código."
  type        = string
}

variable "bedrock_region_ssm_parameter_name" {
  description = "Nombre del parámetro SSM (module.secrets.bedrock_region_parameter_name) que conversation-agent/policy-agent leen en runtime vía ssm:GetParameter."
  type        = string
}

variable "session_token_secret_parameter_name" {
  description = "Nombre del parámetro SSM SecureString (module.secrets.session_token_secret_parameter_name) que auth-agent (firma) y conversation-agent (verifica) leen en runtime."
  type        = string
}

variable "session_token_secret_parameter_arn" {
  description = "ARN del mismo parámetro (module.secrets.session_token_secret_parameter_arn) -- scoping exacto de la IAM policy ssm:GetParameter de auth-agent/conversation-agent."
  type        = string
}

variable "resend_api_key_parameter_name" {
  description = "Nombre del parámetro SSM SecureString (module.secrets.resend_api_key_parameter_name) que auth-agent lee para enviar códigos OTP por email vía Resend."
  type        = string
}

variable "resend_api_key_parameter_arn" {
  description = "ARN del mismo parámetro (module.secrets.resend_api_key_parameter_arn) -- scoping exacto de la IAM policy ssm:GetParameter de auth-agent."
  type        = string
}

variable "resend_from_email" {
  description = "Dirección FROM verificada en la cuenta de Resend del usuario (ej. no-reply@phonance.com) -- config NO sensible, se pasa como env var plana al Lambda de auth-agent, no vía SSM."
  type        = string
}

variable "otp_table_name" {
  description = "Nombre de la tabla DynamoDB de códigos OTP (module.data.otp_codes_table_name)."
  type        = string
}

variable "otp_table_arn" {
  description = "ARN de la misma tabla (module.data.otp_codes_table_arn) -- scoping exacto de la IAM policy dynamodb:* de auth-agent."
  type        = string
}
