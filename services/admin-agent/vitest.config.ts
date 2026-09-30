import path from "node:path";
import { defineConfig } from "vitest/config";

// Mismo patrón que auth-agent/vitest.config.ts: alía @banking-agent/shared
// a su código fuente para que los tests unitarios no dependan de un
// `npm run build` previo de ese paquete.
export default defineConfig({
  resolve: {
    alias: {
      "@banking-agent/shared": path.resolve(__dirname, "../../packages/shared/src/index.ts"),
    },
  },
});
