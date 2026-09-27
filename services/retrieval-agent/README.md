# retrieval-agent

Parte **informativa** de la capa "Act" del pipeline (`.claude/agents/` —
credit-product info & eligibility): catálogo de productos de crédito
(tasas, requisitos, condiciones) y FAQs asociadas, para los intents
`product_info` y `faq` una vez que `policy-agent` los autorizó (`decision
=== "AUTO"`). **El cálculo de elegibilidad en sí (`eligibility_check`) NO
vive acá** — lo hace transaction-agent (fase posterior de `docs/PLAN.md`).

Runtime: Node.js 20.x + TypeScript (CommonJS), mismo criterio que
`conversation-agent`/`policy-agent` — ver `docs/CONTRACTS.md` sección 3 para
las razones (compartir tipos de `packages/shared` sin serialización
intermedia, cold start liviano del SDK de AWS v3).

## Estructura

```
src/
  data/
    catalog.ts             # seed versionado: PRODUCT_CATALOG + FAQS (es/pt)
  repository/
    types.ts                # interfaz CatalogRepository + CatalogLookupResult
    static-catalog-repository.ts    # backend por defecto de este checkpoint
    dynamodb-catalog-repository.ts  # backend real, contra tabla real de devops
    index.ts
  handle-retrieval.ts       # lógica de negocio pura (handleRetrieval)
  index.ts                  # handler de Lambda (no conectado a API Gateway)
scripts/
  seed-catalog.ts           # puebla la tabla DynamoDB desde src/data/catalog.ts
                             # (invocado por devops vía Terraform local-exec)
test/                        # vitest — repos, lógica de negocio, integración
                              # real con policy-agent, handler Lambda, seed
```

## Decisión de infra: DynamoDB (no S3)

El catálogo vive en **DynamoDB**, no S3, por consistencia con el patrón
`pk`/`sk` ya usado en `terraform/modules/data` para
`banking-agent-dev-case-store`, y porque el acceso es siempre por clave
exacta (`productType` o `faqId`), sin necesidad de un índice de búsqueda tipo
S3+Glue/Athena. La tabla la crea **devops en Terraform** (este servicio no
toca `terraform/`):

- Nombre: `banking-agent-dev-product-catalog`.
- Producto: `pk = PRODUCT#<productType>`, `sk = INFO`.
- FAQ: `pk = FAQ#<faqId>`, `sk = INFO#<language>` — **decisión aplicada**
  (no un bug pendiente): `FAQS` en `src/data/catalog.ts` tiene dos entradas
  por `id` (una por `language`, `"es"`/`"pt"`); si el `sk` fuera el literal
  `"INFO"` para ambas, la segunda escritura pisaría a la primera (mismo
  `pk`+`sk` exacto) y se perdería un idioma. `listFaqs()` no depende del
  valor exacto de `sk` (filtra por el atributo `language` vía `Scan`), así
  que este cambio de schema no tocó lógica de lectura.
- `PAY_PER_REQUEST`, sin GSI, sin `ttl` (contenido de referencia estático,
  no datos de sesión con expiración).
- Trade-off documentado en `dynamodb-catalog-repository.ts`: sin GSI, listar
  "todas las FAQs de un idioma" usa un `Scan` con `FilterExpression` — se
  acepta porque la tabla es pequeña y de muy baja frecuencia de escritura
  (contenido de referencia, no el hot path del chat).

## Seeding de la tabla: `scripts/seed-catalog.ts`

`src/data/catalog.ts` (`PRODUCT_CATALOG` + `FAQS`) sigue siendo la ÚNICA
fuente de verdad del catálogo — nunca se duplica ese contenido en
Terraform/HCL. `scripts/seed-catalog.ts` lee esas constantes y hace
`PutCommand` por cada producto/FAQ contra la tabla real.

- Invocación: devops lo corre una vez por `terraform apply`, vía
  `null_resource` + `local-exec`, después de crear la tabla.
- Comando: `npm run seed:catalog --workspace=@banking-agent/retrieval-agent`
  (equivalente a `node dist/scripts/seed-catalog.js` desde este directorio,
  que es lo que ejecuta el script `package.json`) — requiere `npm run build`
  previo de este workspace (`tsc -p tsconfig.json && tsc -p
  tsconfig.scripts.json`, ambos encadenados en el script `build`).
