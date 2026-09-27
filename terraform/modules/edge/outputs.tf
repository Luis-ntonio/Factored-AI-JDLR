output "api_id" {
  description = "ID del API Gateway HTTP."
  value       = aws_apigatewayv2_api.this.id
}

output "api_endpoint" {
  description = "Endpoint invocable del API Gateway (stage $default)."
  value       = aws_apigatewayv2_stage.default.invoke_url
}

output "api_execution_arn" {
  description = "execution_arn del API Gateway, usado por envs/dev para construir el source_arn del aws_lambda_permission que le da a apigateway.amazonaws.com permiso de invocar el Lambda dispatcher de la ruta /chat (formato esperado por API Gateway: execution_arn seguido de /*/*)."
  value       = aws_apigatewayv2_api.this.execution_arn
}

output "access_log_group_name" {
  description = "Log group de CloudWatch con los access logs del API Gateway."
  value       = aws_cloudwatch_log_group.access_logs.name
}
