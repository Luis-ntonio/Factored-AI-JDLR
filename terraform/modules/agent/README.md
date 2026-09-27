# Módulo `agent`

Los 6 Lambdas de lógica de negocio del pipeline Understand→Decide→Act→Verify→Escalate
(conversation-agent, policy-agent, retrieval-agent, transaction-agent,
verification-agent, escalation-agent), más su IAM de mínimo privilegio.
Los primeros 4 se implementaron en la fase de conexión del pipeline
end-to-end sobre AWS real (gap 2/3 del checkpoint, ver `docs/STATUS.md`);
verification-agent/escalation-agent se agregaron en la fase "Días 5-6 —
Verify + Escalate" (`docs/PLAN.md`). En la fase "Habilitar Bedrock real"
(ver sección "Bedrock IAM" más abajo) se agregó el IAM real de
`bedrock:InvokeModel`/`Converse` y `ssm:GetParameter` a
`conversation_agent`/`policy_agent`, y se ajustó el empaquetado (ver
"Empaquetado" más abajo) para que esos dos servicios bundleen
`@aws-sdk/client-bedrock-runtime`/`@aws-sdk/client-ssm` en vez de tratarlos
como `external`.

No implementa lógica de negocio -- solo empaqueta y despliega el código ya
escrito y testeado en `services/*`.

## Empaquetado: esbuild, no zip de `dist/`+`node_modules`

`@banking-agent/shared` es una dependencia de npm workspaces resuelta como
symlink en `node_modules/`, no un paquete publicado. Zippear `dist/` +
`node_modules/` tal cual arriesga un Lambda que falla en runtime con
`Cannot find module '@banking-agent/shared'` (symlink roto fuera del
contexto del monorepo) o un zip inflado con dependencias transitivas de todo
el workspace.

Se eligió bundlear cada Lambda con **esbuild** a un único archivo CJS
(`terraform/scripts/package-lambdas.js`, entry point el `.ts` de cada
servicio directamente -- esbuild transpila TS sin type-check; el type-check
real ya lo hace `npm run build`/`tsc` como parte del pipeline de CI antes de
este paso). Esto resuelve el problema de symlinks de raíz: esbuild inlinea
todo el grafo de módulos resuelto en disco, symlinks incluidos, sin depender
de que `node_modules/@banking-agent/shared` exista como symlink válido
dentro del zip desplegado.

### `external` de `@aws-sdk/*`: NO es uniforme en los 6 servicios (fase "Habilitar Bedrock real")

El runtime Node.js 20.x de Lambda trae preinstalados los paquetes "core" del
SDK v3 (`@aws-sdk/client-dynamodb`/`@aws-sdk/lib-dynamodb` entre ellos, ya
verificado funcionando en producción) -- marcarlos `external` ahorra tamaño
de zip sin riesgo. **No hay garantía equivalente de que esa capa
administrada incluya `@aws-sdk/client-bedrock-runtime` ni
`@aws-sdk/client-ssm`** (paquetes que `conversation-agent`/`policy-agent`
empezaron a usar en esta fase para invocar Bedrock y leer su config desde
SSM Parameter Store) -- marcarlos `external` sin esa garantía arriesga un
Lambda que falla en runtime con `Cannot find module
'@aws-sdk/client-bedrock-runtime'`. Por eso `terraform/scripts/
package-lambdas.js` ya no usa un `external` uniforme para los 6 servicios:

| Servicio | `external` |
|----------|------------|
| `conversation-agent` | `["@aws-sdk/client-dynamodb", "@aws-sdk/lib-dynamodb"]` (lista explícita, NO el wildcard `@aws-sdk/*`) -- sigue sin bundlear dynamodb/lib-dynamodb (preinstalados), pero SÍ bundlea bedrock-runtime/ssm |
| `policy-agent` | `[]` -- no usa ningún `@aws-sdk/*` "core", bundlea todo lo que haga falta (bedrock-runtime/ssm incluidos) |
| `retrieval-agent`, `transaction-agent`, `verification-agent`, `escalation-agent` | `["@aws-sdk/*"]` (sin cambios -- no tocan Bedrock/SSM) |

