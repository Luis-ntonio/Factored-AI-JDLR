# Módulo `data`

Case/session/conversation state store en DynamoDB, más el catálogo de
productos de crédito/FAQs (gap 1 del checkpoint "AWS real", agregado en la
fase de conexión del pipeline end-to-end). Implementado inicialmente en el
checkpoint 0 (fase "Días 1-2 — Infra base" de `docs/PLAN.md`). DynamoDB
Streams sobre `case_store` agregado en la fase 2 "AWS real / infra
adicional" (Tarea 3 de devops, ver `terraform/modules/analytics/README.md`).

Adaptado de la sección 4.2 del blueprint
`E2E-documentacion-tecnica/E2E-Implementacion-AWS-Terraform-Databricks.md`.

## Tabla 1: `case_store` (`${name_prefix}-case-store`)

| Campo | Valor | Notas |
|-------|-------|-------|
| `pk` (hash key) | `CASE#<caseId>` | Igual al blueprint. |
| `sk` (range key) | `MSG#<messageId>` | Igual al blueprint. |
| `gsi1pk` (GSI `by-customer`) | `CUSTOMER#<customerId>` | **Cambio de nombre vs. blueprint**: el original usa `FAN#<fromCustomerUserId>` porque el canal es WhatsApp/Insider (el actor del lado cliente se modela como "fan"). Nuestro canal es el chat UI de `frontend-dev`, sin concepto de "fan" — se usa `CUSTOMER#<customerId>` para reflejar el dominio real de este proyecto. |
| `ttl` | epoch seconds | Atributo de expiración automática (TTL habilitado). Ver "Política de data retention" abajo. |

Contenido real: dos tipos de item por `caseId` (`MSG#<messageId>` log
append-only, `STATE#latest` upserted) escritos por conversation-agent, más
`RESULT#eligibility#<turnId>` escrito por transaction-agent en la misma
partición (`pk = CASE#<caseId>`). Ver `docs/CONTRACTS.md` sección 7.

### DynamoDB Streams (fase 2, Tarea 3)

`stream_enabled = true`, `stream_view_type = "NEW_AND_OLD_IMAGES"`. Fuente
de la tubería de analítica (`terraform/modules/analytics`): un Lambda de
transformación consume este stream vía event source mapping y reenvía cada
record a un Kinesis Firehose delivery stream, que lo deposita en S3
particionado por fecha. Ver `terraform/modules/analytics/README.md` para el
diseño completo (por qué un módulo separado, el Lambda de transformación,
el formato exacto de los datos en S3).

`NEW_AND_OLD_IMAGES` (no `KEYS_ONLY`/`NEW_IMAGE`) para que la analítica
pueda ver el estado anterior de un item además del nuevo -- útil para
reconstruir diffs de `STATE#latest` entre turnos sin depender de otra
fuente. Output nuevo: `case_store_stream_arn`.

## Tabla 2: `product_catalog` (`${name_prefix}-product-catalog`)

Contenido de **referencia estático** (tasas, requisitos, FAQs redactadas a
mano en ES/PT) — a diferencia de `case_store`, no tiene GSI ni TTL: nada acá
expira automáticamente ni se consulta por un atributo distinto de `pk`/`sk`.
Tampoco tiene streams habilitado -- no aplica a contenido de referencia sin
cambios frecuentes ni valor analítico por evento.

| Campo | Valor |
|-------|-------|
| `pk`/`sk` producto | `PRODUCT#<productType>` / `INFO` |
| `pk`/`sk` FAQ | `FAQ#<faqId>` / `INFO#<language>` |

Fuente de verdad del contenido: `services/retrieval-agent/src/data/catalog.ts`
(`PRODUCT_CATALOG`/`FAQS`) — la tabla nunca duplica ese contenido en HCL.

### Seeding

`null_resource.seed_catalog` corre en cada `terraform apply` que cambie
`catalog.ts` (trigger = `filemd5` del archivo), con `local-exec`:

1. `npm run build --workspace=@banking-agent/retrieval-agent` (desde
   `var.repo_root`) — recompila el workspace de retrieval-agent, incluyendo
   `scripts/seed-catalog.ts -> dist/scripts/seed-catalog.js`, para no
   depender de que quien corre `apply` haya compilado a mano antes.
2. `node dist/scripts/seed-catalog.js` (desde `services/retrieval-agent/`)
   con `CATALOG_TABLE_NAME`/`AWS_REGION`/`AWS_PROFILE` como env vars.

El script (`services/retrieval-agent/scripts/seed-catalog.ts`, no
modificado por devops, solo invocado) es idempotente (mismo `pk`/`sk` +
contenido determinístico converge) y falla ruidosamente (`process.exit(1)`)
si una escritura falla, para que `terraform apply` termine en error en vez
de dejar la tabla parcialmente poblada en silencio.

Para correr el seed manualmente (fuera de Terraform), ver
`terraform/README.md` sección "Seed manual del catálogo".

`var.enable_catalog_seed = false` desactiva el `null_resource` (ej. si Node
no está disponible en la máquina que corre `apply`, o para iterar en la
tabla sin recompilar en cada apply).

## Decisiones de este checkpoint

- `billing_mode = PAY_PER_REQUEST` en ambas tablas (sin capacity planning
  todavía; razonable para scope de 10 días y tráfico de validación).
- Point-in-time recovery habilitado por defecto
  (`var.point_in_time_recovery_enabled = true`) en ambas tablas.
- No se crea aquí ninguna tabla adicional de idempotencia
  (`processed_events` del blueprint) ni S3 de adjuntos — no aplican a este
  flujo (no hay canal WhatsApp con adjuntos). transaction-agent implementa
  su propia idempotencia (`caseId:turnId`) como item en `case_store`, no
  como tabla separada.

## Política de data retention (Security, `docs/EVALUATION-CRITERIA.md`)

- `case_store`: TTL habilitado desde el checkpoint 0, valor actual
  `now + 30 días` fijado por conversation-agent como **placeholder
  explícito** (constante `DEFAULT_TTL_DAYS` en su código, no en Terraform).
  Es un mecanismo (el atributo TTL existe y DynamoDB lo respeta), no todavía
  una política de negocio confirmada — coordinación pendiente entre
  policy-agent y devops (mencionada en `docs/PLAN.md`). Cubre PII del
  cliente (`entities.document_id`, ingreso, etc.) recolectada durante la
  conversación.
- `product_catalog`: sin TTL a propósito — es contenido de referencia
  versionado en código (`catalog.ts`), no dato de sesión de un cliente, no
  hay razón de negocio para expirarlo automáticamente. Su ciclo de vida lo
  gobierna el seed (reemplazo determinístico en cada cambio de `catalog.ts`,
  nunca borrado automático).
- Ningún dato de este módulo se replica fuera de esta cuenta/región AWS.
  **Actualización (fase 2)**: `case_store` ahora SÍ se replica a otro
  recurso *dentro* de la misma cuenta/región — el bucket S3 de
  `terraform/modules/analytics` (vía Streams -> Lambda -> Firehose). Esa
  réplica **no hereda el TTL de `case_store`**: cuando un item expira y
  DynamoDB lo borra, el evento `REMOVE` correspondiente sí llega al stream y
  queda igual como registro en S3 (evidencia histórica de que el item
  existió y fue borrado), pero los registros ya escritos en S3 de eventos
  `INSERT`/`MODIFY` anteriores no se purgan -- **no hay lifecycle policy de
  retención en el bucket de analytics** (limitación documentada en
  `terraform/modules/analytics/README.md`). Esto es relevante para la
  política de retención de PII: los datos que hoy expiran de `case_store` a
  los 30 días **persisten indefinidamente** en el bucket de analytics salvo
  que se agregue una lifecycle policy ahí. Coordinación pendiente con
  policy-agent (misma nota que el punto anterior).

## Outputs

- `table_name` / `table_arn` / `case_store_stream_arn` (case store)
- `gsi_by_customer_name`
- `product_catalog_table_name` / `product_catalog_table_arn`