- Variables de entorno: `CATALOG_TABLE_NAME` (default
  `banking-agent-dev-product-catalog`), `AWS_REGION` (pasada a
  `buildDocClientFromEnv`). Las credenciales de AWS se resuelven vía la
  cadena estándar del SDK (`AWS_PROFILE`/rol de la máquina que corre
  `terraform apply`/etc.) — sin código especial en el script.
- Idempotencia: `PutCommand` con el mismo `pk`/`sk` y el mismo contenido
  determinístico converge al mismo estado en cada corrida, así que re-correr
  el seed en cada `apply` es seguro y mantiene la tabla sincronizada si el
  catálogo en código cambia.
- Reliability de este script (criterio deliberadamente OPUESTO al de los
  handlers de Lambda): a diferencia de `dynamodb-catalog-repository.ts` (que
  nunca lanza y siempre resuelve a un fallback seguro para no romper la
  experiencia de un usuario real), este script es una herramienta de
  provisión ejecutada por un operador/CI, así que debe fallar RUIDOSAMENTE
  (`process.exit(1)` + log del item que falló) si una escritura falla — para
  que `terraform apply` se entere y no quede la tabla parcialmente poblada
  en silencio.
- La lógica pura de mapeo catálogo -> items de DynamoDB está extraída a
  `buildCatalogItems()` (exportada desde `scripts/seed-catalog.ts`) para
  poder testearla sin mockear el SDK de AWS — ver
  `test/seed-catalog.test.ts`.

## `CATALOG_BACKEND` — selección de implementación

Variable de entorno leída por el handler de Lambda (`src/index.ts`):

- `"static"` (**default en código**, usado si la variable no está seteada):
  sirve el seed versionado en `src/data/catalog.ts` vía
  `StaticCatalogRepository`. Sigue siendo el default para tests/desarrollo
  local — no cambió con la creación de la tabla real.
- `"dynamodb"`: usa `DynamoDbCatalogRepository` contra `CATALOG_TABLE_NAME`
  (default `banking-agent-dev-product-catalog`). Código real
  (`@aws-sdk/client-dynamodb` + `@aws-sdk/lib-dynamodb`). devops setea
  `CATALOG_BACKEND=dynamodb` + `CATALOG_TABLE_NAME` como variables de
  entorno del Lambda real en Terraform (no como cambio de default en
  código) una vez que la tabla existe y está poblada por
  `scripts/seed-catalog.ts`.

## Reliability (docs/EVALUATION-CRITERIA.md)

- `DynamoDbCatalogRepository` replica el patrón de reintentos acotados de
  `services/conversation-agent/src/context/state-store.ts` (2 reintentos por
  defecto, backoff corto ~75ms/~150ms, nunca reintento infinito). No se
  importa ese código directamente (conversation-agent es un servicio Lambda
  separado, no una librería compartida) — se replica el patrón.
- `CatalogLookupResult<T>` distingue explícitamente `"found"` / `"not_found"`
  / `"unavailable"` — nunca se confunde "el producto no está en el catálogo"
  (fallback: `found:false` con nota explícita) con "la fuente no respondió"
  (fallback: `found:false` con nota de degradación, motivo incluido). Ningún
  camino de fallo lanza una excepción sin manejar ni inventa un valor de
  reemplazo.
- El handler de Lambda (`src/index.ts`) nunca devuelve un 5xx: cualquier
  excepción (body malformado, error interno inesperado) se atrapa y responde
  igual con un `RetrievalResult` válido, `found: false`, `statusCode: 200`
  — mismo patrón que `conversation-agent`.

## Security

Nunca se inventa ni se extrapola un dato bancario/de tasa que no esté en la
fuente (`src/data/catalog.ts` para el backend estático, la tabla DynamoDB
real `banking-agent-dev-product-catalog` -poblada desde ese mismo
`src/data/catalog.ts` vía `scripts/seed-catalog.ts`- para el backend real).
Cada `ProductCatalogEntry`/`FaqEntry`
retornado lleva su propio campo `source` (`"internal_catalog_v1"` para el
seed de este checkpoint) para trazabilidad explícita. El output de
retrieval-agent pasa siempre por verification-agent antes de llegar al
usuario si involucra datos específicos de cliente/cuenta (no aplica a FAQs
genéricas de catálogo, que no dependen de ningún dato del cliente) — ver
`.claude/agents/` para el rol de verification-agent (fase posterior, no
implementado acá).