Verificado por inspección directa del bundle generado (no solo declarado):
`grep -c "client-bedrock-runtime\|BedrockRuntimeClient" build/conversation-agent/index.js`
y `build/policy-agent/index.js` confirman coincidencias (código inlineado),
y `grep -o 'require("@aws-sdk/[a-zA-Z0-9_-]*")' build/conversation-agent/
index.js` devuelve únicamente `@aws-sdk/client-dynamodb`/`@aws-sdk/
lib-dynamodb` como `require()` externos reales (el único otro match,
`@aws-sdk/signature-v4-crt`, es texto de un mensaje de error del propio SDK,
no un `require()` real -- confirmado leyendo el contexto en el bundle). El
tamaño de `build/conversation-agent/index.js` pasó de ~39kb a ~1.6mb y
`build/policy-agent/index.js` de ~119kb a ~1.7mb, consistente con bundlear
el SDK de Bedrock completo.

`policy-agent`, `transaction-agent` y `verification-agent` además reciben
una copia de `policies.yaml` (raíz del monorepo) dentro de su paquete, en
`/var/task/policies.yaml` una vez desplegado -- los 3 tienen
`POLICY_FILE_PATH=/var/task/policies.yaml` seteado explícitamente como
variable de entorno (no se depende del default relativo de cada handler).
`escalation-agent` (igual que `conversation-agent`/`retrieval-agent`, que no
leen `policies.yaml`) no recibe esa copia -- es pura transformación de datos
ya recibidos en el evento, sin ninguna variable de entorno.

`verification-agent` y `escalation-agent`, igual que `policy-agent`, se
bundlean desde `src/handler.ts` (no `src/index.ts`) -- ambos son Task-a-Task
internos de la Step Function, `src/index.ts` de esos 3 servicios solo
re-exporta `handler.ts`. Se bundlean igual a `build/<servicio>/index.js`
(mismo nombre de archivo que los otros 3) para que el `handler` de
configuración del Lambda sea uniformemente `index.handler` en los 6
servicios.

### Flujo de build dentro de Terraform

1. `null_resource.build_lambdas` (`local-exec`) corre `node
   terraform/scripts/package-lambdas.js` desde la raíz del monorepo,
   disparado por un hash combinado de `services/{conversation,policy,
   retrieval,transaction,verification,escalation}-agent/src` +
   `packages/shared/src` + `policies.yaml` (se recalcula en cada `terraform
   plan`, así que `terraform apply` solo re-bundlea cuando algo relevante
   cambió). Como el hash es combinado sobre los 6 servicios, un cambio en
   cualquiera de ellos dispara un re-build de los 6 zips (esbuild es
   determinístico, así que los 4 que no cambiaron generan bytes idénticos --
   Terraform igual recalcula su `source_code_hash` como "known after apply"
   en ese `plan`, y solo termina siendo un no-op contra AWS si el contenido
   coincide).
2. `data.archive_file.<servicio>` zippea `build/<servicio>/` (generado por
   el paso anterior) a `build/<servicio>.zip`, con `depends_on` explícito al
   `null_resource` (patrón estándar de "data source de apply-time").
3. `aws_lambda_function.<servicio>` usa ese zip vía `filename` +
   `source_code_hash = data.archive_file.<servicio>.output_base64sha256`.

Para regenerar los zips manualmente sin correr Terraform (ej. para
inspeccionar el bundle):

```bash
npm run package:lambdas   # desde la raíz del monorepo
# o: node terraform/scripts/package-lambdas.js
```

## IAM de mínimo privilegio (gap 3, Security)

| Lambda | Permisos AWS (más allá de logging) |
|--------|-------------------------------------|
| `conversation-agent` | `dynamodb:GetItem`/`PutItem`/`Query` SOLO sobre `case_store` (tabla + índice); `bedrock:InvokeModel`/`Converse` SOLO sobre el inference profile + foundation-model elegidos; `ssm:GetParameter` SOLO sobre los 2 parámetros de config de Bedrock |
| `policy-agent` | `bedrock:InvokeModel`/`Converse` SOLO sobre el inference profile + foundation-model elegidos; `ssm:GetParameter` SOLO sobre los 2 parámetros de config de Bedrock -- sigue SIN DynamoDB, no toca ningún dato |
| `retrieval-agent` | `dynamodb:GetItem`/`Scan` SOLO sobre `product_catalog` (solo lectura) |
| `transaction-agent` | `dynamodb:GetItem`/`PutItem` SOLO sobre `case_store` |
| `verification-agent` | **Ninguno** -- segunda verificación independiente releyendo `policies.yaml` embebido en su propio paquete, no toca AWS más allá de logging |
| `escalation-agent` | **Ninguno** -- pura transformación del `EscalationInput` recibido en el evento, no toca AWS más allá de logging, ni siquiera lee `policies.yaml` |

