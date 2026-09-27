# conversation-agent

Capa "Understand" del pipeline (`.claude/agents/conversation-agent.md`):
router de intención, detección de idioma ES/PT por mensaje, y context
manager sobre la tabla DynamoDB real `banking-agent-dev-case-store`
(`terraform/modules/data`).

Contrato de salida completo, ejemplos, modelo de claves DynamoDB y fallback
de Reliability: **ver `docs/CONTRACTS.md`** (raíz del repo) — este README
solo indexa el código.

## Estructura

```
src/
  router/
    language-detector.ts   # detección ES/PT por mensaje (heurística)
    entity-extractor.ts    # extracción de slots por regex/keywords
    intent-router.ts        # clasificación de intent
  understanding/
    understand-backend.ts   # orquesta backend Bedrock vs heurística (umbral de confianza + fallback)
    bedrock-understander.ts # Converse API con tool use forzado (enums del contrato) + validación/coerción
    ssm-config.ts            # resuelve model id/región de Bedrock vía SSM, cacheado en memoria
  context/
    state-store.ts          # DynamoDB (reintentos acotados + fallback)
    context-manager.ts      # orquesta: understand-backend -> merge -> persist
  index.ts                  # handler de Lambda para POST /chat (no conectado aún)
test/                        # vitest, DynamoDB/Bedrock/SSM mockeados, sin credenciales AWS
```

## Estado

- No conectado todavía a la ruta `POST /chat` de `terraform/modules/edge`
  (eso lo hace devops en una fase posterior — el handler ya está escrito
  para correr como Lambda `nodejs20.x`, exporta `handler` desde `src/index.ts`).
- Variable de entorno requerida en runtime real: `CASE_STORE_TABLE_NAME`
  (valor esperado: output `case_store_table_name` de `terraform/envs/dev`).
- Backend de la capa Understand, controlado por `UNDERSTANDING_BACKEND`
  (`"bedrock"` default, o `"heuristic"` para forzar solo la heurística).
  Con `"bedrock"`: si `BEDROCK_MODEL_ID_PARAM_NAME`/`BEDROCK_REGION_PARAM_NAME`
  (nombres de parámetro SSM, provistos por devops) no están seteadas, o la
  llamada a Bedrock falla, o la confianza del modelo es menor a
  `UNDERSTANDING_CONFIDENCE_THRESHOLD` (`understanding/understand-backend.ts`,
  0.5), se hace fallback automático a la heurística — nunca se pierde el
  turno. Ver logs estructurados `event: "understanding_backend_used"` para
  confirmar en CloudWatch qué backend se usó en cada turno.

## Comandos

```bash
npm run build --workspace=@banking-agent/conversation-agent
npm test --workspace=@banking-agent/conversation-agent
```
