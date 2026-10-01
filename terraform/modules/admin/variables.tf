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
  description = <<-EOT
    Timeout (segundos) del Lambda admin-agent. Subido de 15s a 180s con el
    simulador de conversaciones: la invocación ASÍNCRONA del worker
    (`lambda:InvokeFunction`, `InvocationType: Event`, ver
    `services/admin-agent/src/simulation/run-simulation.ts`) corre hasta 6
    turnos reales contra el pipeline desplegado (p95 medido ~10s/turno,
    `docs/USAGE-ANALYTICS.md`) más la llamada a Bedrock del simulador de
    usuario entre turnos -- 15s alcanzaba para las 2 rutas de solo lectura
    originales, nunca para este worker. Las rutas de API Gateway
    (`/admin/conversations*`, `POST /admin/simulations`) siguen devolviendo
    en milisegundos de todas formas -- este timeout solo importa de verdad
    para la invocación asíncrona del worker.
  EOT
  type        = number
  default     = 180
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

# --- Simulador de conversaciones ------------------------------------------

variable "case_store_table_by_customer_index_arn" {
  description = "ARN del GSI `by-customer` de la tabla case-store (module.data) -- scoping exacto de dynamodb:Query para listar corridas de simulación (gsi1pk=\"SIMULATIONS\", ver services/admin-agent/src/simulation/store.ts). Reusa el MISMO GSI que ya existe, nunca uno nuevo."
  type        = string
}

variable "bedrock_model_id" {
  description = "Model ID de Bedrock a invocar para el simulador de usuario -- MISMO valor que ya usan conversation-agent/policy-agent (module.secrets.bedrock_model_id), nunca un modelo distinto."
  type        = string
}

variable "bedrock_region" {
  description = "Región de Bedrock -- MISMO valor que ya usan conversation-agent/policy-agent."
  type        = string
}

variable "bedrock_model_id_ssm_parameter_name" {
  description = "Nombre del parámetro SSM con el model id de Bedrock (module.secrets.bedrock_model_id_parameter_name) -- MISMO parámetro que ya leen conversation-agent/policy-agent, nunca uno nuevo."
  type        = string
}

variable "bedrock_region_ssm_parameter_name" {
  description = "Nombre del parámetro SSM con la región de Bedrock (module.secrets.bedrock_region_parameter_name)."
  type        = string
}

variable "chat_api_endpoint" {
  description = "URL completa de POST /chat -- el worker del simulador llama a este endpoint PÚBLICO real, exactamente como lo hace apps/web/src/api.ts, nunca invoca la Step Function directo. Literal en terraform/envs/dev/variables.tf (var.chat_api_url) -- derivarlo de module.edge.api_endpoint crearía un ciclo (module.edge ya depende de module.admin para admin_route_lambda_invoke_arn)."
  type        = string
}

variable "auth_login_endpoint" {
  description = "URL completa de POST /auth/login -- el worker del simulador loguea de verdad con los datos del perfil mock elegido, igual que un browser real. Mismo motivo de literal que chat_api_endpoint."
  type        = string
}