Ninguno de los 6 roles tiene `lambda:InvokeFunction` sobre ningún recurso --
ni siquiera entre ellos. Esa ausencia es deliberada: es la garantía real
(forzada por IAM, no solo por contrato de código) de que ningún Lambda de
este módulo puede saltearse la Step Function e invocar a otro directamente.
Ver `terraform/modules/orchestration/README.md` y
`docs/EVALUATION-CRITERIA.md` para el resto del diseño de este control
(incluida la limitación conocida del bypass por el usuario admin del
proyecto).

## Bedrock IAM: decisión de diferir (RESUELTO en la fase "Habilitar Bedrock real")

**Historial de la decisión (checkpoint anterior, ya no vigente):** este
módulo diferió deliberadamente el IAM de `bedrock:InvokeModel`/
`InvokeModelWithResponseStream` hasta que existiera código real en
`conversation-agent`/`policy-agent` que lo consumiera (principio "no
otorgar un permiso IAM sin código que lo use", ver `terraform/README.md`,
sección "Limitaciones"). Esa decisión queda documentada como referencia
histórica, no se borra -- pero **ya no aplica**: ambos servicios empezaron a
invocar Bedrock en esta fase (patrón "el modelo propone, policies.yaml
dispone" -- Bedrock propone, el guardrail determinístico de policies.yaml
sigue disponiendo la decisión final), así que el IAM correspondiente ya se
agregó.

### Qué se agregó

- `data.aws_caller_identity.current` (sin recurso propio, solo lectura) --
  necesaria para construir ARNs exactos sin hardcodear el account ID en
  ningún `.tf` (mismo criterio ya aplicado en `docs/`: nunca commitear el
  account ID literal).
- `aws_iam_role_policy.conversation_agent_bedrock` /
  `aws_iam_role_policy.policy_agent_bedrock`: `bedrock:InvokeModel` +
  `bedrock:Converse` (deliberadamente SIN `InvokeModelWithResponseStream`/
  `ConverseStream` -- el diseño de conversation-agent/policy-agent usa
  `Converse` con tool use forzado, sin streaming; no se otorga un permiso
  sin código que lo use, mismo principio de siempre) scoped a
  `local.bedrock_resource_arns` (ver abajo, nunca `Resource = "*"`).
- `aws_iam_role_policy.conversation_agent_ssm` /
  `aws_iam_role_policy.policy_agent_ssm`: `ssm:GetParameter` scoped
  exactamente a los 2 parámetros de `module.secrets`
  (`bedrock_model_id_parameter_name`/`bedrock_region_parameter_name`), no al
  path completo `/{project}-{env}/*` (aunque `module.secrets` documenta esa
  alternativa como opción válida -- se prefirió el scoping más estrecho
  posible).
- Variables de entorno nuevas en ambos Lambdas:
  `BEDROCK_MODEL_ID_PARAM_NAME`/`BEDROCK_REGION_PARAM_NAME` (nombres reales
  de parámetro SSM) -- el contrato que el código de `conversation-agent`/
  `policy-agent` usa para leer el modelo/región en runtime vía
  `ssm:GetParameter`, en vez de hardcodearlo. `conversation-agent` además
  recibe `UNDERSTANDING_BACKEND=bedrock` (mismo patrón que
  `CATALOG_BACKEND` de `retrieval-agent`). `policy-agent` NO recibe un
  toggle equivalente -- Bedrock se intenta siempre con fallback automático
  al evaluador determinístico, sin variable de selección.

### Por qué el ARN del inference profile NO alcanza (verificado empíricamente, no asumido)

Hipótesis de partida: los inference profiles cross-region de Anthropic
(prefijo `us.`) podrían requerir también permiso identity-based sobre el/los
ARN(s) de `foundation-model` subyacente(s), no solo sobre el `inference-profile`.
Se verificó con una invocación real de punta a punta (no una simulación):
se desplegó una Lambda de prueba temporal (`nodejs20.x`, mismo bundle
esbuild que produce `package-lambdas.js`) usando el `Role` real de
`conversation_agent`/`policy_agent` (sin modificar su trust policy --
Lambda ya es un principal confiable para ambos roles), con las mismas
variables de entorno `BEDROCK_MODEL_ID_PARAM_NAME`/`BEDROCK_REGION_PARAM_NAME`
que usará el código real, y se invocó (`lambda:InvokeFunction` con
credenciales admin), leyendo la config vía `ssm:GetParameter` y llamando
`ConverseCommand` exactamente como lo hará el código real. La Lambda de
prueba se borró inmediatamente después de cada corrida.

