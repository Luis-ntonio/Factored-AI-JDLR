# CONTRACTS.md — contrato de salida de la capa Understand

> Este documento es la explicación legible por humanos. La **fuente de
> verdad canónica** (la que manda si hay discrepancia) es el código en
> `packages/shared/src/contracts/understand-output.ts`. No dupliques tipos
> acá — si algo cambia, cambia primero el código y después este `.md` en el
> mismo commit.

## 1. Quién produce esto y quién lo consume

- **Productor:** `services/conversation-agent` (capa "Understand" del
  pipeline, agente `conversation-agent` en `.claude/agents/`). Corre como
  handler de Lambda para la ruta `POST /chat` que devops ya dejó preparada
  en `terraform/modules/edge` (sin conectar todavía).
- **Consumidores:**
  - `policy-agent` — lee `intent`, `entities`, `missing_fields` para decidir
    AUTO/CLARIFY/ESCALATE en `policies.yaml`. **Los nombres de campos de
    `entities` y los valores posibles de `missing_fields` deben coincidir
    literalmente con los definidos acá** — si policy-agent referencia un
    nombre distinto, el pipeline se rompe en silencio (TypeScript no lo va a
    atrapar si policy-agent vive en otro runtime/YAML).
  - `retrieval-agent` / `transaction-agent` (fases posteriores) — leen
    `entities` y `context` para ejecutar la acción ya autorizada.
  - Observabilidad / reviewer — leen `context.degraded` /
    `context.degradedReason` para detectar turnos con memoria de sesión
    perdida.

## 2. Por qué vive en `packages/shared`

Se eligió `packages/shared/contracts/` (código TypeScript real, no solo
prosa) en vez de solo documentar el contrato en Markdown porque:

1. Si conversation-agent y policy-agent terminan corriendo en el mismo
   Lambda/proceso Node.js (opción que devops.md deja abierta para el inicio
   del proyecto, "pueden ser un solo Lambda al inicio"), policy-agent puede
   `import` este paquete directamente y obtener autocompletado + errores de
   compilación si referencia un campo que no existe — mucho más difícil de
   romper por accidente que copiar/pegar nombres en un YAML.
2. Es un monorepo con npm workspaces (`package.json` raíz), así que
   compartir un paquete interno no tiene costo de infraestructura extra.
3. `frontend-dev` (`apps/web`, fase posterior) también necesita esta forma
   exacta para renderizar el estado de escalación/idioma — un solo lugar
   para los tres consumidores.

Si policy-agent termina implementado en otro runtime (ej. Python puro para
las reglas de `policies.yaml` sin ejecutar Node), no podrá `import` este
paquete directamente. En ese caso, este mismo archivo TypeScript sigue
siendo la fuente de verdad de la FORMA del contrato, y policy-agent debe
mantener su propio JSON Schema/Pydantic model **espejo**, coordinado
manualmente contra este documento hasta que se automatice una exportación
(ej. `ts-json-schema-generator`) — **pendiente, no implementado en este
checkpoint**, ver sección 7 (Limitaciones).

## 3. Runtime elegido para conversation-agent

**Node.js 20.x + TypeScript**, compilado a CommonJS, sin dependencias de
NLP/LLM externas para el router (ver sección 6). Razones:

- El SDK de AWS para JavaScript v3 (`@aws-sdk/client-dynamodb`,
  `@aws-sdk/lib-dynamodb`) tiene cold start más liviano que boto3 en Lambda
  para este tipo de handler HTTP simple.
- Permite compartir tipos literalmente (`packages/shared`) con
  `apps/web` (frontend, que ya es TypeScript/JS por naturaleza) sin
  serialización intermedia.
- Es la opción por defecto razonable dado que no hay una decisión previa de
  runtime en el proyecto (`.claude/agents/conversation-agent.md` no la fija).

