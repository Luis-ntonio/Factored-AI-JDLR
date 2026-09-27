# Módulo `edge`

API Gateway HTTP como punto de ingreso del chat UI. Implementado en el
checkpoint 0 (fase "Días 1-2 — Infra base" de `docs/PLAN.md`) como scaffold
vacío/mínimo — sin Lambda de negocio todavía. Extendido en la fase "Días 6-7
— Frontend" con soporte CORS para que la chat UI en el navegador de
frontend-dev pueda consumir `POST /chat` directamente. Actualizado en la
fase 2 "AWS real / infra adicional": el CORS efectivo en `envs/dev` ya no es
`"*"` (ver sección CORS abajo, "Actualización fase 2").

Adaptado de la sección 2 y 4.1 del blueprint
`E2E-documentacion-tecnica/E2E-Implementacion-AWS-Terraform-Databricks.md`,
**sin** el nodo `Insider` / webhook de WhatsApp (nuestro canal es el chat UI
que construye `frontend-dev`, no un webhook de un proveedor externo).

## Qué crea este checkpoint

- `aws_apigatewayv2_api` (HTTP API) con `cors_configuration` nativo (ver
  sección CORS abajo).
- `aws_apigatewayv2_stage` `$default` con `auto_deploy = true` y logging de
  acceso a CloudWatch (`aws_cloudwatch_log_group`), formato JSON con
  `requestId`/`status`/`routeKey` para poder correlacionar después con
  `caseId`/`sessionId` (observability, fase 7).
- Punto de integración **conectado** (fase "pipeline end-to-end sobre AWS
  real"): si `var.attach_chat_route = true`, el módulo crea la integración
  `AWS_PROXY` y la ruta `POST /chat` hacia el Lambda dispatcher de
  `modules/orchestration`.

## CORS (fase "Días 6-7 — Frontend")

`aws_apigatewayv2_api.this` tiene un bloque `cors_configuration`:

```hcl
cors_configuration {
  allow_origins = var.cors_allow_origins # default ["*"] -- ver "Actualización fase 2" abajo
  allow_methods = ["POST", "OPTIONS"]
  allow_headers = ["content-type"]
  max_age       = 300
}
```

**Por qué el `cors_configuration` nativo y no headers manuales en el
Lambda**: el Lambda dispatcher (`modules/orchestration/lambda-src/
chat-dispatcher/index.js`) no es ownership de este agente — pertenece a la
lógica ya implementada por el equipo de orquestación/agente. El
`cors_configuration` de HTTP API resuelve el problema completo a nivel de
infraestructura sin tocar ese código:

1. API Gateway responde el preflight `OPTIONS /chat` directamente (nunca
   llega al Lambda, ni siquiera necesita una ruta `OPTIONS` explícita).
2. API Gateway inyecta los headers `Access-Control-Allow-*` en la respuesta
   real de `POST /chat` que devuelve el Lambda vía `AWS_PROXY`, sin que el
   dispatcher necesite agregarlos.

El default del propio módulo sigue siendo `["*"]` (`var.cors_allow_origins`,
`list(string)`) -- este módulo, aislado, no sabe nada de `module.frontend`
ni de CloudFront, sigue siendo agnóstico de quién lo instancia (mismo
criterio que el resto de los módulos, que reciben ARNs/valores explícitos
del root module en vez de referenciar otros módulos directamente).

### Actualización fase 2 ("AWS real / infra adicional"): CORS ya NO es `"*"` en `envs/dev`

**Esto ya NO es una limitación abierta de Security en `envs/dev`** (aunque
el módulo, aislado, sigue soportando `"*"` si alguien lo instancia así).
`terraform/envs/dev/main.tf` resuelve `cors_allow_origins` con un patrón
sentinel: si `var.cors_allow_origins` (de ese ambiente) se deja en su
default `["*"]`, se reemplaza automáticamente por el dominio real de
CloudFront del nuevo módulo `frontend`
(`["https://${module.frontend.cloudfront_domain_name}"]`) antes de pasarlo a
este módulo -- el dominio de CloudFront existe desde el primer `apply` de
`frontend`, incluso con el bucket vacío, así que no hace falta esperar a que
exista contenido real. Verificado en la cuenta real: tras el `apply` de esta
fase, `aws_apigatewayv2_api.this.cors_configuration.allow_origins` quedó en
`["https://d1vi5rhqqyd97a.cloudfront.net"]`, no `["*"]`.

Nota técnica (documentada porque costó un debugging real): la comparación
inicial `var.cors_allow_origins == ["*"]` en HCL **siempre da `false`**,
aunque el contenido sea idéntico -- Terraform representa el valor real de
una variable `list(string)` como `tolist([...])` (tipo "list"), mientras que
un literal `["*"]` en el código es una tuple; `==` en HCL no coacciona entre
esos dos tipos de colección. Se resolvió normalizando ambos lados a string
con `join(",", var.cors_allow_origins) == "*"` en vez de comparar las listas
directamente. Ver `terraform/envs/dev/main.tf`, comentario del local
`cors_allow_origins`.

Para un dominio custom (ej. detrás de Route 53 en un checkpoint de
producción), sigue funcionando el override explícito vía `terraform.tfvars`:
`cors_allow_origins = ["https://<dominio-custom>"]`.

## Limitaciones conocidas de este checkpoint (Security)

Estas omisiones son deliberadas para no bloquear el checkpoint, pero quedan
registradas explícitamente porque impactan el pilar **Security** de
`docs/EVALUATION-CRITERIA.md` y deben resolverse antes del checkpoint final:

- **Sin WAF (`aws_wafv2_web_acl`)**: el blueprint original incluye WAF frente
  al API Gateway. No se agrega en este checkpoint. Riesgo: sin protección
  contra abuso/rate-limit/reglas OWASP a nivel edge. Pendiente para una fase
  de hardening (ver `docs/PLAN.md`, fase 8-9 — Observabilidad/hardening).
  Mismo tipo de limitación en `modules/frontend` (CloudFront sin WAF).
- **Sin autenticación/autorización en el API Gateway**: el endpoint queda
  abierto (sin JWT authorizer, API key, ni IAM auth). Riesgo: cualquiera con
  la URL puede invocar el endpoint. Debe resolverse antes de un checkpoint
  de producción. **Este sigue siendo el gap de Security más relevante de
  este módulo** -- CORS restringido a un origin específico limita qué
  páginas web en un navegador pueden invocarlo sin preflight bloqueado, pero
  NO impide que alguien invoque `POST /chat` directamente con `curl`/Postman
  (CORS es una protección del navegador, no del servidor).
- ~~`cors_allow_origins = ["*"]`~~ **Resuelto en fase 2** -- ver
  "Actualización fase 2" arriba. `envs/dev` ya no deja este valor abierto en
  la práctica.
- Sin rate limiting / throttling explícito a nivel de stage (se usan los
  defaults de API Gateway).

## Outputs

- `api_id`
- `api_endpoint`
- `api_execution_arn`
- `access_log_group_name`