1. **Con SOLO el ARN del inference profile en el `Resource`**: `ssm:GetParameter`
   funcionó (confirma esa policy). `bedrock:Converse` falló con
   `AccessDeniedException` real:
   > `User: arn:aws:sts::<account_id>:assumed-role/banking-agent-dev-conversation-agent-role/... is not authorized to perform: bedrock:InvokeModel on resource: arn:aws:bedrock:us-east-1::foundation-model/anthropic.claude-sonnet-4-6 because no identity-based policy allows the bedrock:InvokeModel action`

   Confirma la hipótesis: Bedrock evalúa el permiso identity-based también
   contra el ARN del foundation model subyacente (un recurso público de AWS,
   sin account ID en el ARN), no solo contra el inference profile. Nota
   adicional: el mensaje pide `bedrock:InvokeModel` aunque la llamada fue
   `ConverseCommand` -- la Converse API se autoriza también contra esa
   acción sobre el foundation model.
2. **Se agregó el ARN de foundation-model en `bedrock_region` (`us-east-1`)
   únicamente** y se re-probó: volvió a fallar, esta vez con el mismo error
   pero contra `arn:aws:bedrock:us-east-2::foundation-model/...` -- AWS
   enrutó la segunda invocación (mismo modelId, misma región del cliente) a
   una región física distinta. Confirma que el enrutamiento cross-region del
   prefijo `us.` es real y no determinístico, no alcanza con una sola
   región de foundation-model.
3. **Se agregaron los 3 ARNs de foundation-model** (`us-east-1`,
   `us-east-2`, `us-west-2` -- las 3 regiones que cubre el prefijo `us.`
   según la documentación de AWS) y se re-probó 3 veces consecutivas (rol
   `conversation_agent`) + 1 vez con el rol `policy_agent`: las 4
   invocaciones tuvieron éxito (`bedrock:Converse ok: true`, respuesta real
   `{"message":{"role":"assistant","content":[{"text":"OK"}]}}`).

`local.bedrock_resource_arns` en `main.tf` refleja exactamente este
resultado: el ARN del inference profile + los 3 ARNs de foundation-model
(`us-east-1`/`us-east-2`/`us-west-2`), construidos con
`replace(var.bedrock_model_id, "us.", "")` para derivar el model ID base
(`anthropic.claude-sonnet-4-6`) a partir del inference profile ID
(`us.anthropic.claude-sonnet-4-6`).

## Variables relevantes

Ver `variables.tf`. Los ARNs/nombres de tabla (`case_store_table_*`,
`catalog_table_*`) se pasan explícitamente desde `envs/dev/main.tf`
(`module.data.*`), no se referencian directamente entre módulos, para
mantener el grafo de dependencias legible desde el root module.
`verification-agent`/`escalation-agent` no agregan variables nuevas al
módulo -- no necesitan ninguna tabla ni recurso adicional de otros módulos.

Variables nuevas de la fase "Habilitar Bedrock real" (consumidas SOLO por
`conversation_agent`/`policy_agent`, ver locals `bedrock_*` en `main.tf`):
`bedrock_model_id`, `bedrock_region` (default `"us-east-1"`),
`bedrock_model_id_ssm_parameter_name`, `bedrock_region_ssm_parameter_name`
-- las últimas dos vienen de `module.secrets.bedrock_model_id_parameter_name`/
`bedrock_region_parameter_name`, pasadas explícitamente desde
`envs/dev/main.tf` (mismo patrón que el resto del módulo: sin referencias
directas entre módulos).

## Outputs

`conversation_agent_function_name/arn/invoke_arn`,
`policy_agent_function_name/arn`, `retrieval_agent_function_name/arn`,
`transaction_agent_function_name/arn`, `verification_agent_function_name/arn`,
`escalation_agent_function_name/arn` -- consumidos por
`terraform/modules/orchestration` (ARNs para la Step Function) y por
`envs/dev/outputs.tf` (para que el reviewer pueda verificar independientemente
sin releer el HCL).
