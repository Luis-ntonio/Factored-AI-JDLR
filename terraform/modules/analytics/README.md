# Módulo `analytics`

DynamoDB Streams (`case_store`) → Lambda de transformación → Kinesis
Firehose (Direct PUT) → S3, particionado por fecha de ingesta. Implementado
en la fase 2 "AWS real / infra adicional" (Tarea 3 de devops, ver
`docs/PLAN.md`). Prepara datos consumibles a futuro para una integración de
analítica (Databricks u otra) -- **esa integración de consumo está
explícitamente fuera de scope** (decisión del usuario: no hay Databricks en
este proyecto). Este módulo solo construye la tubería hasta S3.

## Por qué un módulo separado (`analytics`), no dentro de `modules/data`

Mismo criterio de responsabilidad única que ya separa `edge`/`data`/
`agent`/`orchestration`/`frontend`: `modules/data` es dueño de las tablas
DynamoDB (su esquema, su contenido, su seeding); este módulo es dueño de la
tubería de eventos que se deriva de esas tablas (Lambda + IAM + Firehose +
bucket de destino), un conjunto de recursos y responsabilidades
completamente distinto (procesamiento de streaming vs. almacenamiento
transaccional). La única pieza que SÍ vive en `modules/data` es la
habilitación del stream en sí (`stream_enabled`/`stream_view_type` en el
recurso `aws_dynamodb_table.case_store`, con su ARN expuesto como output
`case_store_stream_arn`) -- es un atributo de la tabla, no de la tubería que
lo consume.

## Por qué hace falta un Lambda intermedio (no Firehose directo desde el stream)

Kinesis Firehose **no tiene un origen nativo de "DynamoDB Streams"** (a
diferencia de Kinesis Data Streams, que sí puede ser origen directo de un
Firehose delivery stream). El único puente real es un Lambda que:

1. Se suscribe al stream de DynamoDB vía **event source mapping**
   (`aws_lambda_event_source_mapping`, `starting_position = "LATEST"`,
   `batch_size = 100`).
2. Transforma cada record recibido y hace `PutRecordBatch` hacia el
   Firehose delivery stream (Direct PUT como source de Firehose).

Código: `lambda-src/case-store-stream-transformer/index.js` -- JS plano sin
dependencias de negocio, mismo criterio que el Lambda dispatcher de
`terraform/modules/orchestration/lambda-src/chat-dispatcher/index.js` (sin
esbuild, zippeado directo vía `data.archive_file`), usando SOLO
`@aws-sdk/client-firehose` (preinstalado en el runtime Node.js 20.x de
Lambda, igual que `@aws-sdk/client-sfn` en el dispatcher).

## Formato exacto de los datos en S3

**Esto es lo que necesita saber una futura integración de analítica sin
tener que leer el código de este módulo:**

- **Un objeto JSON por record de DynamoDB Streams, SIN aplanar.** El Lambda
  de transformación deja `Keys`/`NewImage`/`OldImage` en **formato DynamoDB
  JSON tal cual** (con los wrappers de tipo de DynamoDB, ej.
  `{"pk": {"S": "CASE#123"}, "ttl": {"N": "1700000000"}}`), no un JSON
  "plano" (`{"pk": "CASE#123", "ttl": 1700000000}`). Decisión: aplanar
  perdería información de tipo sin un mapeo de negocio explícito, y ese
  mapeo no es responsabilidad de un Lambda de puro glue de infra -- queda
  como trabajo de la futura integración de consumo (ej. un job de
  Databricks/Glue que sepa deserializar DynamoDB JSON, algo estándar y bien
  soportado en ambos).
