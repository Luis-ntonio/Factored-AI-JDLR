variable "project_name" {
  description = "Nombre corto del proyecto, usado como prefijo de naming/tagging (contrato compartido con edge, data, agent, secrets, orchestration)."
  type        = string
}

variable "environment" {
  description = "Nombre del ambiente (dev/uat/prod). Este checkpoint solo usa 'dev'."
  type        = string
}

variable "tags" {
  description = "Tags adicionales a mergear con las tags base de proyecto/ambiente."
  type        = map(string)
  default     = {}
}

variable "default_root_object" {
  description = "Objeto raíz servido por CloudFront en la ruta '/' (ej. index.html de una SPA de Vite/React)."
  type        = string
  default     = "index.html"
}

variable "spa_routing_enabled" {
  description = <<-EOT
    Si es true, agrega custom_error_response 403/404 -> /index.html (200) en
    la distribución de CloudFront -- patrón estándar para SPAs con routing
    client-side (React Router u otro), donde S3 devuelve 403 (bucket
    privado, sin ACL pública) o 404 (objeto inexistente) para rutas que no
    son un archivo real, y el router del lado del cliente debe resolverlas.
    apps/web (Vite + React) es exactamente ese caso. Default true.
  EOT
  type        = bool
  default     = true
}

variable "price_class" {
  description = "Price class de CloudFront. PriceClass_100 = solo edge locations de US/Canada/Europa (más barato); suficiente para un proyecto de 10 días sin tráfico global."
  type        = string
  default     = "PriceClass_100"
}
