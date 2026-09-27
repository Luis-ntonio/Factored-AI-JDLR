import path from "node:path";
import { defineConfig } from "vitest/config";

// Mismo patrón que services/verification-agent/vitest.config.ts: se alía
// @banking-agent/shared a su código fuente (tests unitarios no dependen de
// `npm run build` previo de ese paquete). escalation-agent no lee
// policies.yaml ni ningún otro archivo de config en runtime (a diferencia de
// policy-agent/transaction-agent/verification-agent) -- es pura
// transformación de datos ya recolectados por las capas anteriores del
// pipeline, así que no hace falta ninguna otra alias/mock de infraestructura.
export default defineConfig({
  resolve: {
    alias: {
      "@banking-agent/shared": path.resolve(__dirname, "../../packages/shared/src/index.ts"),
    },
  },
});
