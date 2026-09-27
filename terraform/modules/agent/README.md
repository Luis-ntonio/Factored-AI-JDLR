# Módulo `agent`

Los 6 Lambdas de lógica de negocio del pipeline Understand→Decide→Act→Verify→Escalate
(conversation-agent, policy-agent, retrieval-agent, transaction-agent,
verification-agent, escalation-agent), más su IAM de mínimo privilegio.
Los primeros 4 se implementaron en la fase de conexión del pipeline
end-to-end sobre AWS real (gap 2/3 del checkpoint, ver `docs/STATUS.md`);
verification-agent/escalation-agent se agregaron en la fase "Días 5-6 —
Verify + Escalate" (`docs/PLAN.md`).

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
este paso), con `--external:@aws-sdk/*` (el runtime Node.js 20.x de Lambda
trae el SDK v3 completo preinstalado). Esto resuelve el problema de symlinks
de raíz: esbuild inlinea todo el grafo de módulos resuelto en disco,
symlinks incluidos, sin depender de que `node_modules/@banking-agent/shared`
exista como symlink válido dentro del zip desplegado.

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
| `conversation-agent` | `dynamodb:GetItem`/`PutItem`/`Query` SOLO sobre `case_store` (tabla + índice) |
| `policy-agent` | **Ninguno** -- evalúa `policies.yaml` embebido en su propio paquete, no toca AWS más allá de logging |
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

## Bedrock IAM: decisión de diferir (fase "Habilitar Bedrock real")

**Decisión tomada: NO se agrega `bedrock:InvokeModel`/
`bedrock:InvokeModelWithResponseStream` a ningún rol de este módulo todavía**
(ni `conversation_agent` ni `policy_agent`, los candidatos naturales una vez
que el router de intención pase de heurístico a un LLM real), aunque en esta
misma fase ya se decidió el modelo Bedrock concreto
(`us.anthropic.claude-sonnet-5`, ver `terraform/modules/secrets/README.md`)
y se pobló el parámetro SSM con su valor real.

**Razón**: el proyecto tiene un principio ya declarado explícitamente en
checkpoints anteriores (`terraform/README.md`, sección "Limitaciones",
ítem Bedrock) — **no otorgar un permiso IAM sin código que lo use**. Ese
principio se mantiene acá a propósito:

- Ningún Lambda de `services/*` invoca Bedrock hoy. `conversation-agent`
  sigue usando un router de intención heurístico (reglas), no un LLM.
  Otorgar `bedrock:InvokeModel` ahora sería un permiso sin código
  consumidor, exactamente el escenario que el principio busca evitar (mayor
  superficie de IAM sin beneficio funcional, y sin ningún test que ejercite
  ese permiso).
- Agregar el IAM ahora "porque ya total no cuesta nada" no es una razón de
  peso: sí tiene costo (superficie de permisos que un reviewer de Security
  tiene que auditar y justificar, sin código que la respalde) y no
  desbloquea nada en este checkpoint — sea cual sea la fase en la que
  conversation-agent/policy-agent efectivamente empiecen a invocar Bedrock,
  agregar dos `aws_iam_role_policy` scoped al ARN del inference profile es
  un cambio de Terraform chico y sin riesgo, no una razón para adelantarlo.
- El bloqueador de "model access" (ver `terraform/modules/secrets/README.md`)
  ya impediría que ese IAM sirviera de algo hoy incluso si existiera: aunque
  el rol tuviera el permiso, la cuenta todavía no tiene habilitado el acceso
  al modelo en la consola de Bedrock.

Esto es una decisión **consciente**, no un descuido: cuando exista código
real en `conversation-agent`/`policy-agent` que invoque
`bedrock:InvokeModel`/`Converse` (fase C/D de `docs/PLAN.md`, todavía no
implementada), se agrega en ese momento un `aws_iam_role_policy` por rol,
scoped exactamente al ARN del inference profile elegido
(`arn:aws:bedrock:us-east-1:<account_id>:inference-profile/us.anthropic.claude-sonnet-5`),
siguiendo el mismo patrón de mínimo privilegio ya usado en el resto de este
módulo (nunca `Resource: "*"`).

## Variables relevantes

Ver `variables.tf`. Los ARNs/nombres de tabla (`case_store_table_*`,
`catalog_table_*`) se pasan explícitamente desde `envs/dev/main.tf`
(`module.data.*`), no se referencian directamente entre módulos, para
mantener el grafo de dependencias legible desde el root module.
`verification-agent`/`escalation-agent` no agregan variables nuevas al
módulo -- no necesitan ninguna tabla ni recurso adicional de otros módulos.

## Outputs

`conversation_agent_function_name/arn/invoke_arn`,
`policy_agent_function_name/arn`, `retrieval_agent_function_name/arn`,
`transaction_agent_function_name/arn`, `verification_agent_function_name/arn`,
`escalation_agent_function_name/arn` -- consumidos por
`terraform/modules/orchestration` (ARNs para la Step Function) y por
`envs/dev/outputs.tf` (para que el reviewer pueda verificar independientemente
sin releer el HCL).
