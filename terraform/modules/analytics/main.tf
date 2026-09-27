locals {
  name_prefix = "${var.project_name}-${var.environment}"

  common_tags = merge(
    {
      Project     = var.project_name
      Environment = var.environment
      ManagedBy   = "terraform"
      Module      = "analytics"
    },
    var.tags
  )

  # Scope de ListStreams: DynamoDB exige el patrón "<table_arn>/stream/*"
  # (no el ARN completo con el timestamp exacto del stream actual) -- se
  # deriva del stream ARN completo recibido (formato
  # "<table_arn>/stream/<label>") cortando en "/stream/" y agregando "/*".
  stream_wildcard_arn = "${split("/stream/", var.case_store_stream_arn)[0]}/stream/*"
}

# ---------------------------------------------------------------------------
# S3: destino final de la tubería de datos (Streams -> Lambda -> Firehose ->
# S3). Bucket NUEVO, separado del catálogo (modules/data) y del frontend
# (modules/frontend) -- contenido completamente distinto (datos de eventos,
# no contenido estático ni referencia de producto).
# ---------------------------------------------------------------------------
resource "aws_s3_bucket" "case_store_analytics" {
  bucket = "${local.name_prefix}-case-store-analytics"

  tags = local.common_tags
}

resource "aws_s3_bucket_public_access_block" "case_store_analytics" {
  bucket = aws_s3_bucket.case_store_analytics.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# ---------------------------------------------------------------------------
# Lambda de transformación: DynamoDB Streams -> Firehose (Direct PUT).
# Ver lambda-src/case-store-stream-transformer/index.js para el detalle
# completo del formato de datos.
# ---------------------------------------------------------------------------
data "aws_iam_policy_document" "lambda_assume_role" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "stream_transformer" {
  name               = "${local.name_prefix}-case-store-stream-transformer-role"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume_role.json
  tags               = local.common_tags
}

resource "aws_iam_role_policy_attachment" "stream_transformer_basic_logs" {
  role       = aws_iam_role.stream_transformer.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# IAM de mínimo privilegio: SOLO lectura del stream de case_store (scoped al
# stream ARN, con ListStreams scoped al patrón de wildcard que exige
# DynamoDB) + PutRecord/PutRecordBatch SOLO sobre el delivery stream de
# Firehose de este módulo. Sin dynamodb:GetItem/Query/Scan (no lee la tabla
# directamente, solo el stream), sin lambda:InvokeFunction.
resource "aws_iam_role_policy" "stream_transformer_dynamodb_stream" {
  name = "${local.name_prefix}-case-store-stream-transformer-dynamodb-stream"
  role = aws_iam_role.stream_transformer.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "dynamodb:DescribeStream",
          "dynamodb:GetRecords",
          "dynamodb:GetShardIterator",
        ]
        Resource = [var.case_store_stream_arn]
      },
      {
        Effect   = "Allow"
        Action   = ["dynamodb:ListStreams"]
        Resource = [local.stream_wildcard_arn]
      }
    ]
  })
}

resource "aws_iam_role_policy" "stream_transformer_firehose" {
  name = "${local.name_prefix}-case-store-stream-transformer-firehose"
  role = aws_iam_role.stream_transformer.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "firehose:PutRecord",
          "firehose:PutRecordBatch",
        ]
        Resource = [aws_kinesis_firehose_delivery_stream.case_store.arn]
      }
    ]
  })
}

data "archive_file" "stream_transformer" {
  type        = "zip"
  source_file = "${path.module}/lambda-src/case-store-stream-transformer/index.js"
  output_path = "${path.module}/build/case-store-stream-transformer.zip"
}

resource "aws_cloudwatch_log_group" "stream_transformer" {
  name              = "/aws/lambda/${local.name_prefix}-case-store-stream-transformer"
  retention_in_days = var.log_retention_days
  tags              = local.common_tags
}

resource "aws_lambda_function" "stream_transformer" {
  function_name = "${local.name_prefix}-case-store-stream-transformer"
  role          = aws_iam_role.stream_transformer.arn
  handler       = "index.handler"
  runtime       = "nodejs20.x"
  timeout       = var.lambda_timeout
  memory_size   = var.lambda_memory_size

  filename         = data.archive_file.stream_transformer.output_path
  source_code_hash = data.archive_file.stream_transformer.output_base64sha256

  environment {
    variables = {
      FIREHOSE_DELIVERY_STREAM_NAME = aws_kinesis_firehose_delivery_stream.case_store.name
    }
  }

  tags = local.common_tags

  depends_on = [
    aws_cloudwatch_log_group.stream_transformer,
    aws_iam_role_policy_attachment.stream_transformer_basic_logs,
    aws_iam_role_policy.stream_transformer_dynamodb_stream,
    aws_iam_role_policy.stream_transformer_firehose,
  ]
}

