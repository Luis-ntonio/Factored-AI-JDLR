output "admin_agent_function_name" {
  description = "Nombre del Lambda admin-agent."
  value       = aws_lambda_function.admin_agent.function_name
}

output "admin_agent_function_arn" {
  description = "ARN del Lambda admin-agent."
  value       = aws_lambda_function.admin_agent.arn
}

output "admin_agent_invoke_arn" {
  description = "invoke_arn del Lambda admin-agent, para pasar a module.edge.admin_route_lambda_invoke_arn."
  value       = aws_lambda_function.admin_agent.invoke_arn
}
