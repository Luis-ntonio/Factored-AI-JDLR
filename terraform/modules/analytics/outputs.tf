output "analytics_bucket_name" {
  description = "Nombre del bucket S3 destino de la tubería de analítica (case_store Streams -> Firehose -> S3)."
  value       = aws_s3_bucket.case_store_analytics.id
}

output "analytics_bucket_arn" {
  description = "ARN del bucket S3 destino de la tubería de analítica."
  value       = aws_s3_bucket.case_store_analytics.arn
}

output "firehose_delivery_stream_name" {
  description = "Nombre del Kinesis Firehose delivery stream (Direct PUT) que escribe a S3."
  value       = aws_kinesis_firehose_delivery_stream.case_store.name
}

output "firehose_delivery_stream_arn" {
  description = "ARN del Kinesis Firehose delivery stream."
  value       = aws_kinesis_firehose_delivery_stream.case_store.arn
}

output "stream_transformer_function_name" {
  description = "Nombre del Lambda de transformación (DynamoDB Streams -> Firehose)."
  value       = aws_lambda_function.stream_transformer.function_name
}

output "stream_transformer_function_arn" {
  description = "ARN del Lambda de transformación."
  value       = aws_lambda_function.stream_transformer.arn
}