**Coordinación pendiente con policy-agent:** si policy-agent se implementa
en el mismo Lambda (recomendado por devops.md para el scope de 10 días),
debe ser también Node.js/TypeScript e importar `@banking-agent/shared`
directamente. Si policy-agent prefiere Python (ej. para aprovechar alguna
librería de reglas), la integración pasa a ser por el JSON del
`UnderstandOutput` sobre la red/cola (ya es JSON-serializable, no hay tipos
opacos), pero pierde la garantía de compilación cruzada — decisión a
confirmar con policy-agent, no forzada acá.

## 4. El contrato exacto

```ts
interface UnderstandOutput {
  intent: Intent;
  language: LanguageCode;
  entities: Entities;
  missing_fields: EntityKey[];
  context: UnderstandContext;
}
```

### 4.1 `intent: Intent`

Enum de string, uno de:

| Valor | Significado |
|---|---|
| `"product_info"` | Preguntas sobre catálogo/condiciones de productos de crédito (tasas, requisitos, plazos), sin pedir veredicto de elegibilidad propio. |
| `"eligibility_check"` | El usuario quiere saber si califica para un producto. |
| `"faq"` | Preguntas generales no transaccionales (horarios, canales, definiciones). |
| `"escalation_request"` | Pedido explícito de hablar con un humano — **gana** sobre cualquier otra señal en el mismo mensaje. |
| `"unknown"` | Sin señal suficiente para clasificar. Debe forzar CLARIFY en policy-agent — conversation-agent nunca "adivina" un intent solo para evitar `unknown`. |

### 4.2 `language: LanguageCode`

`"es" | "pt"`. Se calcula **por mensaje individual**, nunca se asume fijo
para toda la sesión (ver `context-manager.ts`: `detectLanguage` corre en
cada turno sobre el mensaje actual, independientemente del idioma de turnos
anteriores).

### 4.3 `entities: Entities`

Slots acumulados a lo largo de la conversación (fusionados por el context
manager con lo ya guardado en DynamoDB — ver sección 5). `null` = "no
provisto todavía en ningún turno de este `caseId`".

| Campo | Tipo | Ejemplo | Notas |
|---|---|---|---|
| `income` | `number \| null` | `2500` | Ingreso mensual declarado. **No se resuelve moneda/país** — limitación documentada abajo. |
| `employment_status` | `"employed" \| "self_employed" \| "unemployed" \| "retired" \| "student" \| "unknown" \| null` | `"employed"` | |
| `requested_amount` | `number \| null` | `10000` | Monto de crédito solicitado, misma limitación de moneda que `income`. |
| `document_id` | `string \| null` | `"12345678"` | Valor crudo del documento, PII. Se persiste en DynamoDB (tabla ya cifrada at-rest por AWS, sin cifrado adicional a nivel de aplicación en este checkpoint) pero **nunca se loguea en texto plano** (los logs usan un valor enmascarado). |
| `document_type` | `"DNI" \| "CC" \| "CPF" \| "RG" \| "passport" \| "other" \| "unknown" \| null` | `"DNI"` | Inferido junto con `document_id` por patrón/idioma. Ver limitación de cobertura de formatos LATAM. |
| `product_type` | `"personal_loan" \| "credit_card" \| "auto_loan" \| "mortgage" \| "unknown" \| null` | `"personal_loan"` | |
| `existing_customer` | `boolean \| null` | `true` | `true`/`false` solo si el usuario lo indicó explícitamente; `null` si no se mencionó (no asumir `false` por defecto). |

### 4.4 `missing_fields: EntityKey[]`

Subconjunto de las keys de `Entities` (mismo nombre exacto de campo) que
**sigue faltando para la intención actual**, calculado contra la matriz
`REQUIRED_ENTITIES_BY_INTENT` (también exportada desde
`packages/shared`, ver el código para la matriz completa):

- `product_info` requiere: `product_type`
- `eligibility_check` requiere: `product_type`, `income`,
  `employment_status`, `requested_amount`, `document_id`,
  `existing_customer`
