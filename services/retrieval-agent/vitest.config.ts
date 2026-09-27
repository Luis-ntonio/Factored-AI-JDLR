import path from "node:path";
import { defineConfig } from "vitest/config";

// Alias directo al código fuente de packages/shared (mismo patrón que
// conversation-agent) para que los tests unitarios corran sin depender de un
// `npm run build` previo de ese paquete. @banking-agent/policy-agent NO se
// alía a su código fuente a propósito: el test de integración
// (`test/pipeline-integration.test.ts`) importa deliberadamente el paquete
// COMPILADO (`dist/`, resuelto vía el symlink de npm workspaces en
// node_modules) para ejercitar lo mismo que consumiría un consumidor externo
// real — por eso `npm run build` debe correr antes de `npm test` a nivel
// monorepo (ver README.md de este servicio).
export default defineConfig({
  resolve: {
    alias: {
      "@banking-agent/shared": path.resolve(__dirname, "../../packages/shared/src/index.ts"),
    },
  },
});
