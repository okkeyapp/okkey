import path from "node:path";
import { defineConfig } from "wxt";

const repoRoot = path.resolve(__dirname, "../..");

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  srcDir: "src",
  outDir: "output",
  imports: false,
  manifestVersion: 3,
  suppressWarnings: {
    firefoxDataCollection: true,
  },
  manifest: ({ browser }) => ({
    name: "Okkey",
    description: "Okkey password manager extension",
    version: "0.0.1",
    permissions: ["storage", "tabs"],
    // E1: session + device API calls to configured Base URL / localhost API.
    // Autofill host access expands in E4.
    host_permissions: ["http://localhost/*", "http://127.0.0.1/*", "https://*/*"],
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
        "@okkey/api": path.resolve(repoRoot, "packages/api/src"),
        "@okkey/auth": path.resolve(repoRoot, "packages/auth/src"),
        "@okkey/types": path.resolve(repoRoot, "packages/types/src"),
        "@okkey/id": path.resolve(repoRoot, "packages/id/src"),
      },
    },
  }),
});
