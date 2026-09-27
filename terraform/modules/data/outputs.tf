output "table_name" {
  description = "Nombre de la tabla DynamoDB de case/session/conversation state."
  value       = aws_dynamodb_table.case_store.name
}

output "table_arn" {
  description = "ARN de la tabla DynamoDB de case/session/conversation state."
  value       = aws_dynamodb_table.case_store.arn
}

output "case_store_stream_arn" {
  description = "ARN del stream de DynamoDB Streams de case_store (NEW_AND_OLD_IMAGES), consumido por modules/analytics vía event source mapping."
  value       = aws_dynamodb_table.case_store.stream_arn
}

output "gsi_by_customer_name" {
  description = "Nombre del GSI usado para lookups por customerId (gsi1pk = CUSTOMER#<customerId>)."
  value       = "by-customer"
}

output "product_catalog_table_name" {
  description = "Nombre de la tabla DynamoDB del catálogo de productos de crédito + FAQs."
  value       = aws_dynamodb_table.product_catalog.name
}

output "product_catalog_table_arn" {
  description = "ARN de la tabla DynamoDB del catálogo de productos de crédito + FAQs."
  value       = aws_dynamodb_table.product_catalog.arn
}
