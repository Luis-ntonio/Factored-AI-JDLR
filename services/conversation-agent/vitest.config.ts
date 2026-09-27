import path from "node:path";
import { defineConfig } from "vitest/config";

// Alias directo al código fuente de packages/shared (sin depender de un
// `npm run build` previo del paquete) para que los tests corran rápido en
// CI/local sin credenciales AWS ni pasos de build intermedios.
export default defineConfig({
  resolve: {
    alias: {
      "@banking-agent/shared": path.resolve(__dirname, "../../packages/shared/src/index.ts"),
    },
  },
});
