variable "project_name" {
  description = "Nombre corto del proyecto, usado como prefijo de naming/tagging (contrato compartido con el resto de módulos)."
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

variable "lambda_timeout" {
  description = "Timeout (segundos) del Lambda admin-agent."
  type        = number
  default     = 15
}

variable "lambda_memory_size" {
  description = "Memoria (MB) asignada al Lambda admin-agent."
  type        = number
  default     = 256
}

variable "log_retention_days" {
  description = "Retención en CloudWatch Logs del log group del Lambda admin-agent (el SUYO propio -- no confundir con el log group de la Step Function que admin-agent LEE, ver state_machine_log_group_arn abajo)."
  type        = number
  default     = 30
}

variable "case_store_table_name" {
  description = "Nombre de la tabla DynamoDB de case/session/conversation state (module.data.table_name) -- admin-agent la escanea (Scan) para listar conversaciones."
  type        = string
}

variable "case_store_table_arn" {
  description = "ARN de la misma tabla -- scoping exacto de la IAM policy dynamodb:Scan de admin-agent."
  type        = string
}

variable "state_machine_log_group_name" {
  description = <<-EOT
    Nombre del log group de CloudWatch de la Step Function
    (module.orchestration.state_machine_log_group_name) -- admin-agent lo
    consulta (FilterLogEvents) para reconstruir la traza completa de un
    caso. Ya existe y ya loguea TODO (logging_configuration level=ALL,
    include_execution_data=true en terraform/modules/orchestration) --
    admin-agent NUNCA agrega logging nuevo, solo lee.
  EOT
  type        = string
}

variable "state_machine_log_group_arn" {
  description = "ARN del mismo log group -- scoping exacto de la IAM policy logs:FilterLogEvents de admin-agent."
  type        = string
}

variable "admin_api_key_parameter_name" {
  description = "Nombre del parámetro SSM SecureString (module.secrets.admin_api_key_parameter_name) que admin-agent lee para validar el header x-admin-key."
  type        = string
}

variable "admin_api_key_parameter_arn" {
  description = "ARN del mismo parámetro -- scoping exacto de la IAM policy ssm:GetParameter de admin-agent."
  type        = string
}
