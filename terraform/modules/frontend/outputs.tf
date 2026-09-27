output "bucket_name" {
  description = "Nombre del bucket S3 privado que aloja el build estático del frontend (apps/web). Vacío en este checkpoint -- listo para recibir un `aws s3 sync` de un build real en una fase futura."
  value       = aws_s3_bucket.frontend.id
}

output "bucket_arn" {
  description = "ARN del bucket S3 del frontend."
  value       = aws_s3_bucket.frontend.arn
}

output "cloudfront_distribution_id" {
  description = "ID de la distribución de CloudFront (usado para invalidaciones de caché tras un deploy de contenido, ej. `aws cloudfront create-invalidation`)."
  value       = aws_cloudfront_distribution.frontend.id
}

output "cloudfront_distribution_arn" {
  description = "ARN de la distribución de CloudFront."
  value       = aws_cloudfront_distribution.frontend.arn
}

output "cloudfront_domain_name" {
  description = "Dominio de CloudFront (ej. dxxxxxxxxxxxxx.cloudfront.net). Existe desde el primer `apply` aunque el bucket esté vacío -- usado por envs/dev/main.tf para el CORS real de module.edge (cors_allow_origins)."
  value       = aws_cloudfront_distribution.frontend.domain_name
}