- `faq`, `escalation_request`, `unknown` requieren: (ninguno)

policy-agent puede exigir campos ADICIONALES más estrictos en
`policies.yaml` (ej. `document_type` además de `document_id` antes de
autorizar AUTO) — esta matriz es el mínimo que conversation-agent garantiza
calcular de forma consistente con su propio estado, no el techo de reglas
de negocio de policy-agent.

### 4.5 `context: UnderstandContext`

| Campo | Tipo | Notas |
|---|---|---|
| `caseId` | `string` | Igual al `caseId` de `pk = CASE#<caseId>`. |
| `customerId` | `string \| null` | Igual al `customerId` de `gsi1pk = CUSTOMER#<customerId>`; `null` si aún no identificado. |
| `turnId` | `string` | `messageId` de este turno (`sk = MSG#<messageId>`). |
| `degraded` | `boolean` | `true` si este turno se procesó sin poder leer y/o escribir el estado persistido (ver sección 6). |
| `degradedReason` | `"dynamodb_read_failed" \| "dynamodb_write_failed" \| "internal_error" \| "none"` | Motivo. `"internal_error"` cubre excepciones no relacionadas a DynamoDB (ej. body malformado) — el handler igual responde 200 con un output válido, nunca un 5xx. |
| `historyTurns` | `number` | Cantidad de turnos previos considerados al reconstruir el estado (0 si es un caso nuevo o si la lectura falló). |

## 5. Ejemplos completos

### 5.1 Español — `eligibility_check`, faltan casi todos los datos

Mensaje: *"Hola, quiero saber si califico para una tarjeta de crédito"*

```json
{
  "intent": "eligibility_check",
  "language": "es",
  "entities": {
    "income": null,
    "employment_status": null,
    "requested_amount": null,
    "document_id": null,
    "document_type": null,
    "product_type": "credit_card",
    "existing_customer": null
  },
  "missing_fields": ["income", "employment_status", "requested_amount", "document_id", "existing_customer"],
  "context": {
    "caseId": "5b6f...",
    "customerId": null,
    "turnId": "a1b2...",
    "degraded": false,
    "degradedReason": "none",
    "historyTurns": 0
  }
}
```

### 5.2 Portugués — mismo caso, dos turnos después, ya sin faltantes

Turno 3, mensaje: *"Meu documento é 123.456.789-00"* (los otros datos ya
fueron dados en turnos anteriores y están en DynamoDB).

```json
{
  "intent": "eligibility_check",
  "language": "pt",
  "entities": {
    "income": 3000,
    "employment_status": "employed",
    "requested_amount": 8000,
    "document_id": "12345678900",
    "document_type": "CPF",
    "product_type": "credit_card",
    "existing_customer": true
  },
  "missing_fields": [],
  "context": {
    "caseId": "5b6f...",
    "customerId": "cust-42",
    "turnId": "c3d4...",
    "degraded": false,
    "degradedReason": "none",
    "historyTurns": 2
  }
}
```

### 5.3 Español — turno degradado (DynamoDB no respondió)

```json
{
  "intent": "product_info",
  "language": "es",
  "entities": {
    "income": null,
    "employment_status": null,
    "requested_amount": null,
    "document_id": null,
    "document_type": null,
    "product_type": "personal_loan",
    "existing_customer": null
  },
  "missing_fields": [],
  "context": {
    "caseId": "5b6f...",
    "customerId": null,
    "turnId": "e5f6...",
    "degraded": true,
    "degradedReason": "dynamodb_read_failed",
    "historyTurns": 0
  }
}
```

Nota: en este ejemplo el usuario podría haber dado su `income` en un turno
anterior — como la lectura falló, este turno no lo sabe. Es el trade-off
documentado del fallback (ver sección 6): se prefiere volver a preguntar en
vez de inventar o crashear.

## 6. Reliability — fallback ante fallo de DynamoDB

