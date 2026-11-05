import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

import {
  CAPSULE_GUEST_KEY_HYBRID_RECIPIENT,
  activeCapsuleGuestKeyDelivery,
  decodeCapsuleKeyFragment,
  decryptCapsuleMetadata,
  encodeCapsuleKeyFragment,
  encryptCapsuleMetadata,
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

test("guest key reader keeps the legacy fragment; hybrid recipient is not selected", async () => {
  const capsuleKey = await generateCapsuleKey();
  const fragment = encodeCapsuleKeyFragment(capsuleKey);
  const delivery = activeCapsuleGuestKeyDelivery();
  assert.equal(delivery.id, "legacy_fragment");
  assert.equal(CAPSULE_GUEST_KEY_HYBRID_RECIPIENT, "undecided");
  assert.deepEqual(readCapsuleGuestKey(fragment), capsuleKey);
  assert.deepEqual(delivery.importMaterial(delivery.exportMaterial(capsuleKey)), capsuleKey);
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
