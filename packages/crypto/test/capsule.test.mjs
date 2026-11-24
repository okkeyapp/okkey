import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

import {
  CAPSULE_GUEST_KEY_HYBRID_RECIPIENT,
  decodeCapsuleKeyFragment,
  decryptCapsuleMetadata,
  encodeCapsuleKeyFragment,
  encryptCapsuleMetadata,
  exportCapsuleGuestKeyFragment,
  generateCapsuleKey,
  initCrypto,
  readCapsuleGuestKey,
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

test("new guest fragment is an ephemeral hybrid recipient; legacy #key= still opens", async () => {
  const capsuleKey = await generateCapsuleKey();
  const legacy = encodeCapsuleKeyFragment(capsuleKey);
  const next = await exportCapsuleGuestKeyFragment(capsuleKey);

  assert.equal(CAPSULE_GUEST_KEY_HYBRID_RECIPIENT, "ephemeral_v1");
  assert.deepEqual(await readCapsuleGuestKey(legacy), capsuleKey);
  assert.deepEqual(await readCapsuleGuestKey(next), capsuleKey);
  assert.notEqual(next, legacy);
  assert.doesNotMatch(next, /[+/=]/u);
  assert.throws(() => decodeCapsuleKeyFragment(next), /invalid capsule key fragment/u);
});

test("owner wrap is VaultKey AEAD and the guest fragment still round-trips", async () => {
  const accountVaultKey = crypto.getRandomValues(new Uint8Array(32));
  const capsuleKey = await generateCapsuleKey();
  const fragment = encodeCapsuleKeyFragment(capsuleKey);
  const ownerWrap = await wrapCapsuleKeyForOwner(accountVaultKey, capsuleKey);

  assert.equal(typeof fragment, "string");
  assert.ok(fragment.length > 0);
  assert.equal(decodeCapsuleKeyFragment(fragment).length, 32);
  assert.ok(ownerWrap.length > 24);
  assert.deepEqual(await unwrapCapsuleKeyForOwner(accountVaultKey, ownerWrap), capsuleKey);
});