- **Estructura de cada objeto** (ver `toFirehoseRecord` en `index.js`):
  ```json
  {
    "eventId": "<DynamoDB Streams eventID>",
    "eventName": "INSERT | MODIFY | REMOVE",
    "eventSourceArn": "<ARN del stream>",
    "approximateCreationDateTime": "<ISO 8601>",
    "keys": { "pk": { "S": "CASE#..." }, "sk": { "S": "MSG#..." } },
    "newImage": { /* DynamoDB JSON completo del item después del cambio, null si eventName=REMOVE */ },
    "oldImage": { /* DynamoDB JSON completo del item antes del cambio, null si eventName=INSERT */ }
  }
  ```
  (`newImage`/`oldImage` disponibles ambos porque `stream_view_type =
  "NEW_AND_OLD_IMAGES"` en `modules/data`, no solo `NEW_IMAGE`/`KEYS_ONLY`.)
- **Delimitador: newline-delimited JSON (NDJSON).** Cada objeto se serializa
  con `JSON.stringify(...) + "\n"` ANTES de mandarlo a Firehose -- Firehose
  en modo Direct PUT **no agrega delimitadores automáticamente** entre
  records dentro de un mismo archivo de S3, así que si el Lambda no lo
  hiciera, los objetos quedarían concatenados sin separador. Un archivo de
  S3 típico contiene múltiples líneas NDJSON (uno o más batches de Firehose
  concatenados según su buffer).
- **Compresión: GZIP** (`compression_format = "GZIP"` en el
  `extended_s3_configuration`). Los archivos en S3 tienen extensión `.gz` y
  hay que descomprimirlos antes de leer el NDJSON -- estándar, soportado
  nativamente por Spark/Databricks/Glue/`pandas.read_json(..., lines=True,
  compression="gzip")`, etc.
- **Particionado**: por timestamp de ingesta de Firehose (nativo, sin
  dynamic partitioning avanzado), prefijo
  `year=!{timestamp:yyyy}/month=!{timestamp:MM}/day=!{timestamp:dd}/` --
  compatible con particionado Hive-style que Spark/Athena/Glue detectan
  automáticamente. Nota: es la fecha en que Firehose **recibió** el record
  (ingesta), no la fecha del evento de DynamoDB (`approximateCreationDateTime`,
  que sí queda dentro del payload si hace falta particionar/filtrar por esa
  fecha en vez de la de ingesta).
- **Errores de entrega**: prefijo separado
  `errors/year=.../month=.../day=.../!{firehose:error-output-type}/` (ej.
  fallos de conexión con S3) -- separado del prefijo de datos válidos para
  no mezclar ambos en el mismo `year=/month=/day=` que consumiría una
  integración de analítica.

## Qué crea este módulo

| Recurso | Propósito |
|---------|-----------|
| `aws_s3_bucket.case_store_analytics` (`${name_prefix}-case-store-analytics`) | Bucket S3 NUEVO, privado (`aws_s3_bucket_public_access_block` con los 4 flags en `true`), destino final de la tubería. Separado del bucket de `frontend` y de las tablas de `modules/data`. |
| `aws_iam_role.stream_transformer` + 2 `aws_iam_role_policy` | Rol del Lambda de transformación: `dynamodb:DescribeStream`/`GetRecords`/`GetShardIterator` scoped al `stream_arn` exacto, `dynamodb:ListStreams` scoped al patrón `<table_arn>/stream/*` (exigido por DynamoDB para esa acción), `firehose:PutRecord`/`PutRecordBatch` scoped al ARN del delivery stream de este módulo, más logging básico (`AWSLambdaBasicExecutionRole`). Sin `dynamodb:GetItem`/`Query`/`Scan` (no lee la tabla directamente, solo el stream), sin `lambda:InvokeFunction`. |
| `aws_lambda_function.stream_transformer` | Lambda de transformación (Node.js 20.x, JS plano). |
| `aws_lambda_event_source_mapping.case_store_stream` | Suscribe el Lambda al stream de `case_store` (`starting_position = LATEST`, `batch_size = 100`, `bisect_batch_on_function_error = true`, `maximum_retry_attempts = 3`). |
| `aws_iam_role.firehose_delivery` + `aws_iam_role_policy` | Rol de servicio de Firehose: `s3:PutObject`/`GetObject`/`ListBucket`/`AbortMultipartUpload`/etc. scoped al bucket de este módulo, `logs:PutLogEvents` scoped a su log group. |
| `aws_kinesis_firehose_delivery_stream.case_store` (tipo `DirectPut`, destino `extended_s3`) | Delivery stream que escribe a S3, particionado por fecha, comprimido GZIP. |
| `aws_cloudwatch_log_group`/`aws_cloudwatch_log_stream` (Lambda + Firehose) | Logging de ambos componentes -- correlación de errores de la tubería, no de `caseId`/`sessionId` individual (ver Limitaciones). |