Implementado en `services/conversation-agent/src/context/state-store.ts` y
`context-manager.ts`.

- **Reintentos acotados:** 2 reintentos por defecto (3 intentos totales) con
  backoff exponencial corto (~75ms, ~150ms) — nunca reintento infinito.
  Configurable vía `ConversationStateStore({ maxRetries, baseDelayMs })`.
- **Lectura falla tras agotar reintentos:** se degrada a "sin memoria de
  sesión" — el context manager usa `entities` vacíos como base (en vez de
  inventar valores) y procesa el turno solo con lo que puede extraer del
  mensaje actual. `context.degraded = true`,
  `context.degradedReason = "dynamodb_read_failed"`.
- **Escritura falla tras agotar reintentos:** el turno igual se responde al
  usuario (no se pierde el turno ni se lanza 5xx) — solo que el próximo
  turno no tendrá memoria de este si también falla la lectura futura.
  `context.degraded = true`, `context.degradedReason = "dynamodb_write_failed"`.
- **Excepción inesperada no relacionada a DynamoDB** (body inválido, bug no
  previsto): el handler (`src/index.ts`) atrapa cualquier excepción y
  devuelve igual un `UnderstandOutput` válido con `intent: "unknown"` y
  `context.degradedReason = "internal_error"`, con `statusCode: 200` —
  nunca deja al frontend sin respuesta estructurada.
- **Garantía de "no repreguntar":** cuando la lectura SÍ funciona, el merge
  de entities (`mergeEntities` en `context-manager.ts`) nunca descarta un
  valor ya guardado exitosamente — un valor nuevo `null` jamás sobreescribe
  uno existente no nulo.

## 7. Modelo de estado en DynamoDB (claves exactas)

Tabla real: `banking-agent-dev-case-store` (`terraform/modules/data`).
Esquema base de la tabla (`pk`, `sk`, GSI `by-customer`, `ttl`) ya definido
por devops — ver `terraform/modules/data/README.md`. conversation-agent usa
ese mismo schema con DOS tipos de item por `caseId`:

| Item | `pk` | `sk` | `gsi1pk` | Propósito |
|---|---|---|---|---|
| Mensaje | `CASE#<caseId>` | `MSG#<messageId>` | `CUSTOMER#<customerId>` (si se conoce) | Log append-only, un item por turno de usuario (texto, intent, language, timestamp). Nunca se sobreescribe. |
| Estado de conversación | `CASE#<caseId>` | `STATE#latest` | `CUSTOMER#<customerId>` (si se conoce) | Equivalente a `e_ai_agent_conversation_state` del blueprint (sección 4.5 de `E2E-Implementacion-AWS-Terraform-Databricks.md`). **Un solo item, upserted en cada turno** — no un item de estado por turno. |

**Por qué `STATE#latest` fijo y no `STATE#<timestamp>`:** para que la
lectura de contexto sea un `GetItem` por clave exacta (O(1), latencia
predecible) en vez de un `Query` sobre toda la partición reconstruyendo
slots desde el historial completo de mensajes en cada turno. El log de
mensajes (`MSG#`) sigue existiendo completo para auditoría/debug, pero no es
la fuente que se lee en el hot path de cada turno.

**TTL:** ambos tipos de item escriben `ttl = now + 30 días` — **placeholder
explícito, a confirmar con policy-agent/devops** cuando se defina la
política de retención real (el módulo `data` de Terraform solo habilita el
mecanismo, no fija el valor — ver su README). El valor vive centralizado en
`DEFAULT_TTL_DAYS` en `state-store.ts`.

## 8. Limitaciones conocidas de esta pieza (Understand)

- **Idioma:** heurística de keywords/diacríticos, sin modelo de NLP. Puede
  fallar en mensajes muy cortos, jerga regional no cubierta, o mensajes que
  mezclan ambos idiomas en la misma oración (no evaluado). Cobertura
  probada: castellano LATAM genérico y portugués BR genérico, sin variantes
  específicas por país.
