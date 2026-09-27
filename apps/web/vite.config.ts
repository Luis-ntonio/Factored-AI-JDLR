import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Puerto 5173 es el default de Vite — devops ya validó CORS del endpoint
// real asumiendo un dev server en http://localhost:5173, así que se deja
// explícito acá para no depender de que nadie cambie el default sin darse
// cuenta.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
  },
});
