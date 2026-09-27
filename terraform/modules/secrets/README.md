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
| `aws_ssm_parameter.bedrock_model_id` (`/{project}-{env}/bedrock/model_id`) | Inference profile de Amazon Bedrock que usan `conversation-agent`/`policy-agent` en runtime (fase "Habilitar Bedrock real", ver `terraform/modules/agent/README.md`). Valor real: `us.anthropic.claude-sonnet-4-6` — ver sección "Modelo Bedrock elegido" abajo. | No |
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
invocar vía un **inference profile** (confirmado con
`ListInferenceProfilesCommand`, `type: SYSTEM_DEFINED`, `status: ACTIVE`),
no el model ID directo. Aplica igual a toda la familia Sonnet reciente de
Anthropic en esta cuenta/región.

**Modelo real en uso: `us.anthropic.claude-sonnet-4-6`, NO Sonnet 5.**
Se eligió originalmente `claude-sonnet-5` por ser el más reciente de nivel
"Sonnet" (balance costo/latencia/capacidad, sin necesitar el extremo de
Opus ni de Haiku para este flujo) — pero esa familia específica de modelo
da `AccessDeniedException` en esta cuenta por una limitación de cuota, no
de IAM ni de "model access" general (el usuario confirmó tener "model
access" habilitado en la consola; Sonnet 5 simplemente no está disponible
para esta cuenta todavía). Se cambió a **Claude Sonnet 4.6**
(`us.anthropic.claude-sonnet-4-6`), verificado con una invocación real
exitosa (`ConverseCommand` → `{"message":{"role":"assistant","content":
[{"text":"Ok"}]}}`). Si en el futuro se habilita Sonnet 5 en esta cuenta,
alcanza con cambiar `bedrock_model_id` en `terraform.tfvars` y volver a
aplicar — ningún otro cambio de código depende del modelo específico.

### Bloqueador de model access — RESUELTO (con el modelo 4.6, no el 5)

Ya no bloquea el avance a la fase C/D (Lambdas invocando Bedrock). Detalle
completo de la investigación y la resolución en `docs/STATUS.md`, sección
"RESUELTO — acceso a Bedrock habilitado".

## Cómo se usa (RESUELTO en la fase "Habilitar Bedrock real")

- `conversation-agent`/`policy-agent` leen `bedrock_model_id`/`bedrock_region`
  en runtime vía `ssm:GetParameter` (SDK), usando los nombres de parámetro
  inyectados como variables de entorno `BEDROCK_MODEL_ID_PARAM_NAME`/
  `BEDROCK_REGION_PARAM_NAME` — no hardcodeado. IAM de mínimo privilegio
  scoped exactamente a los 2 ARNs de parámetro (no al path completo
  `/{project}-{env}/*`, aunque esa era la alternativa documentada
  originalmente aquí — se prefirió el scoping más estrecho posible). Ver
  `terraform/modules/agent/README.md`, sección "Bedrock IAM: decisión de
  diferir (RESUELTO...)", para el detalle completo (incluida la evidencia
  empírica real de por qué también hizo falta el ARN de foundation-model,
  no solo el de inference-profile).
- Si aparece un secreto real (ej. API key de un servicio externo), se
  reemplaza el valor de `var.third_party_api_credentials` vía `-var` o un
  `.tfvars` fuera de control de versiones — nunca committeado en texto plano.
- **IAM de `bedrock:InvokeModel`/`Converse` — ya NO diferido**: se agregó
  en la fase "Habilitar Bedrock real" a `conversation_agent`/`policy_agent`
  (los únicos 2 roles que lo necesitan), scoped al ARN del inference profile
  + los 3 ARNs de foundation-model verificados empíricamente. Ver
  `terraform/modules/agent/README.md` para el detalle completo (esta
  sección queda como referencia histórica de la decisión original de
  diferirlo, ya resuelta).

## Limitación conocida

Este checkpoint no diferencia secretos por ambiente más allá del prefijo de
naming (`project-environment`) — no hay rotación automática configurada
(`aws_secretsmanager_secret_rotation`). Aceptable para el scope de 10 días;
quedaría como trabajo pendiente para llevar esto a producción real (ver
categoría "Deployment work" en `docs/EVALUATION-CRITERIA.md`).
