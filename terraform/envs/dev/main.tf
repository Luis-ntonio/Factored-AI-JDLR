# Checkpoint 0 ("Días 1-2 — Infra base", docs/PLAN.md): scaffold vacío de
# infra desplegable lo antes posible (data/edge/secrets).
#
# Checkpoint siguiente ("pipeline end-to-end sobre AWS real", docs/STATUS.md
# P0): se agregan `agent` (los 4 Lambdas de lógica de negocio) y
# `orchestration` (Step Function Express + Lambda dispatcher), conectando la
# ruta POST /chat de `edge` al dispatcher. `messaging`/`observability` siguen
# como carpetas placeholder — ver README.md de cada una.
#
# Checkpoint "Días 5-6 — Verify + Escalate" (docs/PLAN.md): se agregan a
# `agent` los Lambdas verification-agent/escalation-agent, y se conectan sus
# ARNs a `orchestration` (Tasks Verify/EscalateFromPolicy/
# EscalateFromVerification de la Step Function).
#
# Checkpoint "Días 6-7 — Frontend" (docs/PLAN.md): se habilita CORS en
# `edge` para que la chat UI de frontend-dev (fetch() directo desde el
# navegador) pueda consumir POST /chat. Ver terraform/modules/edge/README.md
# para la decisión de `cors_allow_origins` y su trade-off de Security.
#
# Fase 2 "AWS real / infra adicional" (post pipeline E2E, ver
# docs/STATUS.md): se agrega `frontend` (S3+CloudFront con OAC para alojar
# el build de apps/web) y `analytics` (DynamoDB Streams -> Lambda de
# transformación -> Kinesis Firehose -> S3, sobre case_store). El CORS de
# `edge` pasa de `["*"]` al dominio real de CloudFront ahora que existe.
# `analytics` queda gateado por `var.enable_analytics_pipeline` (default
# false) por un bloqueador real de la cuenta -- ver docstring de esa
# variable y terraform/modules/analytics/README.md.

locals {
  # Raíz del monorepo (donde viven package.json raíz, services/,
  # packages/shared, policies.yaml) -- envs/dev está 2 niveles bajo
  # terraform/, y terraform/ está 1 nivel bajo la raíz del repo.
  repo_root = abspath("${path.module}/../../..")

  # CORS real: si el operador deja var.cors_allow_origins en su default
  # SENTINEL ["*"], se resuelve al dominio real de CloudFront del módulo
  # `frontend` (existe desde el primer apply, incluso con el bucket vacío).
  # Si el operador overridea var.cors_allow_origins explícitamente (ej. un
  # dominio custom), se respeta ese valor. Ver docstring completo en
  # variables.tf (cors_allow_origins) y terraform/modules/frontend/README.md.
  #
  # join(",", ...) == "*" en vez de var.cors_allow_origins == ["*"]:
  # confirmado empíricamente con `terraform console` que comparar
  # directamente un list(string) (el tipo real de la variable, que
  # Terraform representa internamente como `tolist([...])`) contra un
  # literal `["*"]` (una tuple) con `==` da SIEMPRE `false`, aunque el
  # contenido sea idéntico -- son tipos distintos para el operador de
  # igualdad de HCL, no se coacciona automáticamente. `join(",", ...)`
  # normaliza ambos lados a string antes de comparar, evitando el problema
  # de tipos por completo.
  cors_allow_origins = join(",", var.cors_allow_origins) == "*" ? ["https://${module.frontend.cloudfront_domain_name}"] : var.cors_allow_origins
}

module "data" {
  source = "../../modules/data"

  project_name = var.project_name
  environment  = var.environment
  tags         = var.tags

  repo_root   = local.repo_root
  aws_region  = var.aws_region
  aws_profile = var.aws_profile
}

module "secrets" {
  source = "../../modules/secrets"

  project_name                = var.project_name
  environment                 = var.environment
  tags                        = var.tags
  bedrock_model_id            = var.bedrock_model_id
  bedrock_region              = var.bedrock_region
  third_party_api_credentials = var.third_party_api_credentials
}

module "agent" {
  source = "../../modules/agent"

  project_name = var.project_name
  environment  = var.environment
  tags         = var.tags

  repo_root = local.repo_root

  case_store_table_name = module.data.table_name
  case_store_table_arn  = module.data.table_arn
  catalog_table_name    = module.data.product_catalog_table_name
  catalog_table_arn     = module.data.product_catalog_table_arn

  # Bedrock IAM real (fase "Habilitar Bedrock real") -- ver
  # terraform/modules/agent/README.md, seccion "Bedrock IAM: decision de
  # diferir (RESUELTO)". bedrock_model_id_ssm_parameter_name/
  # bedrock_region_ssm_parameter_name vienen de module.secrets (no se
  # referencian directamente entre modulos, mismo patron ya usado para
  # case_store_table_*/catalog_table_*).
  bedrock_model_id                    = var.bedrock_model_id
  bedrock_region                      = var.bedrock_region
  bedrock_model_id_ssm_parameter_name = module.secrets.bedrock_model_id_parameter_name
  bedrock_region_ssm_parameter_name   = module.secrets.bedrock_region_parameter_name

