# @banking-agent/shared

Fuente de verdad **canónica** (código, no prosa) del contrato de salida de
`conversation-agent` (`UnderstandOutput`), consumido por `policy-agent` y,
en fases posteriores, `retrieval-agent`/`transaction-agent`.

- Definición completa: `src/contracts/understand-output.ts`.
- Explicación legible por humanos, decisiones y ejemplos: `docs/CONTRACTS.md`
  (raíz del repo). Si hay una discrepancia entre ese `.md` y este código, el
  código gana — el `.md` describe, no define.

## Build / test

```
npm install
npm run build --workspace=@banking-agent/shared
npm test --workspace=@banking-agent/shared
```
