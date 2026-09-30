output "bedrock_model_id_parameter_name" {
  description = "Nombre del parámetro SSM con el model ID de Bedrock."
  value       = aws_ssm_parameter.bedrock_model_id.name
}

output "bedrock_region_parameter_name" {
  description = "Nombre del parámetro SSM con la región de Bedrock."
  value       = aws_ssm_parameter.bedrock_region.name
}

output "embedding_model_id_parameter_name" {
  description = "Nombre del parámetro SSM con el model ID de Titan Embeddings (matcher de transacciones disputadas)."
  value       = aws_ssm_parameter.embedding_model_id.name
}

output "embedding_model_id_parameter_arn" {
  description = "ARN del parámetro SSM del model ID de embeddings -- para la IAM policy (ssm:GetParameter) de transaction-agent."
  value       = aws_ssm_parameter.embedding_model_id.arn
}

output "third_party_api_credentials_secret_arn" {
  description = "ARN del secreto placeholder de Secrets Manager para credenciales de terceros."
  value       = aws_secretsmanager_secret.third_party_api_credentials.arn
}

output "session_token_secret_parameter_name" {
  description = "Nombre del parámetro SSM (SecureString) con el secreto HMAC de sesión."
  value       = aws_ssm_parameter.session_token_secret.name
}

output "session_token_secret_parameter_arn" {
  description = "ARN del parámetro SSM del secreto de sesión -- para IAM policies (ssm:GetParameter + kms:Decrypt) de auth-agent/conversation-agent."
  value       = aws_ssm_parameter.session_token_secret.arn
}

output "resend_api_key_parameter_name" {
  description = "Nombre del parámetro SSM (SecureString) con la API key de Resend."
  value       = aws_ssm_parameter.resend_api_key.name
}

output "resend_api_key_parameter_arn" {
  description = "ARN del parámetro SSM de la API key de Resend -- para la IAM policy (ssm:GetParameter + kms:Decrypt) de auth-agent."
  value       = aws_ssm_parameter.resend_api_key.arn
}
