/// <reference types="vitest/config" />
import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@okkey/i18n": path.resolve(__dirname, "../../packages/i18n/src"),
      "@okkey/ui": path.resolve(__dirname, "../../packages/ui/src"),
      "@workspace/ui": path.resolve(__dirname, "../../packages/ui/src"),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    passWithNoTests: false,
  },
});
