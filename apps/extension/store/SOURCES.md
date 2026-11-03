# AMO sources.zip — rebuild instructions for reviewers

**Artifact:** `apps/extension/output/okkeyextension-1.0.0.2-sources.zip`  
(produced by `yarn zip:extension:firefox` from the monorepo root)

## Why this zip is monorepo-shaped

The extension imports shared packages (`@okkey/vault`, `@okkey/crypto`, …) and a Rust→WASM crypto engine. A zip of `apps/extension` alone is **not** rebuildable. This sources pack includes:

| Path | Role |
|------|------|
| `package.json`, `yarn.lock` | Workspace install (Yarn classic) |
| `.tool-versions`, `rust-toolchain.toml` | Node / Rust pins |
| `apps/extension/**` | Extension source + WXT config |
| `packages/{api,auth,crypto,i18n,id,sync,types,ui,vault,vault-ui}/**` | Client packages the extension aliases |
| `rust/crypto-engine/**` | WASM crypto engine source + `Cargo.lock` |
| `scripts/verify-crypto-bootstrap.mjs` | Post-`wasm-pack` verify step |

Excluded on purpose: `node_modules`, build `dist`/`output`, store screenshot PNGs, prebuilt `.wasm` (rebuild via `yarn build:wasm`), fuzz targets, tests, unrelated monorepo apps (`apps/web`, `services/*`, …).  
WXT’s zip filter is `include || !exclude`; `excludeSources: ["**"]` in `wxt.config.ts` forces a true allowlist via `includeSources`.

Canonical public tree: https://github.com/okkeyapp/okkey (branch `dev`).

## Rebuild (Firefox store package)

Requirements: Node `>=25 <26`, Yarn `1.22.x`, Rust (see `rust-toolchain.toml`), [`wasm-pack`](https://rustwasm.github.io/wasm-pack/).

```bash
# From the extracted sources root (same layout as the GitHub monorepo top-level)
yarn install --frozen-lockfile
yarn build:wasm
yarn zip:extension:firefox
```

Expected outputs:

```text
apps/extension/output/
  firefox-mv3/
  okkeyextension-1.0.0.2-firefox.zip
  okkeyextension-1.0.0.2-sources.zip
```

Lint the unpacked Firefox build:

```bash
npx web-ext lint --source-dir apps/extension/output/firefox-mv3
```

Expect **0 errors**. Warnings that remain after triage are documented in [PERMISSIONS.md](./PERMISSIONS.md) (§ Firefox web-ext lint).

## Notes for AMO

- Gecko id: `extension@okkey.io`
- Manifest version: `1.0.0.2`
- `browser_specific_settings.gecko.data_collection_permissions` is set (required for new AMO submissions).
- Chromium-only permission `offscreen` is **omitted** from the Firefox manifest; clipboard clear uses the Firefox background path.
