locals {
  name_prefix = "${var.project_name}-${var.environment}"

  common_tags = merge(
    {
      Project     = var.project_name
      Environment = var.environment
      ManagedBy   = "terraform"
      Module      = "secrets"
    },
    var.tags
  )
}

# --- SSM Parameter Store: configuración NO sensible ---
#
# Config de Bedrock que el futuro Lambda de conversation-agent leerá en
# runtime (fase 3+ de docs/PLAN.md). No sensible -> String plano, no
# SecureString.
resource "aws_ssm_parameter" "bedrock_model_id" {
  name        = "/${local.name_prefix}/bedrock/model_id"
  description = "Model ID de Amazon Bedrock usado por conversation-agent."
  type        = "String"
  value       = var.bedrock_model_id

  tags = local.common_tags
}

resource "aws_ssm_parameter" "bedrock_region" {
  name        = "/${local.name_prefix}/bedrock/region"
  description = "Región AWS donde se invoca Amazon Bedrock."
  type        = "String"
  value       = var.bedrock_region

  tags = local.common_tags
}

# Model ID de Titan Embeddings para el matcher de transacciones disputadas
# (services/transaction-agent/src/matching/). Mismo criterio no-sensible
# que bedrock_model_id -- String plano.
resource "aws_ssm_parameter" "embedding_model_id" {
  name        = "/${local.name_prefix}/bedrock/embedding_model_id"
  description = "Model ID de Amazon Bedrock (Titan Embeddings) usado por transaction-agent para desambiguar transacciones disputadas."
  type        = "String"
  value       = var.embedding_model_id

  tags = local.common_tags
}

# --- Secreto HMAC de sesión (auth-agent firma, conversation-agent verifica) ---
#
# Generado por Terraform (nunca elegido a mano/hardcodeado) -- mismo
# criterio que cualquier secreto real: no versionado en git, no visible en
# ningún plan/output (`random_password.session_token_secret.result` es
# sensitive por default). SecureString (a diferencia de los parámetros de
# Bedrock de arriba, que son config no sensible) -- ambos Lambdas necesitan
# `ssm:GetParameter` + `kms:Decrypt` sobre este parámetro puntual (ver
# terraform/modules/agent, roles de auth_agent y conversation_agent).
resource "random_password" "session_token_secret" {
  length  = 48
  special = false # SSM SecureString + HMAC no necesitan caracteres especiales -- simplifica debugging sin perder entropía (48 chars alfanuméricos).
}

resource "aws_ssm_parameter" "session_token_secret" {
  name        = "/${local.name_prefix}/auth/session_token_secret"
  description = "Secreto HMAC-SHA256 para firmar/verificar sessionToken (services/auth-agent firma, conversation-agent verifica). Generado por Terraform, nunca en git."
  type        = "SecureString"
  value       = random_password.session_token_secret.result

  tags = local.common_tags
}

# --- API key de Resend (login por código OTP, services/auth-agent/src/otp) ---
#
# A diferencia de `session_token_secret` (generado por Terraform), esta es
# una credencial de un servicio de terceros que YA existe fuera de este
# proyecto -- Terraform solo crea el parámetro con un placeholder; el valor
# real lo carga el usuario después vía `aws ssm put-parameter --overwrite`
# (nunca pasa por el chat/logs de esta sesión, ni por un archivo versionado).
# `lifecycle.ignore_changes` evita que un `terraform apply` futuro pise ese
# valor real de vuelta al placeholder -- mismo problema que resolvería
# "importar" el recurso, pero sin el paso manual de `terraform import`.
resource "aws_ssm_parameter" "resend_api_key" {
  name        = "/${local.name_prefix}/auth/resend_api_key"
  description = "API key de Resend (servicio de terceros) para el envío de códigos OTP por email. Placeholder en Terraform -- el valor real se carga fuera de banda vía AWS CLI, nunca en git."
  type        = "SecureString"
  value       = var.resend_api_key

  lifecycle {
    ignore_changes = [value]
  }

  tags = local.common_tags
}

# --- Secrets Manager: valores sensibles ---
#
# Placeholder genérico para credenciales de terceros que el proyecto pueda
# necesitar en fases posteriores. Este checkpoint NO guarda secretos reales
# -- solo demuestra el patrón (recurso + versión con valor dummy marcado
# sensitive) para que agent/orchestration lo consuman más adelante vía
# data source, sin tener que re-diseñar el módulo.
resource "aws_secretsmanager_secret" "third_party_api_credentials" {
  name        = "${local.name_prefix}/third-party-api-credentials"
  description = "Credenciales de terceros (placeholder). Reemplazar con valores reales fuera de git antes de usar en producción."

  tags = local.common_tags
}

resource "aws_secretsmanager_secret_version" "third_party_api_credentials" {
  secret_id     = aws_secretsmanager_secret.third_party_api_credentials.id
  secret_string = jsonencode(var.third_party_api_credentials)
}