- **Moneda/país no resueltos:** `income` y `requested_amount` son números
  crudos sin unidad — no se infiere moneda (soles, reales, pesos, USD) ni
  país. policy-agent debe decidir cómo tratar esto (ej. asumir una moneda
  única para la demo, o pedir la moneda explícitamente como parte de
  `product_type`/flujo).
- **Cobertura de documentos de identidad:** el extractor reconoce CPF (11
  dígitos) y un patrón de 8 dígitos etiquetado `DNI` (referencia Perú) o
  `other` si va precedido de una etiqueta genérica ("documento", "cédula",
  "cc"). No cubre todos los formatos LATAM (ej. cédula colombiana de 6-10
  dígitos es ambigua con DNI y puede clasificarse mal).
- **Extracción de entities es determinística por regex/keywords, no LLM:**
  deliberado para el scope de 10 días (sin costo/latencia de invocar un
  modelo solo para slot-filling) — más frágil ante fraseo no anticipado que
  un extractor basado en LLM. Si se integra Bedrock en fases posteriores
  (pendiente de decidir según `docs/PLAN.md`), este extractor debería
  reemplazarse o usarse como fallback rápido.
- **`isUnderstandOutput` es un type guard mínimo**, no un JSON Schema
  formal ni una validación exhaustiva (ej. no valida rangos de `income`,
  formato exacto de `document_id` por `document_type`). Suficiente para este
  checkpoint, no para producción con contratos cross-team estrictos.
- **Sin autenticación en el request:** este código no valida quién llama a
  `POST /chat` (responsabilidad de devops en el API Gateway, documentada
  como pendiente en `terraform/README.md`). `customerId` viene del body sin
  verificar contra ninguna sesión autenticada — no usar así en producción.
- **Orden de build en el monorepo:** `packages/shared` debe compilarse
  antes que `services/conversation-agent` (`npm run build` en la raíz ya lo
  hace en ese orden explícito); no hay todavía un bundler/empaquetado para
  el deploy real a Lambda (eso es trabajo de devops al conectar el Lambda).
- **No hay un JSON Schema/Pydantic espejo para consumidores no-Node**
  todavía (ver sección 2) — si policy-agent termina en otro runtime, hace
  falta generarlo o mantenerlo a mano.

## 9. Cómo correr esto localmente

```bash
npm install                      # raíz del monorepo, instala todos los workspaces
npm run build                    # compila packages/shared y luego conversation-agent
npm test                         # corre vitest en todos los workspaces (sin credenciales AWS)
```

Los tests de `services/conversation-agent` mockean el cliente de DynamoDB
(`@aws-sdk/lib-dynamodb`) — no requieren AWS real ni variables de entorno.

## 10. Contratos de fases posteriores (Verify / Escalate)

Mismo criterio que el resto de este documento: el código TypeScript en
`packages/shared/src/contracts/` es la fuente de verdad, esta sección es
solo un puntero de navegación.

- `VerificationResult` (`packages/shared/src/contracts/verification-result.ts`)
  — contrato de salida de `services/verification-agent`. Ver el docstring de
  ese archivo para el detalle completo (productor/consumidores, regla de
  nunca-verificado-por-default).
- `EscalationSummary` (`packages/shared/src/contracts/escalation-summary.ts`)
  — contrato de salida de `services/escalation-agent`. Ver el docstring de
  ese archivo para el detalle completo, en particular la regla de
  enmascarado de `document_id` (nunca crudo, ver también `policies.yaml`
  sección `security`, regla `sec-masked-identifier-for-escalation`).

Ninguno de los dos contratos reemplaza `UnderstandOutput` como fuente de
`entities`/`intent` — ambos lo consumen como input (`VerificationResult` de
forma indirecta a través del resultado ya producido por retrieval-agent/
transaction-agent; `EscalationSummary` directamente, recibe el
`UnderstandOutput` completo del turno que se está escalando).

