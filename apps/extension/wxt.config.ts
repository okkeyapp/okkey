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
  // Store zips use manifest `version` (1.0.0.N), not package.json SemVer (yarn workspaces
  // reject four-part versions — keep package.json at 1.0.0).
  zip: {
    name: "okkeyextension",
    // WXT 0.20.x: {{version}} = manifest.version (store numeric). No {{modeSuffix}} yet.
    artifactTemplate: "{{name}}-{{version}}-{{browser}}.zip",
    sourcesTemplate: "{{name}}-{{version}}-sources.zip",
    // AMO reviewers need a monorepo-shaped sources zip (not apps/extension alone).
    // See store/SOURCES.md for rebuild steps.
    sourcesRoot: repoRoot,
    // Narrow globs: WXT cannot exclude a subset of an include match
    // (`include || !exclude`), so avoid `apps/extension/**` / `packages/crypto/**`.
    includeSources: [
      "package.json",
      "yarn.lock",
      "rust-toolchain.toml",
      ".tool-versions",
      "AGENTS.md",
      "ARCHITECTURE.md",
      "README.md",
      "scripts/verify-crypto-bootstrap.mjs",
      // Extension (no output/, node_modules/, store screenshot assets, prebuilt wasm)
      "apps/extension/package.json",
      "apps/extension/wxt.config.ts",
      "apps/extension/tsconfig.json",
      "apps/extension/tailwind.config.ts",
      "apps/extension/postcss.config.js",
      "apps/extension/README.md",
      "apps/extension/src/**",
      "apps/extension/assets/**",
      "apps/extension/public/_locales/**",
      "apps/extension/public/fonts/**",
      "apps/extension/public/icons/**",
      "apps/extension/public/icon-*.png",
      "apps/extension/store/*.md",
      // Shared packages — sources only (rebuild dist / wasm)
      "packages/api/package.json",
      "packages/api/tsconfig.json",
      "packages/api/src/**",
      "packages/auth/package.json",
      "packages/auth/tsconfig.json",
      "packages/auth/src/**",
      "packages/crypto/package.json",
      "packages/crypto/tsconfig.json",
      "packages/crypto/README.md",
      "packages/crypto/scripts/**",
      "packages/crypto/src/**",
      "packages/i18n/package.json",
      "packages/i18n/tsconfig.json",
      "packages/i18n/src/**",
      "packages/id/package.json",
      "packages/id/tsconfig.json",
      "packages/id/src/**",
      "packages/sync/package.json",
      "packages/sync/tsconfig.json",
      "packages/sync/src/**",
      "packages/types/package.json",
      "packages/types/tsconfig.json",
      "packages/types/src/**",
      "packages/ui/package.json",
      "packages/ui/tsconfig.json",
      "packages/ui/src/**",
      "packages/vault/package.json",
      "packages/vault/tsconfig.json",
      "packages/vault/src/**",
      "packages/vault-ui/package.json",
      "packages/vault-ui/tsconfig.json",
      "packages/vault-ui/src/**",
      // Rust crypto engine (no fuzz/)
      "rust/crypto-engine/Cargo.toml",
      "rust/crypto-engine/Cargo.lock",
      "rust/crypto-engine/src/**",
    ],
    // WXT filter is `includeMatch || !excludeMatch` (not a pure allowlist).
    // Excluding `**` forces only `includeSources` paths into the AMO sources zip.
    excludeSources: ["**"],
    // `.tool-versions` is listed in includeSources (explicit glob entry).
    dotSources: true,
  },
  manifest: ({ browser }) => {
    // Chrome / Edge / AMO: dotted integers only. No Chromium `version_name`, no `*-beta.*`.
    // Product SemVer (e.g. 1.0.0-beta.2) is for GitHub Releases / images — not store packaging.
    const manifestVersion = "1.0.0.2";
    const chromiumOnlyPermissions = ["offscreen"] as const;
    const sharedPermissions = [
      "storage",
      "tabs",
      "idle",
      "alarms",
      "clipboardRead",
      "clipboardWrite",
    ] as const;
    // Firefox has no offscreen documents — clipboard clear uses navigator.clipboard in the
    // background (see extensionVaultLifecycle). Declaring `offscreen` trips web-ext lint.
    const permissions =
      browser === "firefox"
        ? [...sharedPermissions]
        : [...sharedPermissions, ...chromiumOnlyPermissions];
    return {
      // Store consoles expose EN+RU listing locales from package `_locales/`.
      // In-app UI still uses `@okkey/i18n` + chrome.storage (not browser.i18n).
      default_locale: "en",
      name: "__MSG_extName__",
      description: "__MSG_extDescription__",
      version: manifestVersion,
      homepage_url: "https://github.com/okkeyapp/okkey",
      icons: {
        16: "icon-16.png",
        32: "icon-32.png",
        48: "icon-48.png",
        128: "icon-128.png",
      },
      action: {
        default_title: "__MSG_actionTitle__",
        default_icon: {
          16: "icon-16.png",
          32: "icon-32.png",
          48: "icon-48.png",
          128: "icon-128.png",
        },
      },
      permissions,
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
                // Built-in data-collection consent exists from Firefox 140; keep 121 for
                // API floor and document older-Firefox note in store/PERMISSIONS.md.
                strict_min_version: "121.0",
                // Required for new AMO submissions (MISSING_DATA_COLLECTION_PERMISSIONS).
                // Password-manager sync to the user-configured self-host transmits auth
                // material + uses tab URL / form DOM locally for autofill matching.
                data_collection_permissions: {
                  required: ["authenticationInfo", "browsingActivity", "websiteContent"],
                },
              },
            },
          }
        : {}),
    };
  },
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
