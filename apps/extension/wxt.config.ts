import fs from "node:fs";
import path from "node:path";
import { defineConfig } from "wxt";

const repoRoot = path.resolve(__dirname, "../..");
const cryptoWasmSrc = path.resolve(repoRoot, "packages/crypto/dist/okkey_crypto_engine_bg.wasm");
const cryptoWasmPublic = path.resolve(__dirname, "public/okkey_crypto_engine_bg.wasm");

function syncCryptoWasmPublicAsset(): void {
  // Background SW must fetch a real extension URL (not Vite data: inline) under MV3 CSP.
  fs.mkdirSync(path.dirname(cryptoWasmPublic), { recursive: true });
  fs.copyFileSync(cryptoWasmSrc, cryptoWasmPublic);
}

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  srcDir: "src",
  outDir: "output",
  imports: false,
  manifestVersion: 3,
  hooks: {
    "build:before"() {
      syncCryptoWasmPublicAsset();
    },
  },
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
      // blob: required for decrypted favicon / workspace-logo object URLs in <img>.
      extension_pages:
        "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'; img-src 'self' data: blob:; connect-src 'self' http: https:;",
    },
    // E4: content scripts + autofill on arbitrary http(s) origins.
    host_permissions: ["<all_urls>"],
    // Required so web (localhost / self-host) can redirect into the PKCE callback
    // page. Without this, Chrome rewrites the navigation to chrome-extension://invalid/
    // and shows ERR_BLOCKED_BY_CLIENT.
    web_accessible_resources: [
      {
        // Content-script shadow DOM loads Inter + overlay icons via extension URLs.
        resources: [
          "auth-callback.html",
          "fonts/*",
          "icons/*",
        ],
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
    // Never inline wasm as data: URLs — MV3 SW CSP blocks fetch(data:application/wasm).
    build: {
      assetsInlineLimit: 0,
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
        "@okkey/ui": path.resolve(repoRoot, "packages/ui/src"),
        "@okkey/vault-ui": path.resolve(repoRoot, "packages/vault-ui/src"),
        "@okkey/api": path.resolve(repoRoot, "packages/api/src"),
        "@okkey/auth": path.resolve(repoRoot, "packages/auth/src"),
        "@okkey/i18n": path.resolve(repoRoot, "packages/i18n/src"),
        "@okkey/types": path.resolve(repoRoot, "packages/types/src"),
        "@okkey/id": path.resolve(repoRoot, "packages/id/src"),
        "@okkey/crypto": path.resolve(repoRoot, "packages/crypto/src"),
        "@okkey/crypto-wasm": path.resolve(repoRoot, "packages/crypto/dist/okkey_crypto_engine.js"),
        "@okkey/vault": path.resolve(repoRoot, "packages/vault/src"),
        "@okkey/sync": path.resolve(repoRoot, "packages/sync/src"),
        "@okkey/sync/item-sync": path.resolve(repoRoot, "packages/sync/src/item-sync.ts"),
      },
    },
  }),
});
