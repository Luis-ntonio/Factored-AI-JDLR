locals {
  name_prefix = "${var.project_name}-${var.environment}"

  common_tags = merge(
    {
      Project     = var.project_name
      Environment = var.environment
      ManagedBy   = "terraform"
      Module      = "orchestration"
    },
    var.tags
  )

  state_machine_definition = templatefile("${path.module}/asl/chat-orchestrator.asl.json.tftpl", {
    conversation_agent_lambda_arn = var.conversation_agent_lambda_arn
    policy_agent_lambda_arn       = var.policy_agent_lambda_arn
    retrieval_agent_lambda_arn    = var.retrieval_agent_lambda_arn
    transaction_agent_lambda_arn  = var.transaction_agent_lambda_arn
    verification_agent_lambda_arn = var.verification_agent_lambda_arn
    escalation_agent_lambda_arn   = var.escalation_agent_lambda_arn
  })
}

# --- Logging de la Step Function (Express) ---
#
# Express NO retiene historial de ejecución navegable si no tenés logging
# configurado (a diferencia de Standard) -- sin esto no hay forma de
# verificar/depurar ejecuciones pasadas, ni de cumplir el pilar
# Observability de docs/EVALUATION-CRITERIA.md.
resource "aws_cloudwatch_log_group" "chat_orchestrator" {
  name              = "/aws/vendedlogs/states/${local.name_prefix}-chat-orchestrator"
  retention_in_days = var.log_retention_days
  tags              = local.common_tags
}

# --- IAM: rol de ejecución de la Step Function ---
data "aws_iam_policy_document" "sfn_assume_role" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["states.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "sfn_execution" {
  name               = "${local.name_prefix}-chat-orchestrator-role"
  assume_role_policy = data.aws_iam_policy_document.sfn_assume_role.json
  tags               = local.common_tags
}

# Invocación de Lambda restringida a los 6 ARNs EXACTOS que esta Step
# Function invoca (gap 3, Tarea 3, punto 1) -- nunca Resource: "*".
resource "aws_iam_role_policy" "sfn_invoke_lambdas" {
  name = "${local.name_prefix}-chat-orchestrator-invoke-lambdas"
  role = aws_iam_role.sfn_execution.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = ["lambda:InvokeFunction"]
        Resource = [
          var.conversation_agent_lambda_arn,
          var.policy_agent_lambda_arn,
          var.retrieval_agent_lambda_arn,
          var.transaction_agent_lambda_arn,
          var.verification_agent_lambda_arn,
          var.escalation_agent_lambda_arn,
        ]
      }
    ]
  })
}

# Set de permisos EXACTO que AWS exige para que una Step Function pueda
# entregar logs a CloudWatch Logs (Express, logging_configuration). No es un
# descuido de mínimo privilegio: es una excepción documentada y requerida
# por el servicio -- estos permisos son sobre la infraestructura de entrega
# de logs (log delivery), no sobre datos de la cuenta, y AWS no expone una
# forma de scoping más fino para esta operación en particular.
resource "aws_iam_role_policy" "sfn_logging" {
  name = "${local.name_prefix}-chat-orchestrator-logging"
  role = aws_iam_role.sfn_execution.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogDelivery",
          "logs:GetLogDelivery",
          "logs:UpdateLogDelivery",
          "logs:DeleteLogDelivery",
          "logs:ListLogDeliveries",
          "logs:PutResourcePolicy",
          "logs:DescribeResourcePolicies",
          "logs:DescribeLogGroups",
        ]
        Resource = "*"
      }
    ]
  })
}

# --- Step Function (Express, síncrona) ---
#
# EXPRESS (no Standard): coherente con la sección 11 del blueprint de
# referencia -- rutas cortas de webhook/chat usan Express, invocadas vía
# StartSyncExecution (no start-execution, que es para Standard/async).
resource "aws_sfn_state_machine" "chat_orchestrator" {
  name       = "${local.name_prefix}-chat-orchestrator"
  type       = "EXPRESS"
  role_arn   = aws_iam_role.sfn_execution.arn
  definition = local.state_machine_definition

  logging_configuration {
    log_destination        = "${aws_cloudwatch_log_group.chat_orchestrator.arn}:*"
    include_execution_data = true
    level                  = "ALL"
  }

  tags = local.common_tags

  depends_on = [
    aws_iam_role_policy.sfn_invoke_lambdas,
    aws_iam_role_policy.sfn_logging,
  ]
}

