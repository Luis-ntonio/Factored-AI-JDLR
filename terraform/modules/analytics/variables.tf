variable "project_name" {
  description = "Nombre corto del proyecto, usado como prefijo de naming/tagging (contrato compartido con data, edge, agent, secrets, orchestration, frontend)."
  type        = string
}

variable "environment" {
  description = "Nombre del ambiente (dev/uat/prod). Este checkpoint solo usa 'dev'."
  type        = string
}

variable "tags" {
  description = "Tags adicionales a mergear con las tags base de proyecto/ambiente."
  type        = map(string)
  default     = {}
}

variable "case_store_stream_arn" {
  description = "ARN del stream de DynamoDB Streams de case_store (module.data.case_store_stream_arn). Origen del event source mapping del Lambda de transformación."
  type        = string
}

variable "log_retention_days" {
  description = "Retención en CloudWatch Logs del Lambda de transformación y del delivery stream de Firehose."
  type        = number
  default     = 30
}

variable "firehose_buffering_size_mb" {
  description = "Tamaño de buffer (MB) antes de que Firehose escriba a S3. AWS exige mínimo 1, default razonable 5 para no generar demasiados archivos chicos con poco tráfico de validación."
  type        = number
  default     = 5
}

variable "firehose_buffering_interval_seconds" {
  description = "Intervalo de buffer (segundos) antes de que Firehose escriba a S3, si el tamaño de buffer no se alcanza antes. Default 300 (5 min, el máximo permitido por Firehose)."
  type        = number
  default     = 300
}

variable "lambda_timeout" {
  description = "Timeout (segundos) del Lambda de transformación."
  type        = number
  default     = 60
}

variable "lambda_memory_size" {
  description = "Memoria (MB) del Lambda de transformación."
  type        = number
  default     = 128
}
