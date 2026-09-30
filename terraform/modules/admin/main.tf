# =============================================================================
# admin-agent -- dashboard de admin (interno, NUNCA un cliente bancario).
# Lambda invocado DIRECTO por API Gateway (nunca por la Step Function,
# mismo criterio que auth-agent en terraform/modules/agent) -- 2 rutas:
# listar conversaciones reales (Scan sobre case-store) y traza completa de
# un caso (FilterLogEvents sobre el log group de la Step Function, que YA
# loguea todo -- ver services/admin-agent/src/get-trace.ts).
#
# Módulo SEPARADO de `modules/agent` a propósito (no un 8vo Lambda ahí
# adentro): admin-agent depende del log group de `modules/orchestration`, y
# `modules/orchestration` YA depende de `modules/agent` (los ARNs de los 6
# Lambdas de negocio que invoca la Step Function) -- meter admin-agent
# DENTRO de `modules/agent` hubiera creado una dependencia circular real
# entre agent <-> orchestration. Como módulo propio, declarado DESPUÉS de
# ambos en `terraform/envs/dev/main.tf` (con `depends_on = [module.agent]`
# explícito porque el zip se genera en el build de ESE módulo, ver abajo),
# el grafo queda: agent -> orchestration, agent -> admin, orchestration ->
# admin -- nunca un ciclo.
#
# El zip de este Lambda se genera en el MISMO build de esbuild que el resto
# de servicios (`terraform/scripts/package-lambdas.js`, admin-agent es el
# 8vo entry de `LAMBDAS`) -- ese script ya corre dentro de
# `null_resource.build_lambdas` de `modules/agent`, así que este módulo
# SOLO empaqueta el zip ya generado ahí (`../agent/build/admin-agent`),
# nunca dispara esbuild de nuevo.
# =============================================================================

locals {
  name_prefix = "${var.project_name}-${var.environment}"

  common_tags = merge(
    {
      Project     = var.project_name
      Environment = var.environment
      ManagedBy   = "terraform"
      Module      = "admin"
    },
    var.tags
  )
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

# Clave KMS administrada por AWS que cifra el parámetro SecureString de
# admin_api_key -- mismo patrón que modules/agent (auth_agent/
# conversation_agent).
data "aws_kms_alias" "ssm" {
  name = "alias/aws/ssm"
}

data "archive_file" "admin_agent" {
  type        = "zip"
  source_dir  = "${path.module}/../agent/build/admin-agent"
  output_path = "${path.module}/../agent/build/admin-agent.zip"
}

resource "aws_iam_role" "admin_agent" {
  name               = "${local.name_prefix}-admin-agent-role"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume_role.json
  tags               = local.common_tags
}

resource "aws_iam_role_policy_attachment" "admin_agent_basic_logs" {
  role       = aws_iam_role.admin_agent.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# Mínimo privilegio: SOLO dynamodb:Scan (nunca escritura) sobre la tabla
# case-store -- admin-agent es de solo LECTURA, nunca muta el estado de
# ninguna conversación real.
resource "aws_iam_role_policy" "admin_agent_dynamodb" {
  name = "${local.name_prefix}-admin-agent-dynamodb"
  role = aws_iam_role.admin_agent.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["dynamodb:Scan"]
        Resource = [var.case_store_table_arn]
      }
    ]
  })
}

# Mínimo privilegio: SOLO logs:FilterLogEvents (nunca logs:PutLogEvents ni
# ninguna acción de escritura) sobre el log group PUNTUAL de la Step
# Function -- admin-agent lee logs que YA se generan, nunca agrega
# logging nuevo.
resource "aws_iam_role_policy" "admin_agent_logs" {
  name = "${local.name_prefix}-admin-agent-logs"
  role = aws_iam_role.admin_agent.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "ReadOrchestratorLogs"
        Effect   = "Allow"
        Action   = ["logs:FilterLogEvents"]
        Resource = [var.state_machine_log_group_arn]
      }
    ]
  })
}

resource "aws_iam_role_policy" "admin_agent_ssm" {
  name = "${local.name_prefix}-admin-agent-ssm"
  role = aws_iam_role.admin_agent.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "ReadAdminApiKey"
        Effect   = "Allow"
        Action   = ["ssm:GetParameter"]
        Resource = [var.admin_api_key_parameter_arn]
      },
      {
        Sid      = "DecryptAdminApiKey"
        Effect   = "Allow"
        Action   = ["kms:Decrypt"]
        Resource = [data.aws_kms_alias.ssm.target_key_arn]
      }
    ]
  })
}

resource "aws_cloudwatch_log_group" "admin_agent" {
  name              = "/aws/lambda/${local.name_prefix}-admin-agent"
  retention_in_days = var.log_retention_days
  tags              = local.common_tags
}

resource "aws_lambda_function" "admin_agent" {
  function_name = "${local.name_prefix}-admin-agent"
  role          = aws_iam_role.admin_agent.arn
  handler       = "index.handler"
  runtime       = "nodejs20.x"
  timeout       = var.lambda_timeout
  memory_size   = var.lambda_memory_size

  filename         = data.archive_file.admin_agent.output_path
  source_code_hash = data.archive_file.admin_agent.output_base64sha256

  environment {
    variables = {
      CASE_STORE_TABLE_NAME        = var.case_store_table_name
      STATE_MACHINE_LOG_GROUP_NAME = var.state_machine_log_group_name
      ADMIN_API_KEY_PARAM_NAME     = var.admin_api_key_parameter_name
    }
  }

  tags = local.common_tags

  depends_on = [
    aws_cloudwatch_log_group.admin_agent,
    aws_iam_role_policy_attachment.admin_agent_basic_logs,
    aws_iam_role_policy.admin_agent_dynamodb,
    aws_iam_role_policy.admin_agent_logs,
    aws_iam_role_policy.admin_agent_ssm,
  ]
}
