variable "project_name" {
  description = "Nombre corto del proyecto, usado como prefijo de naming/tagging (contrato compartido con agent, edge, data, secrets)."
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

variable "conversation_agent_lambda_arn" {
  description = "ARN del Lambda de conversation-agent (module.agent.conversation_agent_function_arn). Task 'Understand' de la Step Function."
  type        = string
}

variable "policy_agent_lambda_arn" {
  description = "ARN del Lambda de policy-agent (module.agent.policy_agent_function_arn). Task 'Decide' de la Step Function."
  type        = string
}

variable "retrieval_agent_lambda_arn" {
  description = "ARN del Lambda de retrieval-agent (module.agent.retrieval_agent_function_arn). Task 'ActRetrieval' de la Step Function."
  type        = string
}

variable "transaction_agent_lambda_arn" {
  description = "ARN del Lambda de transaction-agent (module.agent.transaction_agent_function_arn). Task 'ActTransaction' de la Step Function."
  type        = string
}

variable "verification_agent_lambda_arn" {
  description = "ARN del Lambda de verification-agent (module.agent.verification_agent_function_arn). Task 'Verify' de la Step Function, invocado después de ActRetrieval/ActTransaction en el camino AUTO."
  type        = string
}

variable "escalation_agent_lambda_arn" {
  description = "ARN del Lambda de escalation-agent (module.agent.escalation_agent_function_arn). Tasks 'EscalateFromPolicy' (decisión ESCALATE de policy-agent en pre_action) y 'EscalateFromVerification' (resultado AUTO marcado pending_confirmation por verification-agent) de la Step Function."
  type        = string
}

variable "log_retention_days" {
  description = "Retención en CloudWatch Logs del log group de logging de la Step Function y del Lambda dispatcher."
  type        = number
  default     = 30
}

variable "dispatcher_lambda_timeout" {
  description = <<-EOT
    Timeout (segundos) del Lambda dispatcher (API Gateway -> StartSyncExecution).
    API Gateway HTTP API tiene un timeout DURO de 29s no configurable -- este
    valor debe quedar por debajo de eso para que el dispatcher siempre pueda
    devolver una respuesta (aunque sea 'unavailable') antes de que API
    Gateway corte la conexión.
  EOT
  type        = number
  default     = 28
}
