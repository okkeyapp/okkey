import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@okkey/ui": path.join(root, "src/entrypoints/popup/testStubs/okkeyUi.tsx"),
      "@okkey/crypto": path.join(root, "src/entrypoints/popup/testStubs/okkeyCrypto.ts"),
    },
  },
  test: {
    environment: "jsdom",
    include: ["src/entrypoints/popup/**/*.test.tsx"],
  },
});
