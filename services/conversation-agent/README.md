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
  context/
    state-store.ts          # DynamoDB (reintentos acotados + fallback)
    context-manager.ts      # orquesta: idioma -> entities -> intent -> merge -> persist
  index.ts                  # handler de Lambda para POST /chat (no conectado aún)
test/                        # vitest, DynamoDB mockeado, sin credenciales AWS
```

## Estado

- No conectado todavía a la ruta `POST /chat` de `terraform/modules/edge`
  (eso lo hace devops en una fase posterior — el handler ya está escrito
  para correr como Lambda `nodejs20.x`, exporta `handler` desde `src/index.ts`).
- Variable de entorno requerida en runtime real: `CASE_STORE_TABLE_NAME`
  (valor esperado: output `case_store_table_name` de `terraform/envs/dev`).

## Comandos

```bash
npm run build --workspace=@banking-agent/conversation-agent
npm test --workspace=@banking-agent/conversation-agent
```
