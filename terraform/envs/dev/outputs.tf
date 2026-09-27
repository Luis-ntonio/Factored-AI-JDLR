output "case_store_table_name" {
  description = "Nombre de la tabla DynamoDB de case/session/conversation state."
  value       = module.data.table_name
}

output "case_store_table_arn" {
  description = "ARN de la tabla DynamoDB de case/session/conversation state."
  value       = module.data.table_arn
}

output "case_store_stream_arn" {
  description = "ARN del stream de DynamoDB Streams de case_store, consumido por module.analytics (si está habilitado -- ver var.enable_analytics_pipeline)."
  value       = module.data.case_store_stream_arn
}

output "product_catalog_table_name" {
  description = "Nombre de la tabla DynamoDB del catálogo de productos de crédito + FAQs."
  value       = module.data.product_catalog_table_name
}

output "product_catalog_table_arn" {
  description = "ARN de la tabla DynamoDB del catálogo de productos de crédito + FAQs."
  value       = module.data.product_catalog_table_arn
}

output "chat_api_endpoint" {
  description = "Endpoint invocable del API Gateway del chat (sin auth ni WAF en este checkpoint — ver terraform/README.md)."
  value       = module.edge.api_endpoint
}

output "chat_api_id" {
  description = "ID del API Gateway del chat."
  value       = module.edge.api_id
}

output "bedrock_model_id_parameter_name" {
  description = "Nombre del parámetro SSM con el model ID de Bedrock (inference profile real elegido, ningún Lambda lo consume todavía — ver terraform/modules/secrets/README.md)."
  value       = module.secrets.bedrock_model_id_parameter_name
}

output "third_party_api_credentials_secret_arn" {
  description = "ARN del secreto placeholder de Secrets Manager."
  value       = module.secrets.third_party_api_credentials_secret_arn
}

# --- Lambdas de lógica de negocio (module.agent) ---

output "conversation_agent_function_name" {
  value = module.agent.conversation_agent_function_name
}

output "conversation_agent_function_arn" {
  value = module.agent.conversation_agent_function_arn
}

output "policy_agent_function_name" {
  value = module.agent.policy_agent_function_name
}

output "policy_agent_function_arn" {
  value = module.agent.policy_agent_function_arn
}

output "retrieval_agent_function_name" {
  value = module.agent.retrieval_agent_function_name
}

output "retrieval_agent_function_arn" {
  value = module.agent.retrieval_agent_function_arn
}

output "transaction_agent_function_name" {
  value = module.agent.transaction_agent_function_name
}

output "transaction_agent_function_arn" {
  value = module.agent.transaction_agent_function_arn
}

output "verification_agent_function_name" {
  value = module.agent.verification_agent_function_name
}

output "verification_agent_function_arn" {
  value = module.agent.verification_agent_function_arn
}

output "escalation_agent_function_name" {
  value = module.agent.escalation_agent_function_name
}

output "escalation_agent_function_arn" {
  value = module.agent.escalation_agent_function_arn
}

# --- Orquestación (module.orchestration) ---

output "state_machine_arn" {
  description = "ARN de la Step Function (Express) del orquestador de chat. Usado para invocaciones de prueba directas (aws stepfunctions start-sync-execution)."
  value       = module.orchestration.state_machine_arn
}

output "state_machine_log_group_name" {
  description = "Log group de CloudWatch con las ejecuciones de la Step Function."
  value       = module.orchestration.state_machine_log_group_name
}

output "dispatcher_lambda_function_name" {
  value = module.orchestration.dispatcher_lambda_function_name
}

output "dispatcher_lambda_arn" {
  value = module.orchestration.dispatcher_lambda_arn
}

# --- Frontend (module.frontend) ---

output "frontend_bucket_name" {
  description = "Nombre del bucket S3 privado del frontend (vacío en este checkpoint -- ver terraform/modules/frontend/README.md)."
  value       = module.frontend.bucket_name
}

output "frontend_cloudfront_distribution_id" {
  description = "ID de la distribución de CloudFront del frontend (para invalidaciones de caché en un futuro deploy)."
  value       = module.frontend.cloudfront_distribution_id
}

output "frontend_cloudfront_domain_name" {
  description = "Dominio de CloudFront del frontend (ej. dxxxxxxxxxxxxx.cloudfront.net). Usado también como origin real de CORS de module.edge."
  value       = module.frontend.cloudfront_domain_name
}

# --- Analytics (module.analytics, condicional -- ver var.enable_analytics_pipeline) ---
#
# `module.analytics` usa `count`, así que sus outputs son `null` cuando
# `var.enable_analytics_pipeline = false` (default en esta cuenta, ver
# docstring de esa variable -- bloqueador real de SubscriptionRequiredException
# de Kinesis Firehose). `null` explícito en vez de que `terraform output`
# falle es más útil para un reviewer que corre `terraform output` sin leer
# el HCL primero.

output "analytics_bucket_name" {
  description = "Nombre del bucket S3 destino de la tubería de analítica (case_store Streams -> Firehose -> S3). null si var.enable_analytics_pipeline = false."
  value       = var.enable_analytics_pipeline ? module.analytics[0].analytics_bucket_name : null
}

output "analytics_firehose_delivery_stream_name" {
  description = "Nombre del Kinesis Firehose delivery stream de la tubería de analítica. null si var.enable_analytics_pipeline = false."
  value       = var.enable_analytics_pipeline ? module.analytics[0].firehose_delivery_stream_name : null
}

output "analytics_stream_transformer_function_name" {
  description = "Nombre del Lambda de transformación (DynamoDB Streams -> Firehose). null si var.enable_analytics_pipeline = false."
  value       = var.enable_analytics_pipeline ? module.analytics[0].stream_transformer_function_name : null
}
