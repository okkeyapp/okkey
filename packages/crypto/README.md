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

## Registration (split-key)

After `POST /auth/email/confirm` with `nextStep: "registration"`, build wire fields for `POST /auth/register/complete`:

```ts
import {
  buildRegistrationCryptoArtifacts,
  registrationArtifactsToWire,
} from "@okkey/crypto";

const pwd = new TextEncoder().encode("master-password");
const cryptoOut = await buildRegistrationCryptoArtifacts(pwd);
const wire = registrationArtifactsToWire(cryptoOut);
// merge wire + auth_state_id + device_* fields → JSON body
```

Clear sensitive buffers (`vaultKey`, `deviceShare`, password bytes) in app code when done; do not log them.

