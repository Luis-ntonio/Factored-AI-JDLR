variable "project_name" {
  description = "Nombre corto del proyecto, usado como prefijo de naming/tagging (contrato compartido con data, secrets, y los módulos pendientes)."
  type        = string
}

variable "environment" {
  description = "Nombre del ambiente (dev/uat/prod). Checkpoint 0 solo usa 'dev'."
  type        = string
}

variable "tags" {
  description = "Tags adicionales a mergear con las tags base de proyecto/ambiente."
  type        = map(string)
  default     = {}
}

variable "log_retention_days" {
  description = "Retención de los logs de acceso del API Gateway en CloudWatch."
  type        = number
  default     = 30
}

variable "attach_chat_route" {
  description = <<-EOT
    Booleano LITERAL (conocido en plan time) que decide si se crea la
    integración + ruta del chat. Se separa deliberadamente de
    `chat_route_lambda_invoke_arn` (cuyo VALOR puede ser "known after apply"
    si el Lambda/dispatcher que lo produce se crea en la misma corrida de
    `terraform apply") porque Terraform no puede evaluar un `count` a partir
    de un valor unknown-en-plan -- el error es "Invalid count argument: The
    count value depends on resource attributes that cannot be determined
    until apply". Separar el booleano (siempre literal) del ARN (puede ser
    computado) resuelve ese problema sin necesitar `-target` en dos pasadas.
    Default false = comportamiento del checkpoint 0 (scaffold sin conectar).
  EOT
  type        = bool
  default     = false
}

variable "chat_route_lambda_invoke_arn" {
  description = <<-EOT
    ARN de invocación (invoke_arn) del Lambda que atenderá la ruta del chat
    (en este proyecto, el Lambda dispatcher de `modules/orchestration`, que
    a su vez invoca la Step Function). Solo se usa si
    `var.attach_chat_route = true`. Puede ser un valor "known after apply"
    (si el Lambda que lo produce se crea en la misma corrida) sin problema:
    solo el booleano `attach_chat_route` necesita ser conocido en plan time,
    no este ARN.
  EOT
  type        = string
  default     = null
}

variable "chat_route_key" {
  description = "Route key HTTP para el endpoint del chat, usado solo si attach_chat_route = true."
  type        = string
  default     = "POST /chat"
}

variable "cors_allow_origins" {
  description = <<-EOT
    Lista de origins permitidos en el `cors_configuration` nativo del HTTP
    API (checkpoint "Días 6-7 — Frontend", docs/PLAN.md). El chat UI que
    construye frontend-dev hace `fetch()` directo desde el navegador, así
    que sin esto el preflight `OPTIONS /chat` y la respuesta real de
    `POST /chat` fallan por CORS.

    Default `["*"]`: frontend-dev todavía no tiene puerto/dominio fijo
    decidido en este checkpoint, y bloquear la integración por un origin
    exacto no vale la pena en un proyecto de 10 días en fase de integración.
    Es una limitación conocida de Security (documentada en README.md de este
    módulo, en la misma categoría que la falta de WAF/autenticación) a
    endurecer antes de un eventual checkpoint de producción, restringiendo a
    los origins reales (ej. `https://<dominio-frontend>`) una vez estén
    decididos.
  EOT
  type        = list(string)
  default     = ["*"]
}
