import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

import {
  decodeCapsuleKeyFragment,
  decryptCapsuleMetadata,
  encodeCapsuleKeyFragment,
  encryptCapsuleMetadata,
  generateCapsuleKey,
  initCrypto,
  unwrapCapsuleKeyForOwner,
  wrapCapsuleKeyForOwner,
} from "../dist/index.js";

const wasmBytes = await readFile(new URL("../dist/okkey_crypto_engine_bg.wasm", import.meta.url));
await initCrypto({ module_or_path: wasmBytes });

test("capsule metadata, owner wrap and fragment round-trip", async () => {
  const accountVaultKey = crypto.getRandomValues(new Uint8Array(32));
  const capsuleKey = await generateCapsuleKey();
  const metadata = new TextEncoder().encode(JSON.stringify({ name: "Capsule" }));

  const encrypted = await encryptCapsuleMetadata(capsuleKey, metadata);
  const wrapped = await wrapCapsuleKeyForOwner(accountVaultKey, capsuleKey);
  const unwrapped = await unwrapCapsuleKeyForOwner(accountVaultKey, wrapped);
  const fragment = encodeCapsuleKeyFragment(capsuleKey);
  const fromFragment = decodeCapsuleKeyFragment(fragment);

  assert.deepEqual(unwrapped, capsuleKey);
  assert.deepEqual(fromFragment, capsuleKey);
  assert.deepEqual(await decryptCapsuleMetadata(unwrapped, encrypted), metadata);
  assert.doesNotMatch(fragment, /[+/=]/u);
});

test("capsule fragment rejects malformed key material", () => {
  assert.throws(() => decodeCapsuleKeyFragment("not-a-key"), /invalid capsule key fragment/u);
});
