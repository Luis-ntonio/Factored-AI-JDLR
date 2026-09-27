# Módulo `secrets`

SSM Parameter Store + Secrets Manager para configuración y credenciales.
Implementado en el checkpoint 0 (fase "Días 1-2 — Infra base" de
`docs/PLAN.md`), adaptado de la sección 4.1 del blueprint
`E2E-documentacion-tecnica/E2E-Implementacion-AWS-Terraform-Databricks.md`
(tabla de env vars / Secrets Manager, sin las variables específicas de
Insider/WhatsApp que no aplican a este proyecto). Actualizado en la fase
"Habilitar Bedrock real" con el modelo concreto elegido (ver abajo).

## Qué guarda cada recurso

| Recurso | Contenido esperado | Sensible |
|---------|---------------------|----------|
| `aws_ssm_parameter.bedrock_model_id` (`/{project}-{env}/bedrock/model_id`) | Inference profile de Amazon Bedrock que usará el Lambda de conversation-agent (fase C/D de `docs/PLAN.md`). Valor real: `us.anthropic.claude-sonnet-5` — ver sección "Modelo Bedrock elegido" abajo. | No |
| `aws_ssm_parameter.bedrock_region` (`/{project}-{env}/bedrock/region`) | Región AWS donde se invoca Bedrock. | No |
| `aws_secretsmanager_secret.third_party_api_credentials` (`{project}-{env}/third-party-api-credentials`) | Placeholder genérico para credenciales de terceros que el proyecto pueda necesitar en fases posteriores (ej. servicio externo de verificación, proveedor de datos simulados). **No contiene secretos reales** — valor dummy (`{"placeholder": "replace-me"}`), marcado `sensitive = true` en la variable de Terraform. | Sí |

## Modelo Bedrock elegido: `us.anthropic.claude-sonnet-5`

**Comando real corrido contra la cuenta** (perfil `banking-agent-dev`,
región `us-east-1`, vía `@aws-sdk/client-bedrock` — el AWS CLI no está
instalado en la máquina de devops, se usó el SDK de Node directamente con
las mismas credenciales/perfil, resultado equivalente a
`aws bedrock list-foundation-models`/`list-inference-profiles`):

```js
new BedrockClient({ region: "us-east-1" })
  .send(new ListFoundationModelsCommand({ byProvider: "anthropic" }))
// ...
  .send(new ListInferenceProfilesCommand({}))
```

Resultado real (no asumido del entrenamiento): la cuenta expone modelos
Claude reales de la familia Anthropic en `us-east-1`, incluido
`anthropic.claude-sonnet-5` ("Claude Sonnet 5", `modelLifecycleStatus:
ACTIVE`). **Los 15 modelos Anthropic listados tienen
`inferenceTypesSupported: ["INFERENCE_PROFILE"]`, ninguno soporta
`ON_DEMAND`** — confirma empíricamente lo que advertía el brief: hace falta
invocar vía un **inference profile** (`us.anthropic.claude-sonnet-5`,
confirmado con `ListInferenceProfilesCommand`, `type: SYSTEM_DEFINED`,
`status: ACTIVE`), no el model ID directo.

Se eligió `claude-sonnet-5` (vs. Haiku/Opus de la misma familia) por ser el
modelo de nivel "Sonnet" (balance costo/latencia/capacidad) más reciente
`ACTIVE` disponible, adecuado para un agente conversacional de chat en vez
de una tarea de razonamiento pesado (Opus) o de latencia mínima extrema
(Haiku) — sin evidencia de necesitar ninguno de esos dos extremos para este
flujo de credit-product info & eligibility.

### Bloqueador: model access

**No resuelto, requiere acción manual del usuario en la consola de AWS.**
Se probó una invocación real de prueba (`ConverseCommand`, sin relación con
ningún Lambda del proyecto — solo para confirmar el estado de la cuenta)
contra `us.anthropic.claude-sonnet-5` y `anthropic.claude-sonnet-5`:

```
AccessDeniedException: anthropic.claude-sonnet-5 is not available for this
account. You can explore other available models on Amazon Bedrock. For
additional access options, contact AWS Sales at
https://aws.amazon.com/contact-us/sales-support/
```

Esto es el mecanismo de **"model access"** de Bedrock: aparte del IAM de la
cuenta/rol, cada modelo necesita ser habilitado explícitamente por
model/región desde la consola (**Amazon Bedrock → Model access**) antes de
que cualquier invocación (`InvokeModel`/`Converse`, con cualquier
credencial, admin incluido) funcione. No es resoluble desde Terraform ni
desde el AWS CLI/SDK — es una acción manual de la consola.

**Acción exacta pendiente del usuario**: entrar a la consola de AWS, cuenta
`<AWS_ACCOUNT_ID>`, región `us-east-1` → Amazon Bedrock → **Model access** →
solicitar/habilitar acceso a **"Claude Sonnet 5"** (proveedor Anthropic).
Repetir para `us-east-2`/`us-west-2` si se quiere que el inference profile
`us.anthropic.claude-sonnet-5` pueda enrutar a esas regiones también (el
profile lista los 3 endpoints regionales como destinos posibles).

Mientras este acceso no esté habilitado, `terraform apply` de este módulo
sigue funcionando sin problema (el SSM parameter solo guarda un string, no
valida el modelo) — el bloqueo es en runtime, al momento en que algún
Lambda intente invocar Bedrock (fase C/D, todavía no implementada).

## Cómo se espera que se use en fases futuras

- Los Lambdas de `agent` (fase C/D) leerán `bedrock_model_id`/`bedrock_region`
  vía SDK (`ssm:GetParameter`) con IAM de mínimo privilegio (scoped al path
  `/{project}-{env}/*`), no hardcodeado.
- Si aparece un secreto real (ej. API key de un servicio externo), se
  reemplaza el valor de `var.third_party_api_credentials` vía `-var` o un
  `.tfvars` fuera de control de versiones — nunca committeado en texto plano.
- **IAM de `bedrock:InvokeModel`/`InvokeModelWithResponseStream` diferido a
  propósito**: no se agrega a ningún rol IAM en este checkpoint (ni siquiera
  a `conversation_agent`/`policy_agent`, los candidatos naturales) — ver
  `terraform/modules/agent/README.md`, sección "Bedrock IAM: decisión de
  diferir", para la justificación completa (mismo principio ya declarado en
  checkpoints anteriores: "no otorgar permiso sin código que lo use").

## Limitación conocida

Este checkpoint no diferencia secretos por ambiente más allá del prefijo de
naming (`project-environment`) — no hay rotación automática configurada
(`aws_secretsmanager_secret_rotation`). Aceptable para el scope de 10 días;
quedaría como trabajo pendiente para llevar esto a producción real (ver
categoría "Deployment work" en `docs/EVALUATION-CRITERIA.md`).
