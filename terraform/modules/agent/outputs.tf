output "conversation_agent_function_name" {
  value = aws_lambda_function.conversation_agent.function_name
}

output "conversation_agent_function_arn" {
  value = aws_lambda_function.conversation_agent.arn
}

output "conversation_agent_invoke_arn" {
  value = aws_lambda_function.conversation_agent.invoke_arn
}

output "policy_agent_function_name" {
  value = aws_lambda_function.policy_agent.function_name
}

output "policy_agent_function_arn" {
  value = aws_lambda_function.policy_agent.arn
}

output "retrieval_agent_function_name" {
  value = aws_lambda_function.retrieval_agent.function_name
}

output "retrieval_agent_function_arn" {
  value = aws_lambda_function.retrieval_agent.arn
}

output "transaction_agent_function_name" {
  value = aws_lambda_function.transaction_agent.function_name
}

output "transaction_agent_function_arn" {
  value = aws_lambda_function.transaction_agent.arn
}

output "verification_agent_function_name" {
  value = aws_lambda_function.verification_agent.function_name
}

output "verification_agent_function_arn" {
  value = aws_lambda_function.verification_agent.arn
}

output "escalation_agent_function_name" {
  value = aws_lambda_function.escalation_agent.function_name
}

output "escalation_agent_function_arn" {
  value = aws_lambda_function.escalation_agent.arn
}

output "auth_agent_function_name" {
  value = aws_lambda_function.auth_agent.function_name
}

output "auth_agent_function_arn" {
  value = aws_lambda_function.auth_agent.arn
}

output "auth_agent_invoke_arn" {
  value = aws_lambda_function.auth_agent.invoke_arn
}