  # Auth por rol (auth-agent firma, conversation-agent verifica) -- mismo
  # patron que bedrock_*_ssm_parameter_name de arriba.
  session_token_secret_parameter_name = module.secrets.session_token_secret_parameter_name
  session_token_secret_parameter_arn  = module.secrets.session_token_secret_parameter_arn

  # Login por codigo OTP dentro del chat (services/auth-agent/src/otp) --
  # mismo patron: la API key de Resend vive en module.secrets (SSM
  # SecureString, placeholder hasta que el usuario la cargue por CLI), la
  # tabla de codigos vive en module.data.
  resend_api_key_parameter_name = module.secrets.resend_api_key_parameter_name
  resend_api_key_parameter_arn  = module.secrets.resend_api_key_parameter_arn
  resend_from_email             = var.resend_from_email
  otp_table_name                = module.data.otp_codes_table_name
  otp_table_arn                 = module.data.otp_codes_table_arn
}

module "orchestration" {
  source = "../../modules/orchestration"

  project_name = var.project_name
  environment  = var.environment
  tags         = var.tags

  conversation_agent_lambda_arn = module.agent.conversation_agent_function_arn
  policy_agent_lambda_arn       = module.agent.policy_agent_function_arn
  retrieval_agent_lambda_arn    = module.agent.retrieval_agent_function_arn
  transaction_agent_lambda_arn  = module.agent.transaction_agent_function_arn
  verification_agent_lambda_arn = module.agent.verification_agent_function_arn
  escalation_agent_lambda_arn   = module.agent.escalation_agent_function_arn
}

module "edge" {
  source = "../../modules/edge"

  project_name = var.project_name
  environment  = var.environment
  tags         = var.tags

  # attach_chat_route es un booleano LITERAL (siempre conocido en plan time,
  # a diferencia del ARN de abajo, que puede ser "known after apply" en el
  # primer apply de este checkpoint porque el Lambda dispatcher que lo
  # produce se crea en la misma corrida). Ver terraform/modules/edge/
  # variables.tf, docstring de attach_chat_route.
  attach_chat_route            = true
  chat_route_lambda_invoke_arn = module.orchestration.dispatcher_lambda_invoke_arn

  # Login de plataforma -- mismo criterio (booleano literal separado del
  # ARN), pero DIRECTO al Lambda auth-agent, nunca vía el dispatcher/Step
  # Function (ver docstring de attach_auth_route en modules/edge/variables.tf).
  attach_auth_route            = true
  auth_route_lambda_invoke_arn = module.agent.auth_agent_invoke_arn

  # CORS: dominio real de CloudFront (module.frontend) en vez de "*" -- ver
  # local.cors_allow_origins arriba y terraform/modules/edge/README.md.
  cors_allow_origins = local.cors_allow_origins
}

module "frontend" {
  source = "../../modules/frontend"

  project_name = var.project_name
  environment  = var.environment
  tags         = var.tags
}

# count (no un booleano interno del módulo) porque el bloqueador es de
# CUENTA (SubscriptionRequiredException real de Kinesis Firehose, ver
# docstring de var.enable_analytics_pipeline), no algo que el propio módulo
# deba modelar como opción de diseño -- así, en una cuenta sin ese
# bloqueador, alcanza con `enable_analytics_pipeline = true` para desplegar
# el módulo completo sin tocar ningún .tf.
module "analytics" {
  source = "../../modules/analytics"
  count  = var.enable_analytics_pipeline ? 1 : 0

  project_name = var.project_name
  environment  = var.environment
  tags         = var.tags

  case_store_stream_arn = module.data.case_store_stream_arn
}

# Permiso de invocación del dispatcher por API Gateway. Vive en el root
# module (no en `edge` ni en `orchestration`) porque es el único lugar con
# acceso a ambos outputs (module.edge.api_execution_arn +
# module.orchestration.dispatcher_lambda_function_name) sin crear una
# dependencia circular entre esos dos módulos.
resource "aws_lambda_permission" "apigw_invoke_dispatcher" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = module.orchestration.dispatcher_lambda_function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${module.edge.api_execution_arn}/*/*"
}

# Mismo criterio que apigw_invoke_dispatcher de arriba (vive en el root
# module por la misma razón: único lugar con acceso a ambos outputs sin
# dependencia circular) -- auth-agent es invocado DIRECTO por API Gateway,
# nunca a través del dispatcher/Step Function.
resource "aws_lambda_permission" "apigw_invoke_auth_agent" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = module.agent.auth_agent_function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${module.edge.api_execution_arn}/*/*"
}
