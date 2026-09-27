output "bedrock_model_id_parameter_name" {
  description = "Nombre del parámetro SSM con el model ID de Bedrock."
  value       = aws_ssm_parameter.bedrock_model_id.name
}

output "bedrock_region_parameter_name" {
  description = "Nombre del parámetro SSM con la región de Bedrock."
  value       = aws_ssm_parameter.bedrock_region.name
}

output "third_party_api_credentials_secret_arn" {
  description = "ARN del secreto placeholder de Secrets Manager para credenciales de terceros."
  value       = aws_secretsmanager_secret.third_party_api_credentials.arn
}
