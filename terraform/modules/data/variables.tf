variable "project_name" {
  description = "Nombre corto del proyecto, usado como prefijo de naming/tagging en todos los módulos (contrato compartido con edge, secrets, y los módulos pendientes)."
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

variable "ttl_attribute_name" {
  description = "Nombre del atributo TTL para expiración automática de items (case/session/conversation state)."
  type        = string
  default     = "ttl"
}

variable "point_in_time_recovery_enabled" {
  description = "Habilita PITR en la tabla. Recomendado true para un data store real (Reliability/Security), pero configurable para no bloquear el checkpoint 0 en cuentas con restricciones."
  type        = bool
  default     = true
}

# --- Seeding del catálogo de productos/FAQs (gap 1, Tarea 1 de devops) ---

variable "repo_root" {
  description = <<-EOT
    Path absoluto a la raíz del monorepo (donde vive package.json raíz,
    services/, packages/shared, policies.yaml). Se usa para invocar el
    script de seed de retrieval-agent (`services/retrieval-agent/scripts/
    seed-catalog.ts`, compilado a `dist/scripts/seed-catalog.js`) vía
    null_resource + local-exec, y para calcular el trigger de re-seed
    (hash de `src/data/catalog.ts`).
  EOT
  type        = string
}

variable "aws_region" {
  description = "Región AWS pasada como env var AWS_REGION al proceso de seed (mismo valor que usa el provider de Terraform)."
  type        = string
}

variable "aws_profile" {
  description = "Perfil de ~/.aws/credentials pasado como env var AWS_PROFILE al proceso de seed (null = cadena de credenciales por defecto, sin override)."
  type        = string
  default     = null
}

variable "enable_catalog_seed" {
  description = <<-EOT
    Permite desactivar el seed automático (ej. en un ambiente donde Node/npm
    no están disponibles en la máquina que corre `terraform apply`, o para
    iterar en la tabla sin recompilar retrieval-agent en cada apply).
    Default true: el seed corre siempre que cambie el contenido de
    catalog.ts (o en el primer apply).
  EOT
  type        = bool
  default     = true
}
