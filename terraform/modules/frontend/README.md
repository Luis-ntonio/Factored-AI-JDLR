# Módulo `frontend`

S3 (privado) + CloudFront (con Origin Access Control) para alojar el build
estático de la chat UI real del proyecto (`apps/web`, React + Vite +
TypeScript). Implementado en la fase 2 "AWS real / infra adicional" (ver
`docs/PLAN.md`), sin canal WhatsApp/Insider -- adaptado de la sección 8 del
blueprint `E2E-documentacion-tecnica/E2E-Implementacion-AWS-Terraform-Databricks.md`
(no tiene un equivalente 1:1 ahí porque el blueprint original no sirve un
frontend estático propio; este módulo es contribución nueva de este
proyecto, siguiendo el mismo patrón de bucket privado + CDN con OAC que
recomienda AWS para hosting estático moderno).

## Qué crea este checkpoint

- `aws_s3_bucket.frontend` (`${name_prefix}-frontend`): bucket privado, sin
  `aws_s3_bucket_website_configuration` (sin website hosting público
  directo). `aws_s3_bucket_public_access_block` con los 4 flags en `true`
  salvo `block_public_policy = false` (necesario para que la bucket policy
  de abajo pueda existir -- lo que evita el acceso público real es el scope
  de esa policy, no este flag). `aws_s3_bucket_ownership_controls` en
  `BucketOwnerEnforced` (sin ACLs, consistente con el resto del proyecto).
- `aws_cloudfront_origin_access_control.frontend`: **OAC**, no el OAI
  deprecado. `signing_behavior = "always"`, `signing_protocol = "sigv4"`.
- `aws_cloudfront_distribution.frontend`: origen = el bucket S3 (vía
  `origin_access_control_id`, no `origin_access_identity`), cache policy
  administrada por AWS `CachingOptimized` (ID fijo
  `658327ea-f89d-4fab-a63d-7e88639e58f6`, constante pública documentada por
  AWS, no requiere un data source), `viewer_protocol_policy =
  redirect-to-https`, `price_class = PriceClass_100` (edge locations
  US/Canada/Europa -- suficiente para un proyecto de 10 días sin tráfico
  global), certificado default de `*.cloudfront.net` (sin dominio custom en
  este checkpoint).
- `aws_s3_bucket_policy.frontend`: `s3:GetObject` permitido SOLO al
  principal de servicio `cloudfront.amazonaws.com`, con `Condition
  StringEquals AWS:SourceArn = <ARN de ESTA distribución>` -- nunca acceso
  público abierto, nunca un principal genérico.
- Ruteo SPA (`var.spa_routing_enabled`, default `true`): `custom_error_response`
  403/404 → `/index.html` (200). Necesario porque S3 privado devuelve 403
  (no 404) para rutas sin objeto real, y `apps/web` es una SPA con routing
  client-side -- sin esto, refrescar el navegador en una ruta que no sea
  `/` rompería.

## Qué NO crea este checkpoint (a propósito)

- **Sin contenido subido**: no hay ningún `aws_s3_object`/`local-exec` que
  suba el build de `apps/web` a este bucket. El bucket queda vacío, listo
  para un `aws s3 sync apps/web/dist s3://<bucket_name>/ --delete` de una
  fase futura (fuera de scope de esta tarea). Navegar al dominio de
  CloudFront hoy devuelve un error de "no such key" hasta que exista ese
  contenido -- **limitación esperada, no un bug**.
- **Sin invalidación de caché automática**: cuando exista un pipeline de
  deploy de `apps/web`, ese paso deberá invocar
  `aws cloudfront create-invalidation --distribution-id
  $(terraform output -raw cloudfront_distribution_id) --paths "/*"` (o
  equivalente) después de cada `s3 sync` -- no está automatizado en
  Terraform (fuera de su responsabilidad natural; es un paso de CI/CD, no
  de infra).
- **Sin dominio custom** (`aws_route53_record` + ACM cert): se usa el
  dominio default `*.cloudfront.net`. Ver "Limitaciones" abajo.
- **Sin logging de acceso de CloudFront a S3** (`logging_config` de
  `aws_cloudfront_distribution`): no configurado en este checkpoint. Ver
  "Limitaciones" abajo.

## Por qué OAC y no OAI

El Origin Access Identity (`aws_cloudfront_origin_access_identity`) está
deprecado por AWS a favor de Origin Access Control desde 2022 -- OAC
soporta SigV4 completo (incluye `PUT`/`DELETE` si hiciera falta a futuro,
no solo `GET`) y es el mecanismo recomendado actualmente para todo bucket
S3 nuevo detrás de CloudFront. No había razón para adoptar el patrón
deprecado en infraestructura nueva.

## Integración con `modules/edge` (CORS)

`envs/dev/main.tf` usa `module.frontend.cloudfront_domain_name` como el
origin real de CORS del API Gateway (`module.edge`, variable
`cors_allow_origins`) en vez de `["*"]` -- ver
`terraform/modules/edge/README.md` para el historial de esa limitación y
`terraform/envs/dev/variables.tf` (docstring de `cors_allow_origins`) para
el mecanismo exacto (sentinel `["*"]` que se resuelve al dominio de
CloudFront si no se overridea explícitamente). El dominio de CloudFront
existe desde el primer `apply` de este módulo, incluso con el bucket vacío
-- no hace falta esperar a que exista contenido real para que el CORS
apunte a un origin real.

## Outputs

- `bucket_name` / `bucket_arn`
- `cloudfront_distribution_id` (para invalidaciones futuras)
- `cloudfront_distribution_arn` (usado en la `Condition` de la bucket policy)
- `cloudfront_domain_name` (usado por `module.edge` para CORS)

## Limitaciones conocidas (no silenciadas)

- **Sin dominio custom / certificado ACM propio**: se usa
  `*.cloudfront.net` (certificado default de CloudFront). Pendiente si el
  proyecto necesita un dominio de marca (ej. `chat.<dominio>`) antes de un
  checkpoint de producción -- requeriría `aws_acm_certificate` (en
  `us-east-1`, requisito de CloudFront) + validación DNS + `aliases` en la
  distribución.
- **Sin logging de acceso de CloudFront** (`logging_config`, que escribiría
  a un bucket S3 aparte): no configurado -- impacta parcialmente el pilar
  Observability para este módulo en particular (las 6 Lambdas de negocio +
  Step Function + API Gateway sí tienen logging completo, ver
  `modules/observability/README.md`; el tráfico de CloudFront en sí -- qué
  archivos estáticos se sirvieron, desde qué IP -- no queda registrado hoy).
- **Sin WAF frente a CloudFront** (mismo tipo de limitación ya documentada
  para API Gateway en `modules/edge/README.md`).
- **Sin versionado de bucket S3** (`aws_s3_bucket_versioning`): un
  `aws s3 sync --delete` erróneo en una fase futura de deploy no tendría
  forma de revertirse vía S3 -- mitigable con versionado + lifecycle, no
  implementado en este checkpoint porque el bucket todavía no tiene
  contenido real.
- **Sin cifrado explícito adicional** (`aws_s3_bucket_server_side_encryption_configuration`):
  el bucket usa el cifrado SSE-S3 por defecto de AWS (habilitado
  automáticamente en buckets nuevos desde enero 2023), pero no hay un
  recurso Terraform explícito que lo declare/fuerce (ej. SSE-KMS con una
  key propia). Aceptable para contenido estático público (el build de un
  frontend, no PII), documentado igual por transparencia.
