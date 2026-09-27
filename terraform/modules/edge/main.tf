locals {
  name_prefix = "${var.project_name}-${var.environment}"

  common_tags = merge(
    {
      Project     = var.project_name
      Environment = var.environment
      ManagedBy   = "terraform"
      Module      = "edge"
    },
    var.tags
  )
}

# API Gateway HTTP como punto de ingreso del chat UI (frontend-dev).
#
# Checkpoint 0: scaffold vacío / mínimo. NO tiene:
#   - WAF                -> ver README.md de este módulo (limitación conocida,
#                            documentada, no silenciada; impacta Security).
#   - Autenticación/authZ -> ver README.md (limitación conocida, misma razón).
# La integración de negocio (dispatcher -> Step Function) se conecta desde
# checkpoint "pipeline end-to-end sobre AWS real" vía
# var.attach_chat_route/var.chat_route_lambda_invoke_arn (ver variables.tf).
#
# CORS ("Días 6-7 — Frontend", docs/PLAN.md): el `cors_configuration` nativo
# de HTTP API hace dos cosas sin tocar el Lambda dispatcher (que no es
# ownership de este agente):
#   1. Responde el preflight `OPTIONS /chat` directamente desde API Gateway
#      (nunca llega al Lambda).
#   2. Inyecta los headers `Access-Control-Allow-*` en la respuesta real que
#      sí devuelve el Lambda (AWS_PROXY), sin que el código del dispatcher
#      necesite agregarlos.
# Ver README.md de este módulo para la decisión de `allow_origins = ["*"]`
# (limitación conocida de Security, igual que la falta de WAF/auth).
resource "aws_apigatewayv2_api" "this" {
  name          = "${local.name_prefix}-chat-api"
  protocol_type = "HTTP"

  cors_configuration {
    allow_origins = var.cors_allow_origins
    allow_methods = ["POST", "OPTIONS"]
    allow_headers = ["content-type"]
    max_age       = 300
  }

  tags = local.common_tags
}

resource "aws_cloudwatch_log_group" "access_logs" {
  name              = "/aws/apigateway/${local.name_prefix}-chat-api"
  retention_in_days = var.log_retention_days

  tags = local.common_tags
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.this.id
  name        = "$default"
  auto_deploy = true

  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.access_logs.arn
    format = jsonencode({
      requestId        = "$context.requestId"
      ip               = "$context.identity.sourceIp"
      requestTime      = "$context.requestTime"
      httpMethod       = "$context.httpMethod"
      routeKey         = "$context.routeKey"
      status           = "$context.status"
      protocol         = "$context.protocol"
      responseLength   = "$context.responseLength"
      integrationError = "$context.integrationErrorMessage"
    })
  }

  tags = local.common_tags
}

# Integración + ruta del chat. `count` depende de `var.attach_chat_route`
# (booleano LITERAL, siempre conocido en plan time) y NUNCA de
# `var.chat_route_lambda_invoke_arn != null` directamente -- ese ARN puede
# ser "known after apply" cuando el Lambda que lo produce (el dispatcher de
# modules/orchestration) se crea en la misma corrida de `terraform apply`,
# y Terraform no puede evaluar un `count` a partir de un valor unknown en
# plan time. Ver docstring de `var.attach_chat_route` en variables.tf.
resource "aws_apigatewayv2_integration" "chat" {
  count = var.attach_chat_route ? 1 : 0

  api_id                 = aws_apigatewayv2_api.this.id
  integration_type       = "AWS_PROXY"
  integration_uri        = var.chat_route_lambda_invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "chat" {
  count = var.attach_chat_route ? 1 : 0

  api_id    = aws_apigatewayv2_api.this.id
  route_key = var.chat_route_key
  target    = "integrations/${aws_apigatewayv2_integration.chat[0].id}"
}
