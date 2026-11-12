# Rebuild the Firefox store package from this sources archive

Extract the archive, then from its root (the directory that contains `package.json` and `yarn.lock`):

```bash
node scripts/ensure-crypto-wasm-dist.mjs
yarn install --frozen-lockfile
yarn zip:extension:firefox
```

Needs Node `>=25 <26`, Yarn `1.22.x`, Rust (`rust-toolchain.toml`), and `wasm-pack`. `yarn zip:extension:firefox` builds the crypto WASM when `packages/crypto/dist` is still the install placeholder.

Outputs land in `apps/extension/output/` (`*-firefox.zip` and a new `*-sources.zip`). Full layout notes: [SOURCES.md](./SOURCES.md).
