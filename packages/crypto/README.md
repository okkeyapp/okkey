# @okkey/crypto

JS/TS bindings for Okkey Rust crypto engine.

## Build

```bash
yarn --cwd packages/crypto build
```

This runs `wasm-pack` in `rust/crypto-engine` and writes the WASM package to `packages/crypto/dist`.

## Usage

```ts
import { initCrypto, kdfDerive } from "@okkey/crypto";

await initCrypto();
const key = kdfDerive(password, salt, { mCost: 19456, tCost: 2, pCost: 1 }, 32);
```