## Limitaciones conocidas (no silenciadas)

- **Sin cifrado adicional en el bucket de analytics**
  (`aws_s3_bucket_server_side_encryption_configuration` con SSE-KMS propia):
  usa el cifrado SSE-S3 por defecto de AWS (automático en buckets nuevos),
  sin un recurso Terraform explícito que lo declare/fuerce. Mismo criterio
  que `modules/frontend` -- aceptable para el scope de 10 días, documentado
  igual por transparencia (a diferencia del frontend, este bucket SÍ
  contiene datos derivados de PII de `case_store` -- ver el punto de
  retención abajo, que es más relevante acá que en `frontend`).
- **Sin lifecycle policy de retención en el bucket** (`aws_s3_bucket_lifecycle_configuration`):
  los objetos se acumulan indefinidamente. Esto es una limitación real de
  Security/data retention -- ver `terraform/modules/data/README.md`,
  sección "Política de data retention", punto "Actualización (fase 2)": el
  TTL de 30 días de `case_store` NO se propaga a este bucket. Un item que
  expira en `case_store` generó un evento `REMOVE` que SÍ quedó como
  registro en S3 (evidencia de que existió y fue borrado), pero los eventos
  `INSERT`/`MODIFY` anteriores de ese mismo item **persisten en S3
  indefinidamente** salvo que se agregue una lifecycle policy acá.
  Coordinación pendiente con policy-agent sobre cuál debería ser esa
  política (¿espejar los 30 días de `case_store`? ¿más largo, por valor
  analítico? ¿requiere anonimización en vez de borrado?) -- no resuelta en
  este checkpoint.
- **Sin partial batch item failure reporting** en el
  `aws_lambda_event_source_mapping`: si `PutRecordBatch` falla para
  cualquier record del batch, el Lambda lanza una excepción y **todo el
  batch** se reintenta (`bisect_batch_on_function_error = true` ayuda a
  aislar el/los record(s) problemático(s) dividiendo el batch en llamadas
  más chicas en reintentos sucesivos, pero no hay reporte fino de qué
  records específicos fallaron en la primera pasada).
- **Sin destino `on_failure`** (SQS/SNS) en el event source mapping: si un
  batch agota `maximum_retry_attempts = 3` sin éxito, DynamoDB Streams
  **descarta esos records sin dejar rastro** (más allá del error en
  CloudWatch Logs del Lambda) -- no hay una cola de dead-letter para
  inspeccionarlos/reprocesarlos manualmente. Aceptable para un pipeline de
  analítica de mejor esfuerzo (no es una ruta transaccional crítica del
  pipeline Understand→Decide→Act→Verify→Escalate), pero es una limitación
  real si se necesitara garantizar cero pérdida de eventos.
- **Sin dynamic partitioning avanzado de Firehose** (particionar por
  `caseId`/`eventName`/etc. dentro del prefijo S3): se usa solo el
  particionado nativo por timestamp de ingesta (`year=/month=/day=`) — ver
  sección "Formato exacto de los datos en S3" arriba. Suficiente para el
  scope de 10 días; una integración de analítica real probablemente querría
  particionar también por tipo de evento o entidad.
- **No implementa ninguna integración de consumo** (Databricks u otra) --
  explícitamente fuera de scope (decisión del usuario). Este módulo termina
  en "datos NDJSON.gz consultables en S3", no en un catálogo de datos, un
  crawler de Glue, ni un job de transformación downstream.

## Outputs

- `analytics_bucket_name` / `analytics_bucket_arn`
- `firehose_delivery_stream_name` / `firehose_delivery_stream_arn`
- `stream_transformer_function_name` / `stream_transformer_function_arn`
