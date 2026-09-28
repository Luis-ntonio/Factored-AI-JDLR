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
