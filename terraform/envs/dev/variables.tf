variable "project_name" {
  description = "Nombre corto del proyecto. Contrato de naming/tagging compartido por todos los módulos."
  type        = string
  default     = "banking-agent"
}

variable "environment" {
  description = "Nombre del ambiente. Este checkpoint solo define 'dev' (ver README.md raíz de terraform/ sobre la simplificación de un solo ambiente vs. uat+prod del blueprint)."
  type        = string
  default     = "dev"
}

variable "aws_region" {
  description = "Región AWS de despliegue."
  type        = string
  default     = "us-east-1"
}

variable "aws_profile" {
  description = <<-EOT
    Perfil de ~/.aws/credentials a usar. Null = cadena de credenciales por
    defecto (env vars / perfil "default" / rol de instancia). Se recomienda
    un perfil dedicado a este proyecto (ej. "banking-agent-dev"), no
    reutilizar perfiles personales existentes (ej. "amplifyDev") — evita
    mezclar el blast radius de este proyecto con otras cuentas/recursos.
  EOT
  type        = string
  default     = null
}

variable "tags" {
  description = "Tags adicionales, mergeadas con Project/Environment/ManagedBy en cada módulo."
  type        = map(string)
  default     = {}
}

variable "bedrock_model_id" {
  description = <<-EOT
    ID del inference profile de Amazon Bedrock (Claude Sonnet 5, familia
    Anthropic) elegido para el futuro Lambda de conversation-agent. Ver
    terraform/modules/secrets/variables.tf y terraform/modules/secrets/README.md
    para la evidencia real (aws bedrock list-foundation-models /
    list-inference-profiles, corrida contra la cuenta real) de por qué el
    valor es un inference profile ("us.anthropic.claude-sonnet-5") y no el
    model ID directo ("anthropic.claude-sonnet-5") — toda la familia
    Anthropic en esta cuenta/región tiene
    `inferenceTypesSupported = ["INFERENCE_PROFILE"]`, sin soporte de
    invocación on-demand directa por model ID.

    BLOQUEADOR CONOCIDO (no resoluble desde Terraform/CLI): el "model
    access" de este modelo NO está habilitado todavía en esta cuenta —
    confirmado con una invocación de prueba real
    (`ConverseCommand` vía `@aws-sdk/client-bedrock-runtime`) que devolvió
    `AccessDeniedException: anthropic.claude-sonnet-5 is not available for
    this account`. Requiere una acción manual del usuario en la consola de
    AWS (Bedrock -> Model access). Ver
    terraform/modules/secrets/README.md, sección "Bloqueador: model access".

    Ningún Lambda invoca Bedrock todavía (docs/PLAN.md, fase C/D) — ver
    terraform/modules/agent/README.md para la decisión (deliberada, no un
    descuido) de diferir el IAM de bedrock:InvokeModel a esa fase.
  EOT
  type        = string
  default     = "us.anthropic.claude-sonnet-5"
}

variable "third_party_api_credentials" {
  description = "Ver terraform/modules/secrets/variables.tf. Placeholder dummy, no un secreto real."
  type        = map(string)
  default     = { placeholder = "replace-me" }
  sensitive   = true
}

variable "cors_allow_origins" {
  description = <<-EOT
    Ver terraform/modules/edge/variables.tf y README.md. Origins permitidos
    para el chat UI (fetch() desde el navegador) en POST /chat.

    Default `["*"]`: valor SENTINEL, no el valor final que se envía al
    módulo `edge`. `main.tf` de este ambiente resuelve el CORS real así: si
    esta variable se deja en el default `["*"]`, se usa el dominio real de
    CloudFront (`module.frontend.cloudfront_domain_name`, ver módulo
    `frontend`) en su lugar — ya no `"*"` abierto — porque a partir de este
    checkpoint el frontend tiene un dominio real (aunque el bucket S3
    todavía no tenga contenido desplegado, la distribución de CloudFront y
    su dominio existen desde el primer `apply`). Para un dominio custom
    (ej. detrás de Route 53 en un checkpoint de producción), override este
    valor explícitamente vía `terraform.tfvars` a
    `["https://<dominio-custom>"]`.
  EOT
  type        = list(string)
  default     = ["*"]
}

variable "enable_analytics_pipeline" {
  description = <<-EOT
    Gatea la instanciación COMPLETA de `module.analytics` (DynamoDB Streams
    -> Lambda de transformación -> Kinesis Firehose -> S3, ver
    terraform/modules/analytics/README.md).

    BLOQUEADOR CONOCIDO (cuenta AWS real de este proyecto, no resoluble
    desde Terraform/IAM/CLI): la cuenta `<AWS_ACCOUNT_ID>` NO tiene el servicio
    Kinesis Firehose habilitado/suscrito. Confirmado con DOS llamadas reales
    e independientes contra la API real (no asumido): (1)
    `terraform apply` intentando crear el `aws_kinesis_firehose_delivery_stream`
    falló con `SubscriptionRequiredException: The AWS Access Key Id needs a
    subscription for the service`; (2) para descartar que fuera un problema
    de permisos/IAM del rol específico de Firehose (no de la cuenta en
    general), se probó además una llamada de SOLO LECTURA
    (`ListDeliveryStreamsCommand` vía `@aws-sdk/client-firehose`, con las
    credenciales admin del propio usuario del proyecto, sin relación con
    ningún rol IAM de este módulo) -- mismo error exacto. Esto descarta un
    problema de IAM/Terraform y confirma que es una restricción a nivel de
    cuenta/servicio.

    CAUSA RAÍZ CONFIRMADA POR EL USUARIO: la cuenta de este proyecto es una
    cuenta AWS **freemium/free-tier**, y Kinesis Firehose no está
    disponible para ese nivel de cuenta -- requiere upgrade a una cuenta de
    pago (o contactar a AWS Support/Sales, como indica el mensaje de
    error). No es un simple "falta un click de habilitar", es una
    restricción real del tier de la cuenta.

    Default `false` en este ambiente por ese bloqueador -- el código
    completo del pipeline SÍ existe y es válido (`terraform plan` con este
    flag en `true` muestra el plan completo sin errores de sintaxis/lógica,
    ver terraform/modules/analytics/README.md), pero no se puede aplicar
    contra ESTA cuenta hasta que el bloqueador se resuelva. Cuando una
    cuenta con Firehose habilitado corra este ambiente, poner este valor en
    `true` (vía `terraform.tfvars`) despliega el pipeline completo sin
    cambios de código adicionales.
  EOT
  type        = bool
  default     = false
}