# --- Resource-based policies: restringe la invocación vía el SERVICIO Step
# Functions a ESTA state machine específica (gap 3, Tarea 3, punto 3).
# Mínimo exigido: retrieval-agent y transaction-agent. Replicado también en
# conversation-agent/policy-agent/verification-agent/escalation-agent por
# consistencia/defensa en profundidad (no cuesta nada adicional y documenta
# la intención de forma explícita en los 6 recursos, aunque los Task-a-Task
# (policy-agent/verification-agent/escalation-agent) ya están protegidos
# porque sus roles de ejecución no tienen lambda:InvokeFunction hacia nadie.
#
# LIMITACIÓN DOCUMENTADA (no silenciada, ver docs/EVALUATION-CRITERIA.md):
# como el usuario IAM del proyecto (banking-agent-dev) tiene
# AdministratorAccess, estas resource-based policies NO impiden que ESE
# usuario invoque estos Lambdas directamente (aws lambda invoke) -- son un
# permiso ADICIONAL para principals sin permiso propio (cross-account /
# service principals), no un firewall contra un principal que ya tiene
# lambda:InvokeFunction vía política de identidad admin. Lo que SÍ
# garantizan: ningún rol de ejecución que no sea el de esta Step Function
# (en particular, ni conversation-agent ni policy-agent) puede invocar
# retrieval-agent/transaction-agent.
resource "aws_lambda_permission" "sfn_invoke_conversation_agent" {
  statement_id  = "AllowChatOrchestratorInvoke"
  action        = "lambda:InvokeFunction"
  function_name = var.conversation_agent_lambda_arn
  principal     = "states.amazonaws.com"
  source_arn    = aws_sfn_state_machine.chat_orchestrator.arn
}

resource "aws_lambda_permission" "sfn_invoke_policy_agent" {
  statement_id  = "AllowChatOrchestratorInvoke"
  action        = "lambda:InvokeFunction"
  function_name = var.policy_agent_lambda_arn
  principal     = "states.amazonaws.com"
  source_arn    = aws_sfn_state_machine.chat_orchestrator.arn
}

resource "aws_lambda_permission" "sfn_invoke_retrieval_agent" {
  statement_id  = "AllowChatOrchestratorInvoke"
  action        = "lambda:InvokeFunction"
  function_name = var.retrieval_agent_lambda_arn
  principal     = "states.amazonaws.com"
  source_arn    = aws_sfn_state_machine.chat_orchestrator.arn
}

resource "aws_lambda_permission" "sfn_invoke_transaction_agent" {
  statement_id  = "AllowChatOrchestratorInvoke"
  action        = "lambda:InvokeFunction"
  function_name = var.transaction_agent_lambda_arn
  principal     = "states.amazonaws.com"
  source_arn    = aws_sfn_state_machine.chat_orchestrator.arn
}

resource "aws_lambda_permission" "sfn_invoke_verification_agent" {
  statement_id  = "AllowChatOrchestratorInvoke"
  action        = "lambda:InvokeFunction"
  function_name = var.verification_agent_lambda_arn
  principal     = "states.amazonaws.com"
  source_arn    = aws_sfn_state_machine.chat_orchestrator.arn
}

resource "aws_lambda_permission" "sfn_invoke_escalation_agent" {
  statement_id  = "AllowChatOrchestratorInvoke"
  action        = "lambda:InvokeFunction"
  function_name = var.escalation_agent_lambda_arn
  principal     = "states.amazonaws.com"
  source_arn    = aws_sfn_state_machine.chat_orchestrator.arn
}

# =====================================================================
# Lambda dispatcher -- puente síncrono entre API Gateway (POST /chat) y la
# Step Function. Puro glue/infra, sin lógica de negocio: API Gateway HTTP
# API v2 no tiene integración nativa con Step Functions (a diferencia de
# REST API vía VTL), así que hace falta un Lambda finito que llame
# StartSyncExecution y devuelva el resultado.
# =====================================================================
data "archive_file" "chat_dispatcher" {
  type        = "zip"
  source_file = "${path.module}/lambda-src/chat-dispatcher/index.js"
  output_path = "${path.module}/build/chat-dispatcher.zip"
}

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

resource "aws_iam_role" "chat_dispatcher" {
  name               = "${local.name_prefix}-chat-dispatcher-role"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume_role.json
  tags               = local.common_tags
}

resource "aws_iam_role_policy_attachment" "chat_dispatcher_basic_logs" {
  role       = aws_iam_role.chat_dispatcher.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# IAM del dispatcher: states:StartSyncExecution SOLO sobre esta state
# machine, nunca "*".
resource "aws_iam_role_policy" "chat_dispatcher_start_sync_execution" {
  name = "${local.name_prefix}-chat-dispatcher-start-sync-execution"
  role = aws_iam_role.chat_dispatcher.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["states:StartSyncExecution"]
        Resource = [aws_sfn_state_machine.chat_orchestrator.arn]
      }
    ]
  })
}

resource "aws_cloudwatch_log_group" "chat_dispatcher" {
  name              = "/aws/lambda/${local.name_prefix}-chat-dispatcher"
  retention_in_days = var.log_retention_days
  tags              = local.common_tags
}

resource "aws_lambda_function" "chat_dispatcher" {
  function_name = "${local.name_prefix}-chat-dispatcher"
  role          = aws_iam_role.chat_dispatcher.arn
  handler       = "index.handler"
  runtime       = "nodejs20.x"
  timeout       = var.dispatcher_lambda_timeout
  memory_size   = 128

  filename         = data.archive_file.chat_dispatcher.output_path
  source_code_hash = data.archive_file.chat_dispatcher.output_base64sha256

  environment {
    variables = {
      STATE_MACHINE_ARN = aws_sfn_state_machine.chat_orchestrator.arn
    }
  }

  tags = local.common_tags

  depends_on = [
    aws_cloudwatch_log_group.chat_dispatcher,
    aws_iam_role_policy_attachment.chat_dispatcher_basic_logs,
    aws_iam_role_policy.chat_dispatcher_start_sync_execution,
  ]
}
