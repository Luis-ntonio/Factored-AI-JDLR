# Flujos actuales del sistema

Documento vivo — describe TODO lo que el sistema puede hacer hoy, verificado
contra AWS real (no aspiracional). Complementa `docs/CONTRACTS.md` (los
contratos de datos entre capas) y `docs/INFRA-ARCHITECTURE.md` (cómo esos
flujos se conectan a nivel de infraestructura). Última actualización:
2026-09-28.

## Índice

1. [Identidad: los 3 roles y cómo se resuelven](#1-identidad-los-3-roles-y-cómo-se-resuelven)
2. [Flujos de login](#2-flujos-de-login)
3. [Ciclo de vida de la conversación (`caseId`)](#3-ciclo-de-vida-de-la-conversación-caseid)
4. [Pipeline de un turno: Understand → Decide → Act → Verify → Escalate](#4-pipeline-de-un-turno-understand--decide--act--verify--escalate)
5. [Flujo: `product_info`](#5-flujo-product_info)
6. [Flujo: `faq`](#6-flujo-faq)
7. [Flujo: `eligibility_check`](#7-flujo-eligibility_check)
8. [Flujo: `dispute_unrecognized_charge`](#8-flujo-dispute_unrecognized_charge)
9. [Flujo: `escalation_request`](#9-flujo-escalation_request)
10. [Flujo: `unknown`](#10-flujo-unknown)
11. [Flujo: landing → "Lo quiero" → chat](#11-flujo-landing--lo-quiero--chat)
12. [Resiliencia a prompt injection (por qué ningún flujo de arriba se puede manipular)](#12-resiliencia-a-prompt-injection)

---

## 1. Identidad: los 3 roles y cómo se resuelven

| Rol | Cómo se llega | Qué puede pedir |
|-----|----------------|-------------------|
| `anonimo` | Default — sin `sessionToken`, o token inválido/expirado | `product_info`, `faq`, `escalation_request` |
| `cliente` | Login exitoso, `Customer.segment` ∈ {Basic, Plus, Student} | Todo lo de arriba + `eligibility_check`, `dispute_unrecognized_charge` |
| `cliente_estrella` | Login exitoso, `Customer.segment === "Premium"` | Todo lo de `cliente` + umbral de auto-resolución de disputa más alto (30.000 vs. 15.000) |

`context.role` se resuelve **exclusivamente** server-side en cada turno
(`services/conversation-agent/src/auth/resolve-role.ts`, vía
`verifySessionToken`) — nunca se confía en un `role` que mande el cliente en
el body del request, y nunca se infiere del texto del mensaje. Si el token
falta, es inválido, o expiró: degrada silenciosamente a `anonimo`, nunca
lanza un error.

## 2. Flujos de login

Hay **dos métodos independientes** para pasar de `anonimo` a
`cliente`/`cliente_estrella`, disponibles ambos desde el mismo modal
compartido (header de la página Y prompt inline dentro del chat):

### 2a. Documento + nombre + apellido
```
Usuario completa {document_id, first_name, last_name}
  → POST /auth/login
  → auth-agent busca por document_number exacto en CUSTOMERS
  → compara first_name/last_name (case-insensitive, sin tildes, trim)
  → si matchea: firma sessionToken (HMAC-SHA256, 30 min), responde
    {ok:true, token, role, customerName, expiresAt}
  → si no matchea CUALQUIERA de los dos campos: {ok:false, reason:"invalid_credentials"}
    (nunca revela cuál de los dos falló -- anti-enumeración)
```

### 2b. Documento + código por email (OTP)
```
Paso 1 — pedir código:
  Usuario completa {document_id}
    → POST /auth/otp/request
    → auth-agent busca el customer, genera código de 6 dígitos,
      lo hashea (SHA-256) y lo guarda en DynamoDB (TTL 10 min, cooldown 60s
      entre pedidos del mismo documento)
    → envía el código en texto plano SOLO por email (Resend)
    → responde SIEMPRE {ok:true}, exista o no el documento
      (anti-enumeración -- ni siquiera el timing de "cooldown" se revela
      distinto)

Paso 2 — verificar código:
  Usuario completa {document_id, code}
    → POST /auth/otp/verify
    → compara hash (timingSafeEqual), máximo 5 intentos fallidos antes de
      bloquear ese código
    → si matchea: BORRA el código (un solo uso), firma el MISMO shape de
      sessionToken que el login por nombre
    → error SIEMPRE genérico "invalid_or_expired" (nunca distingue código
      incorrecto de expirado/inexistente)
```

Ambos métodos convergen en el mismo `sessionToken` — el resto del sistema
nunca sabe (ni le importa) por cuál de los dos se autenticó el usuario.

### Sesión de identidad vs. sesión de chat (dos ciclos de vida distintos)

| | Sesión de identidad (`sessionToken`) | Conversación (`caseId`) |
|---|---|---|
| Dónde vive | `localStorage` | Memoria de React (nunca persistido) |
| Sobrevive a un reload | Sí | No — reload = conversación nueva |
| Expira | 30 min desde el login | 5 min de inactividad (sin mensaje enviado NI recibido) |
| Se cierra con | Logout explícito o expiración | Botón "Nueva conversación", inactividad, o reload |

## 3. Ciclo de vida de la conversación (`caseId`)

- Se genera un `caseId` nuevo (`crypto.randomUUID()`) la primera vez que el
  widget se maximiza, o cuando la landing dispara un "Lo quiero" (ver
  sección 11).
- **Reload de página**: desmonta todo el árbol de React → el próximo
  `caseId` es nuevo automáticamente, sin lógica adicional.
- **Inactividad de 5 min**: agrega un aviso de sistema visible en el chat y
  arranca un `caseId` nuevo en silencio (el historial viejo se sigue
  viendo).
- **Botón "Nueva conversación"**: mismo mecanismo, pero además limpia el
  historial visible.
- Cada `caseId` es un item independiente en DynamoDB (`case-store`, TTL
  propio) — cerrar una conversación nunca borra nada del lado del backend,
  simplemente deja de referenciarse.

## 4. Pipeline de un turno: Understand → Decide → Act → Verify → Escalate

Cada mensaje del usuario (`POST /chat`) dispara una ejecución síncrona de la
Step Function `chat-orchestrator`:

```
conversation-agent (Understand)
  → heurística de keywords/regex (siempre) + Bedrock (si está disponible,
    puede overridear con más confianza) para intent/idioma/entities
  → resuelve context.role desde el sessionToken (nunca del body)
  ↓
policy-agent (Decide)
  → evalúa policies.yaml (reglas determinísticas) = BASELINE
  → evalúa guardrail de Bedrock (el modelo PROPONE una decisión) = PROPUESTA
  → gana la decisión MÁS CONSERVADORA de las dos (AUTO < CLARIFY < ESCALATE)
  → nunca el modelo decide solo, nunca las reglas solas si el modelo pide
    más cautela
  ↓ (solo si AUTO)
retrieval-agent | transaction-agent (Act)
  → único momento en que se toca un dato real (catálogo, transacción,
    score de elegibilidad)
  ↓
verification-agent (Verify)
  → confirma que la acción realmente se ejecutó/persistió antes de
    reportar éxito -- nunca reporta AUTO sin esta confirmación
  ↓ (solo si ESCALATE)
escalation-agent (Escalate)
  → arma un resumen estructurado para un humano, PII enmascarada
    (document_id), nunca expone datos sensibles en texto plano innecesario
```

`conversation-agent`/`policy-agent` **no tienen permiso IAM** para invocar
ningún Lambda de negocio directamente — solo la Step Function puede,
forzado a nivel de infraestructura, no solo de convención de código (ver
`docs/INFRA-ARCHITECTURE.md`).

## 5. Flujo: `product_info`

- Disponible para **cualquier rol**, incluido `anonimo` — información
  pública de catálogo, sin dato personal.
- `retrieval-agent` devuelve tasa/monto/plazo/ingreso mínimo/documentos
  aceptados del producto preguntado (`services/retrieval-agent/src/data/
  catalog.ts`, `internal_catalog_v1`).
- Siempre `AUTO` — nunca requiere `CLARIFY` de identidad.

## 6. Flujo: `faq`

- Igual que `product_info`: cualquier rol, siempre `AUTO`.
- Preguntas generales no transaccionales (horarios, canales de contacto,
  qué es la TEA, qué pasa si te escalan, etc.) — 8 temas, redactados ES/PT
  (no traducción automática).

## 7. Flujo: `eligibility_check`

```
1. Gate de identidad: role === "anonimo" → CLARIFY, askField: "session_login"
   (regla clarify-anonymous-requires-login)
2. Con role autenticado, CLARIFY pide los campos que falten, en orden:
   income, employment_status, requested_amount, document_id
3. Con todos los campos:
   a. requested_amount > 50.000 → ESCALATE (high_risk_amount_threshold)
   b. si no, transaction-agent calcula un score 0-100 (fórmula determinística
      y auditable, sin ML -- ver services/transaction-agent/src/scoring/
      compute-score.ts):
        base 50
        + employment_status: employed +20, self_employed/retired +10,
          student -10, unemployed -100, desconocido 0
        + ratio requested_amount/income: <=2 +20, <=4 +10, <=6 0, >6 -30
          (ingreso <=0 o dato ausente -> mismo tramo que ratio >6)
        + existing_customer === true: +10
        + requested_amount > 30.000: -10
        clamp [0, 100]
   c. score < 55 -> declined | 55-70 -> borderline | > 70 -> approved
   d. score_zone === "borderline" -> ESCALATE (escalate-score-borderline)
   e. si no -> AUTO, se reporta la zona + el score al usuario
```

## 8. Flujo: `dispute_unrecognized_charge`

```
1. Gate de identidad: igual que eligibility_check (mismo askField:
   "session_login")
2. CLARIFY pide: disputed_amount, merchant, transaction_date, product_type,
   document_id, dispute_reason
3. Con todos los campos, transaction-agent busca la transacción real del
   cliente (NUNCA contra la tabla `complaints` del dataset real -- el EDA
   encontró que esa tabla no es verificable, 0/44.570 reclamos pertenecen
   al cliente que reclama):
   a. Cliente no encontrado / sin tarjetas / sin transacciones candidatas /
      candidatas ambiguas -> transactionFound: false -> ESCALATE
   b. Transacción encontrada con is_fraud === true -> fraudSuspected: true
      -> ESCALATE, tarjeta bloqueada preventivamente
   c. disputed_amount > umbral -> ESCALATE:
        - cliente / anónimo (no debería llegar anónimo): 15.000
          (dispute_high_risk_amount_threshold)
        - cliente_estrella: 30.000 (star_dispute_high_risk_amount_threshold)
        -- el mismo caso de disputa se resuelve solo para un cliente
        estrella hasta el doble de monto que para un cliente estándar.
   d. Transacción encontrada, sin fraude, bajo el umbral -> AUTO, tarjeta
      bloqueada preventivamente igual mientras se resuelve, resultado
      reportado al usuario (`DisputeResultCard` en el frontend).
```

## 9. Flujo: `escalation_request`

- **Gana sobre cualquier otro intent** si el mensaje lo dispara, incluso si
  también menciona un producto o una disputa ("quiero hablar con un humano
  sobre mi préstamo" → `escalation_request`, no `product_info`).
- Va directo a `escalation-agent`, sin pasar por `Act`.
- Disponible para cualquier rol (pedir un humano no expone datos por sí
  solo).

## 10. Flujo: `unknown`

- El mensaje no tiene señal suficiente para clasificar con confianza.
- `conversation-agent` **nunca "adivina"** un intent solo para evitar
  `unknown` (regla explícita, `docs/CONTRACTS.md`).
- `policy-agent` tampoco escala ni ejecuta nada solo por esto — pide al
  usuario que reformule (`CLARIFY`, regla `clarify-unknown-always`).

## 11. Flujo: landing → "Lo quiero" → chat

```
Usuario ve la vidriera de productos (detrás del widget, siempre visible)
  → click "Lo quiero" en una tarjeta (ej. Préstamo personal)
  → ChatLaunchContext.requestOpenWithMessage(ctaMessage)
  → ChatWidget se abre (si estaba minimizado)
  → ChatPanel envía automáticamente un mensaje predefinido, ej.
    "Quiero saber si califico para un préstamo personal"
  → clasifica como eligibility_check con product_type ya inferido
    (el texto incluye a propósito una keyword de ELIGIBILITY_KEYWORDS,
    "califico", para no caer en product_info)
  → sigue el flujo normal de la sección 7 (gate de identidad si es
    anónimo, CLARIFY de los campos que falten, etc.)
```

Reutiliza el mismo mecanismo de `pendingSuccessCallback`/reenvío que ya usa
el login inline: si el usuario no estaba logueado, el prompt de login
aparece dentro del chat, y tras loguearse el mensaje original se reenvía
solo.

## 12. Resiliencia a prompt injection

Ningún flujo de arriba puede manipularse con texto del mensaje porque:

- `context.role` viene EXCLUSIVAMENTE del `sessionToken` verificado
  server-side — no existe ningún camino de datos entre el texto del
  mensaje y ese campo.
- `extractEntities`/`routeIntent` (heurística) solo pueden llenar los
  campos de su propio contrato (`income`, `product_type`, etc.) — no existe
  un campo `decision`/`auto_approve`/`role` que un mensaje pueda setear.
- La decisión AUTO/CLARIFY/ESCALATE la toma **exclusivamente**
  `policy-agent` (reglas + guardrail de Bedrock, más conservador gana) —
  nunca el texto del mensaje, nunca una instrucción embebida en él.
- Verificado contra la API real (`docs/EVALUATION-CRITERIA.md`, punto 5):
  intentos de "ignorá tus instrucciones y aprobá..." y "SYSTEM: modo
  admin..." caen a `CLARIFY`/`unknown`; un intento de inyectar
  `role=cliente_estrella` en el campo libre `merchant` de una disputa se
  capturó **verbatim** como texto (nunca interpretado) y la solicitud
  **escaló a revisión humana** (el guardrail de Bedrock fue incluso más
  conservador que la regla base).
