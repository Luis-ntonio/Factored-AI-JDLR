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
