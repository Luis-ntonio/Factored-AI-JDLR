output "state_machine_arn" {
  description = "ARN de la Step Function (Express) del orquestador de chat."
  value       = aws_sfn_state_machine.chat_orchestrator.arn
}

output "state_machine_name" {
  description = "Nombre de la Step Function (Express) del orquestador de chat."
  value       = aws_sfn_state_machine.chat_orchestrator.name
}

output "state_machine_log_group_name" {
  description = "Log group de CloudWatch con las ejecuciones (ALL, include_execution_data) de la Step Function."
  value       = aws_cloudwatch_log_group.chat_orchestrator.name
}

output "dispatcher_lambda_function_name" {
  description = "Nombre del Lambda dispatcher (API Gateway -> StartSyncExecution)."
  value       = aws_lambda_function.chat_dispatcher.function_name
}

output "dispatcher_lambda_arn" {
  description = "ARN del Lambda dispatcher."
  value       = aws_lambda_function.chat_dispatcher.arn
}

output "dispatcher_lambda_invoke_arn" {
  description = "invoke_arn del Lambda dispatcher, para pasar a module.edge.chat_route_lambda_invoke_arn."
  value       = aws_lambda_function.chat_dispatcher.invoke_arn
}
