import path from "node:path";
import { defineConfig } from "vitest/config";

// Mismo patrón que services/retrieval-agent/vitest.config.ts y
// services/transaction-agent/vitest.config.ts: se alía @banking-agent/shared
// a su código fuente (tests unitarios no dependen de `npm run build` previo
// de ese paquete). verification-agent no tiene ninguna dependencia workspace
// adicional que requiera importar un `dist/` compilado (a diferencia de
// transaction-agent con @banking-agent/policy-agent), así que no hace falta
// ningún test de integración contra un paquete compilado acá.
export default defineConfig({
  resolve: {
    alias: {
      "@banking-agent/shared": path.resolve(__dirname, "../../packages/shared/src/index.ts"),
    },
  },
});
