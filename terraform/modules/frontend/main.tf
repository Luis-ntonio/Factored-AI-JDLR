locals {
  name_prefix = "${var.project_name}-${var.environment}"

  common_tags = merge(
    {
      Project     = var.project_name
      Environment = var.environment
      ManagedBy   = "terraform"
      Module      = "frontend"
    },
    var.tags
  )

  # Cache policy administrada por AWS "CachingOptimized" -- ID fijo, igual
  # en todas las cuentas/regiones (no hace falta un data source, AWS la
  # documenta como constante pública). Evita reinventar una cache policy
  # custom para un caso de uso estándar (SPA estática servida desde S3).
  caching_optimized_policy_id = "658327ea-f89d-4fab-a63d-7e88639e58f6"
}

# ---------------------------------------------------------------------------
# S3: bucket privado que aloja el build estático de apps/web (React + Vite).
# Checkpoint actual: infraestructura VACÍA -- no se sube contenido todavía
# (eso es una fase futura, un `aws s3 sync` de un build real). Sin website
# hosting público directo (`aws_s3_bucket_website_configuration`) a
# propósito: el único punto de acceso público es CloudFront vía OAC, nunca
# el bucket S3 directamente.
# ---------------------------------------------------------------------------
resource "aws_s3_bucket" "frontend" {
  bucket = "${local.name_prefix}-frontend"

  tags = local.common_tags
}

resource "aws_s3_bucket_public_access_block" "frontend" {
  bucket = aws_s3_bucket.frontend.id

  block_public_acls       = true
  block_public_policy     = false # la bucket policy de abajo SÍ necesita poder existir -- lo que bloquea el acceso público real es que su Principal está scoped a cloudfront.amazonaws.com + Condition AWS:SourceArn, no un acceso público genérico.
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "frontend" {
  bucket = aws_s3_bucket.frontend.id

  rule {
    object_ownership = "BucketOwnerEnforced" # fuerza IAM/bucket-policy-only, sin ACLs -- consistente con el resto del proyecto (ningún otro bucket de este proyecto usa ACLs).
  }
}

# ---------------------------------------------------------------------------
# CloudFront: Origin Access Control (OAC), NO el OAI deprecado. Único punto
# de acceso público a este contenido.
# ---------------------------------------------------------------------------
resource "aws_cloudfront_origin_access_control" "frontend" {
  name                              = "${local.name_prefix}-frontend-oac"
  description                       = "OAC para que CloudFront lea el bucket S3 del frontend (${local.name_prefix}-frontend) sin exponerlo públicamente."
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_cloudfront_distribution" "frontend" {
  enabled             = true
  is_ipv6_enabled     = true
  default_root_object = var.default_root_object
  price_class         = var.price_class
  comment             = "${local.name_prefix} chat UI (apps/web) -- servido desde S3 privado vía OAC."

  origin {
    domain_name              = aws_s3_bucket.frontend.bucket_regional_domain_name
    origin_id                = "${local.name_prefix}-frontend-s3-origin"
    origin_access_control_id = aws_cloudfront_origin_access_control.frontend.id
  }

  default_cache_behavior {
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "${local.name_prefix}-frontend-s3-origin"
    viewer_protocol_policy = "redirect-to-https"
    compress               = true
    cache_policy_id        = local.caching_optimized_policy_id
  }

  # Patrón SPA (Vite + React Router en apps/web): S3 privado devuelve 403
  # (sin ACL pública) para rutas que no son un archivo real, no 404 -- se
  # reescriben ambos a /index.html con 200 para que el router del cliente
  # resuelva la ruta.
  dynamic "custom_error_response" {
    for_each = var.spa_routing_enabled ? [403, 404] : []
    content {
      error_code         = custom_error_response.value
      response_code      = 200
      response_page_path = "/${var.default_root_object}"
    }
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  # Sin dominio custom en este checkpoint (limitación conocida, ver
  # README.md) -- certificado default de *.cloudfront.net.
  viewer_certificate {
    cloudfront_default_certificate = true
  }

  tags = local.common_tags
}

# ---------------------------------------------------------------------------
# Bucket policy: permite s3:GetObject SOLO al principal de servicio de
# CloudFront, condicionado al ARN de ESTA distribución específica -- nunca
# acceso público abierto.
# ---------------------------------------------------------------------------
data "aws_iam_policy_document" "frontend_bucket_policy" {
  statement {
    sid    = "AllowCloudFrontServicePrincipalReadOnly"
    effect = "Allow"

    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }

    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.frontend.arn}/*"]

    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.frontend.arn]
    }
  }
}

resource "aws_s3_bucket_policy" "frontend" {
  bucket = aws_s3_bucket.frontend.id
  policy = data.aws_iam_policy_document.frontend_bucket_policy.json

  depends_on = [aws_s3_bucket_public_access_block.frontend]
}
