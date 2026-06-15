import { defineConfig } from "vitest/config";
import path from "node:path";

/**
 * Config dedicada do Vitest — NÃO usa o vite.config.js (que carrega o plugin
 * legado do @base44 com HMR/navigation notifier, desnecessário e ruidoso em
 * teste). Só replica o alias "@" → ./src pra resolver os imports do app.
 *
 * Ambiente "node": os primeiros testes cobrem funções PURAS (parsing,
 * formatação, status, URL segura) — não precisam de DOM. Quando formos testar
 * componentes React, trocar p/ jsdom + @testing-library.
 */
export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  test: {
    environment: "node",
    globals: true,
    include: ["src/**/*.{test,spec}.{js,jsx}"],
  },
});
