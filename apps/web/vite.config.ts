/// <reference types="vitest/config" />
import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  assetsInclude: ["**/*.wasm"],
  optimizeDeps: {
    exclude: ["@okkey/crypto", "@okkey/crypto-wasm"],
  },
  server: {
    port: 5173,
    strictPort: true,
    fs: {
      allow: [
        path.resolve(__dirname, "."),
        path.resolve(__dirname, "../../packages/crypto/dist"),
      ],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@okkey/i18n": path.resolve(__dirname, "../../packages/i18n/src"),
      "@okkey/ui": path.resolve(__dirname, "../../packages/ui/src"),
      "@workspace/ui": path.resolve(__dirname, "../../packages/ui/src"),
      "@okkey/types": path.resolve(__dirname, "../../packages/types/src"),
      "@okkey/api": path.resolve(__dirname, "../../packages/api/src"),
      "@okkey/auth": path.resolve(__dirname, "../../packages/auth/src"),
      "@okkey/crypto": path.resolve(__dirname, "../../packages/crypto/src"),
      "@okkey/crypto-wasm": path.resolve(__dirname, "../../packages/crypto/dist/okkey_crypto_engine.js"),
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    passWithNoTests: false,
  },
});