## Limitaciones conocidas

- **Catálogo simulado, no un feed real de tasas.** Los valores de
  `src/data/catalog.ts` (tasas, montos, plazos) son placeholders razonables
  para una demo de flujo de crédito LATAM genérico — el "banco" detrás sigue
  siendo un mock (docs/PLAN.md). Nunca se generan ni ajustan en runtime.
- **Tabla DynamoDB creada por devops en Terraform; `DynamoDbCatalogRepository`
  sigue probado solo con el cliente de AWS SDK mockeado desde este servicio**
  (no hay una corrida de test de este repo contra AWS real, aunque el
  código y el schema ya están validados por el seed real vía
  `scripts/seed-catalog.ts`, que sí escribe contra la tabla real cuando
  devops lo invoca en `terraform apply`).
- **`Scan` para `listFaqs` en el backend DynamoDB** (ver sección de infra
  arriba) — aceptable para el tamaño/frecuencia de esta tabla, no es el
  patrón recomendado si el catálogo creciera significativamente o tuviera
  escrituras frecuentes.
- **Sin orquestador real conectando los tres Lambdas todavía.** Este
  servicio asume que quien lo invoca ya obtuvo `decision === "AUTO"` de
  `evaluatePreAction` (`@banking-agent/policy-agent`) para
  `product_info`/`faq`. Hoy esa garantía es un contrato **probado por test**
  (`test/pipeline-integration.test.ts`), no algo forzado en runtime por
  infraestructura (Step Functions u otro orquestador, pendiente de decidir
  per `docs/PLAN.md`). Si se invocara `handleRetrieval` fuera de ese
  contrato (bug de orquestación), no crashea ni inventa datos — responde
  `found:false` de forma explícita — pero sigue siendo responsabilidad del
  futuro orquestador no dejar pasar ese caso en producción.
- **Sin i18n-agent review formal todavía.** El contenido ES/PT de
  `src/data/catalog.ts` fue redactado a mano en ambos idiomas (no traducción
  automática literal), pero la validación formal de cobertura/calidad ES/PT
  (`docs/PLAN.md`, fase "Integración end-to-end + i18n") es una fase
  posterior, no corrida acá.
- **No conectado a API Gateway/Terraform.** El handler está listo para
  Lambda `nodejs20.x` (exporta `handler` desde `src/index.ts`), pero no se
  conectó a ninguna ruta real — mismo criterio que `conversation-agent`
  y `policy-agent` en checkpoints previos.

## Comandos

```bash
npm install                                              # raíz del monorepo
npm run build --workspace=@banking-agent/shared          # compila el contrato primero
npm run build --workspace=@banking-agent/policy-agent    # el test de integración importa su dist
npm run build --workspace=@banking-agent/retrieval-agent
npm test --workspace=@banking-agent/retrieval-agent

# Seeding de la tabla real (lo corre devops vía Terraform local-exec, ver
# sección "Seeding de la tabla" arriba):
CATALOG_TABLE_NAME=banking-agent-dev-product-catalog AWS_REGION=us-east-1 \
  npm run seed:catalog --workspace=@banking-agent/retrieval-agent
```

O, desde la raíz, `npm run build && npm test` corre todo el monorepo en el
orden correcto (`package.json` raíz ya encadena
shared -> policy-agent -> conversation-agent -> retrieval-agent).

Los tests de `getProduct`/`listFaqs` sobre `StaticCatalogRepository` y sobre
la lógica de negocio (`handleRetrieval`) no requieren AWS real. Los de
`DynamoDbCatalogRepository` mockean `@aws-sdk/lib-dynamodb`. El test de
integración (`test/pipeline-integration.test.ts`) carga `policies.yaml` real
e importa el paquete **compilado** `@banking-agent/policy-agent` (por eso
requiere `npm run build` previo de ese workspace, a diferencia de
`@banking-agent/shared`, que este servicio alía a su código fuente en
`vitest.config.ts` para tests más rápidos).
