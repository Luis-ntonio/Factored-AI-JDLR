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
