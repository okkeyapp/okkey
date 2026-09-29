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
    icons: {
      16: "icon-16.png",
      32: "icon-32.png",
      48: "icon-48.png",
      128: "icon-128.png",
    },
    action: {
      default_title: "Okkey",
      default_icon: {
        16: "icon-16.png",
        32: "icon-32.png",
        48: "icon-48.png",
        128: "icon-128.png",
      },
    },
    permissions: ["storage", "tabs", "idle"],
    // Crypto unlock instantiates WASM; MV3 default CSP is script-src 'self' only.
    content_security_policy: {
      extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self';",
    },
    // E1: session + device API calls to configured Base URL / localhost API.
    // Autofill host access expands in E4.
    host_permissions: ["http://localhost/*", "http://127.0.0.1/*", "https://*/*"],
    // Required so web (localhost / self-host) can redirect into the PKCE callback
    // page. Without this, Chrome rewrites the navigation to chrome-extension://invalid/
    // and shows ERR_BLOCKED_BY_CLIENT.
    web_accessible_resources: [
      {
        resources: ["auth-callback.html"],
        matches: ["http://*/*", "https://*/*"],
      },
    ],
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
    // Same as apps/web: emit `.wasm` as build assets (required for crypto unlock).
    assetsInclude: ["**/*.wasm"],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
        "@okkey/ui": path.resolve(repoRoot, "packages/ui/src"),
        "@okkey/api": path.resolve(repoRoot, "packages/api/src"),
        "@okkey/auth": path.resolve(repoRoot, "packages/auth/src"),
        "@okkey/i18n": path.resolve(repoRoot, "packages/i18n/src"),
        "@okkey/types": path.resolve(repoRoot, "packages/types/src"),
        "@okkey/id": path.resolve(repoRoot, "packages/id/src"),
        "@okkey/crypto": path.resolve(repoRoot, "packages/crypto/src"),
        "@okkey/crypto-wasm": path.resolve(repoRoot, "packages/crypto/dist/okkey_crypto_engine.js"),
        "@okkey/vault": path.resolve(repoRoot, "packages/vault/src"),
        "@okkey/sync": path.resolve(repoRoot, "packages/sync/src"),
      },
    },
  }),
});
