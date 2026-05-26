import base44 from "@base44/vite-plugin";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/**
 * Vite config — SIGO Obras
 * https://vite.dev/config/
 */
export default defineConfig(({ mode }) => ({
  logLevel: "error", // Suppress warnings, only show errors

  plugins: [
    // Plugin do SDK legado (resolve aliases @/integrations, @/entities, etc.).
    // Será removido na migração para @sigoobras/sdk (Fase 3 do roadmap).
    base44({
      legacySDKImports: process.env.LEGACY_SDK_IMPORTS === "true",
      hmrNotifier: true,
      navigationNotifier: true,
      visualEditAgent: true,
    }),
    react(),
  ],

  build: {
    // Minify com Terser pra poder remover console.* automaticamente
    minify: "terser",
    terserOptions: {
      compress: {
        // Em PRODUÇÃO: strippa console.log, console.debug, console.info
        // (mantém console.error e console.warn pra rastreabilidade de bugs)
        drop_console: mode === "production" ? ["log", "debug", "info"] : false,
        drop_debugger: mode === "production",
      },
      format: {
        comments: false,
      },
    },
    // Bundle source maps em dev/staging, omite em prod (mais leve, mais privado)
    sourcemap: mode !== "production",
    // Avisa quando chunk passar de 600 KB (default é 500, mas Radix UI estoura)
    chunkSizeWarningLimit: 600,
  },

  server: {
    port: 5173,
    strictPort: false,
    open: false,
  },

  preview: {
    port: 4173,
    strictPort: false,
  },
}));