# Event source mapping: dispara el Lambda con cada lote de records del
# stream de case_store. bisect_batch_on_function_error + maximum_retry_attempts
# evitan que un error puntual bloquee el stream indefinidamente -- LIMITACIÓN
# CONOCIDA: sin destination_config on_failure (SQS/SNS), los records que
# agotan maximum_retry_attempts se descartan sin dejar rastro. Ver README.md.
resource "aws_lambda_event_source_mapping" "case_store_stream" {
  event_source_arn  = var.case_store_stream_arn
  function_name     = aws_lambda_function.stream_transformer.arn
  starting_position = "LATEST"

  batch_size                         = 100
  maximum_batching_window_in_seconds = 5
  bisect_batch_on_function_error     = true
  maximum_retry_attempts             = 3

  depends_on = [aws_iam_role_policy.stream_transformer_dynamodb_stream]
}

# ---------------------------------------------------------------------------
# Kinesis Firehose (Direct PUT) -> S3, particionado por fecha de ingesta.
# ---------------------------------------------------------------------------
data "aws_iam_policy_document" "firehose_assume_role" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["firehose.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "firehose_delivery" {
  name               = "${local.name_prefix}-case-store-firehose-role"
  assume_role_policy = data.aws_iam_policy_document.firehose_assume_role.json
  tags               = local.common_tags
}

resource "aws_cloudwatch_log_group" "firehose_delivery" {
  name              = "/aws/kinesisfirehose/${local.name_prefix}-case-store-analytics"
  retention_in_days = var.log_retention_days
  tags              = local.common_tags
}

resource "aws_cloudwatch_log_stream" "firehose_delivery" {
  name           = "S3Delivery"
  log_group_name = aws_cloudwatch_log_group.firehose_delivery.name
}

# Set de permisos estándar exigido por Firehose para un destino S3 (ver
# documentación de AWS de "Grant Firehose Access to an Amazon S3
# Destination") + logging a CloudWatch. Scoped al bucket de este módulo y al
# log group de este módulo, nunca "*".
resource "aws_iam_role_policy" "firehose_delivery" {
  name = "${local.name_prefix}-case-store-firehose-delivery"
  role = aws_iam_role.firehose_delivery.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:AbortMultipartUpload",
          "s3:GetBucketLocation",
          "s3:GetObject",
          "s3:ListBucket",
          "s3:ListBucketMultipartUploads",
          "s3:PutObject",
        ]
        Resource = [
          aws_s3_bucket.case_store_analytics.arn,
          "${aws_s3_bucket.case_store_analytics.arn}/*",
        ]
      },
      {
        Effect   = "Allow"
        Action   = ["logs:PutLogEvents"]
        Resource = ["${aws_cloudwatch_log_group.firehose_delivery.arn}:*"]
      }
    ]
  })
}

resource "aws_kinesis_firehose_delivery_stream" "case_store" {
  name        = "${local.name_prefix}-case-store-analytics"
  destination = "extended_s3"

  extended_s3_configuration {
    role_arn   = aws_iam_role.firehose_delivery.arn
    bucket_arn = aws_s3_bucket.case_store_analytics.arn

    # Particionado nativo por timestamp de ingesta de Firehose (no dynamic
    # partitioning avanzado -- no hace falta particionar por caseId/eventName
    # en este checkpoint, ver README.md).
    prefix              = "year=!{timestamp:yyyy}/month=!{timestamp:MM}/day=!{timestamp:dd}/"
    error_output_prefix = "errors/year=!{timestamp:yyyy}/month=!{timestamp:MM}/day=!{timestamp:dd}/!{firehose:error-output-type}/"

    buffering_size     = var.firehose_buffering_size_mb
    buffering_interval = var.firehose_buffering_interval_seconds
    compression_format = "GZIP"

    cloudwatch_logging_options {
      enabled         = true
      log_group_name  = aws_cloudwatch_log_group.firehose_delivery.name
      log_stream_name = aws_cloudwatch_log_stream.firehose_delivery.name
    }
  }

  tags = local.common_tags

  depends_on = [aws_iam_role_policy.firehose_delivery]
}
