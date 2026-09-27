import path from "node:path";
import { defineConfig } from "vitest/config";

// Mismo patrón que services/retrieval-agent/vitest.config.ts: se alía
// @banking-agent/shared a su código fuente (tests unitarios no dependen de
// `npm run build` previo de ese paquete). @banking-agent/policy-agent NO se
// alía a propósito -- el test de integración (`test/pipeline-integration.test.ts`)
// importa deliberadamente el paquete COMPILADO (`dist/`, resuelto vía el
// symlink de npm workspaces en node_modules) para ejercitar lo mismo que
// consumiría un consumidor externo real -- por eso `npm run build` debe
// correr antes de `npm test` a nivel monorepo (ver README.md de este
// servicio).
export default defineConfig({
  resolve: {
    alias: {
      "@banking-agent/shared": path.resolve(__dirname, "../../packages/shared/src/index.ts"),
    },
  },
});
