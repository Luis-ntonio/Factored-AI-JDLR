locals {
  name_prefix = "${var.project_name}-${var.environment}"

  common_tags = merge(
    {
      Project     = var.project_name
      Environment = var.environment
      ManagedBy   = "terraform"
      Module      = "data"
    },
    var.tags
  )
}

# Case / session / conversation state store.
#
# Esquema de claves (adaptado de la sección 4.2 del blueprint
# E2E-Implementacion-AWS-Terraform-Databricks.md, sin canal WhatsApp/Insider):
#   pk     = CASE#<caseId>
#   sk     = MSG#<messageId>
#   gsi1pk = CUSTOMER#<customerId>   (el blueprint original usa FAN#<fromCustomerUserId>;
#            aquí no hay canal "fan" de WhatsApp, así que se renombra a CUSTOMER#
#            porque el actor del lado cliente es simplemente "customer" del chat UI)
#
# Este checkpoint solo crea la tabla. Los items concretos (case, message,
# conversation_state) los escriben los Lambdas de conversation-agent /
# policy-agent en fases posteriores del plan (docs/PLAN.md, fase 2+).
resource "aws_dynamodb_table" "case_store" {
  name         = "${local.name_prefix}-case-store"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "pk"
  range_key    = "sk"

  attribute {
    name = "pk"
    type = "S"
  }

  attribute {
    name = "sk"
    type = "S"
  }

  attribute {
    name = "gsi1pk"
    type = "S"
  }

  global_secondary_index {
    name            = "by-customer"
    hash_key        = "gsi1pk"
    projection_type = "ALL"
  }

  ttl {
    attribute_name = var.ttl_attribute_name
    enabled        = true
  }

  point_in_time_recovery {
    enabled = var.point_in_time_recovery_enabled
  }

  # DynamoDB Streams (fase 2 "AWS real / infra adicional", Tarea 3 de
  # devops): fuente de la tubería de datos hacia analytics
  # (terraform/modules/analytics -> Lambda de transformación -> Kinesis
  # Firehose -> S3). NEW_AND_OLD_IMAGES (no solo KEYS_ONLY/NEW_IMAGE) para
  # que una futura integración de analítica pueda ver el estado anterior de
  # un item además del nuevo (ej. diffs de STATE#latest entre turnos), sin
  # tener que reconstruirlo por otra vía.
  stream_enabled   = true
  stream_view_type = "NEW_AND_OLD_IMAGES"

  tags = local.common_tags
}

# Catálogo de productos de crédito + FAQs (gap 1 del checkpoint "AWS real",
# Tarea 1 de devops). Contenido de REFERENCIA ESTÁTICO (tasas, requisitos,
# FAQs redactadas a mano), no de sesión -- a diferencia de `case_store` NO
# tiene GSI ni TTL: nada acá debe expirar automáticamente ni se consulta por
# un atributo distinto de pk/sk.
#
# Esquema de claves (fuente de verdad real del contenido: `PRODUCT_CATALOG`/
# `FAQS` en services/retrieval-agent/src/data/catalog.ts; ver
# services/retrieval-agent/scripts/seed-catalog.ts para el mapeo exacto):
#   Producto: pk = PRODUCT#<productType>, sk = INFO
#   FAQ:      pk = FAQ#<faqId>,           sk = INFO#<language>
#             (no "INFO" a secas -- cada faqId tiene variante es/pt, y con
#             sk fijo la segunda escritura pisaría a la primera)
resource "aws_dynamodb_table" "product_catalog" {
  name         = "${local.name_prefix}-product-catalog"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "pk"
  range_key    = "sk"

  attribute {
    name = "pk"
    type = "S"
  }

  attribute {
    name = "sk"
    type = "S"
  }

  point_in_time_recovery {
    enabled = var.point_in_time_recovery_enabled
  }

  tags = local.common_tags
}

# --- Seeding: puebla product_catalog desde services/retrieval-agent -------
#
# Decisión de empaquetado/orden (documentada, no accidental): el script de
# seed (`scripts/seed-catalog.ts`) vive en el workspace de retrieval-agent y
# se compila junto con el resto de ese workspace (`npm run build` ->
# `dist/scripts/seed-catalog.js`, ya incluido en el script "build" de ese
# package.json). En vez de exigir que quien corre `terraform apply` haya
# corrido ANTES `npm run build` a mano (un paso implícito fácil de olvidar,
# sobre todo en CI), este `local-exec` hace los dos pasos en una sola
# invocación: (1) `npm run build --workspace=@banking-agent/retrieval-agent`
# desde la raíz del monorepo (garantiza que dist/scripts/seed-catalog.js
# esté actualizado con el catalog.ts actual, incluso si alguien corrió
# `terraform apply` sin compilar a mano antes), (2) `node
# dist/scripts/seed-catalog.js` desde `services/retrieval-agent/` (contrato
# pedido explícitamente: CATALOG_TABLE_NAME + AWS_REGION + credenciales
# resueltas por el SDK estándar). Costo: cada `terraform apply` que dispare
# este trigger recompila ese único workspace (rápido, `tsc` sobre un
# proyecto chico) -- se prefiere ese costo pequeño y determinista a la
# fragilidad de un paso manual "acordate de compilar antes".
#
# El script es IDEMPOTENTE (mismo pk/sk + contenido determinístico converge)
# y FALLA RUIDOSAMENTE (`process.exit(1)`) si una escritura falla -- por
# diseño (ver docstring del script), para que este `local-exec` se entere y
# `terraform apply` termine en error en vez de dejar la tabla parcialmente
# poblada en silencio.
resource "null_resource" "seed_catalog" {
  count = var.enable_catalog_seed ? 1 : 0

  triggers = {
    # Re-corre el seed si cambia el contenido de catalog.ts (única fuente de
    # verdad del catálogo) o si la tabla se recrea.
    catalog_source_hash = filemd5("${var.repo_root}/services/retrieval-agent/src/data/catalog.ts")
    table_name          = aws_dynamodb_table.product_catalog.name
  }

  provisioner "local-exec" {
    working_dir = var.repo_root
    command     = "npm run build --workspace=@banking-agent/retrieval-agent && cd services/retrieval-agent && node dist/scripts/seed-catalog.js"

    environment = {
      CATALOG_TABLE_NAME = aws_dynamodb_table.product_catalog.name
      AWS_REGION         = var.aws_region
      AWS_PROFILE        = coalesce(var.aws_profile, "")
    }
  }

  depends_on = [aws_dynamodb_table.product_catalog]
}
