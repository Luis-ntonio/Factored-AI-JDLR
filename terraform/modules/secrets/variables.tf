variable "project_name" {
  description = "Nombre corto del proyecto, usado como prefijo de naming/tagging (contrato compartido con edge, data, y los módulos pendientes)."
  type        = string
}

variable "environment" {
  description = "Nombre del ambiente (dev/uat/prod). Checkpoint 0 solo usa 'dev'."
  type        = string
}

variable "tags" {
  description = "Tags adicionales a mergear con las tags base de proyecto/ambiente."
  type        = map(string)
  default     = {}
}

variable "bedrock_model_id" {
  description = <<-EOT
    ID de Amazon Bedrock que usará el futuro Lambda de conversation-agent. No
    sensible — se guarda en SSM Parameter Store como String plano.

    Este default NO se usa en la práctica: `envs/dev` siempre pasa un valor
    explícito (`var.bedrock_model_id` de ese ambiente). Se actualiza igual
    para que quede consistente y no engañoso si alguna vez se instancia este
    módulo sin pasar el valor explícitamente. Valor real elegido (fase
    "Habilitar Bedrock real"): inference profile de Claude Sonnet 5
    (`us.anthropic.claude-sonnet-5`) — ver README.md de este módulo para la
    evidencia real de por qué es un inference profile y no un model ID
    directo, y para el bloqueador de "model access" pendiente.
  EOT
  type        = string
  default     = "us.anthropic.claude-sonnet-5"
}

variable "bedrock_region" {
  description = "Región AWS donde se invocará Bedrock (puede diferir de la región de despliegue del resto de la infra)."
  type        = string
  default     = "us-east-1"
}

variable "third_party_api_credentials" {
  description = <<-EOT
    Placeholder para credenciales de terceros que el proyecto pueda necesitar
    más adelante (ej. un proveedor de datos bancarios simulados, servicio de
    verificación externo, etc.). Se guarda como JSON en Secrets Manager.
    Valor dummy en este checkpoint — NO contiene secretos reales. Reemplazar
    vía `terraform apply -var` o un tfvars fuera de control de versiones
    cuando exista un secreto real que guardar.
  EOT
  type        = map(string)
  default     = { placeholder = "replace-me" }
  sensitive   = true
}
