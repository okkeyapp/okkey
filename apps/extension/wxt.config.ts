import path from "node:path";
import { defineConfig } from "wxt";

const repoRoot = path.resolve(__dirname, "../..");

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  srcDir: "src",
  outDir: ".output",
  imports: false,
  // Plan: MV3 only (Chromium service worker + Firefox event background).
  manifestVersion: 3,
  suppressWarnings: {
    firefoxDataCollection: true,
  },
  manifest: ({ browser }) => ({
    name: "Okkey",
    description: "Okkey password manager extension",
    // Product slice version without `v` — keep in sync with root package version at release.
    version: "0.0.1",
    permissions: ["storage"],
    // Narrow permissions for E0 shell; host access lands with autofill (E4).
    ...(browser === "firefox"
      ? {
          browser_specific_settings: {
            gecko: {
              id: "extension@okkey.io",
              strict_min_version: "121.0",
            },
          },
        }
      : {}),
  }),
  vite: () => ({
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
        "@okkey/ui": path.resolve(repoRoot, "packages/ui/src"),
      },
    },
  }),
});
