import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  buildRegistrationCryptoArtifacts,
  classifySplitKeyShareBWire,
  initCrypto,
  openStoredSplitKeyShareB,
  reconstructVaultKeyWithMasterPassword,
  splitKeyShareBWrapPublicKeys,
  wrapSplitKeyShareB,
} from "../dist/index.js";

const wasmBytes = await readFile(
  new URL("../dist/okkey_crypto_engine_bg.wasm", import.meta.url),
);
await initCrypto({ module_or_path: wasmBytes });

test("share B hybrid frame round-trips and legacy 32 bytes still open", async () => {
  const password = new TextEncoder().encode("share-b-hybrid-wrap-password");
  const material = await buildRegistrationCryptoArtifacts(password);

  assert.equal(material.deviceShare.length, 32);
  assert.equal(classifySplitKeyShareBWire(material.deviceShare), "legacy");
  assert.equal(classifySplitKeyShareBWire(material.wrappedDeviceShare), "hybrid");
  assert.ok(material.wrappedDeviceShare.length > 32);

  const opened = await openStoredSplitKeyShareB({
    stored: material.wrappedDeviceShare,
    recipientEd25519Seed: material.shareWrap.ed25519Seed,
    recipientMlkemDecapsulationKey: material.shareWrap.mlkemDecapsulationKey,
  });
  assert.deepEqual(opened, material.deviceShare);

  const legacy = await openStoredSplitKeyShareB({ stored: material.deviceShare });
  assert.deepEqual(legacy, material.deviceShare);

  const recovered = await reconstructVaultKeyWithMasterPassword({
    masterPasswordUtf8: password,
    serverKeyShare: material.serverKeyShare,
    deviceShare: opened,
    passwordKdfSalt: material.passwordKdfSalt,
    passwordKdfParamsVersion: material.passwordKdfParamsVersion,
  });
  assert.deepEqual(recovered, material.vaultKey);
});

test("share B frame can be resealed to another device wrap key", async () => {
  const password = new TextEncoder().encode("share-b-reseal-password");
  const material = await buildRegistrationCryptoArtifacts(password);
  const next = await buildRegistrationCryptoArtifacts(new TextEncoder().encode("other-device"));
  const resealed = await wrapSplitKeyShareB({
    share: material.deviceShare,
    recipientEd25519PublicKey: next.shareWrap.ed25519PublicKey,
    recipientMlkemEncapsulationKey: next.shareWrap.mlkemEncapsulationKey,
  });
  const pubs = splitKeyShareBWrapPublicKeys(resealed);
  assert.deepEqual(pubs?.ed25519PublicKey, next.shareWrap.ed25519PublicKey);
  const opened = await openStoredSplitKeyShareB({
    stored: resealed,
    recipientEd25519Seed: next.shareWrap.ed25519Seed,
    recipientMlkemDecapsulationKey: next.shareWrap.mlkemDecapsulationKey,
  });
  assert.deepEqual(opened, material.deviceShare);
  await assert.rejects(
    () =>
      openStoredSplitKeyShareB({
        stored: resealed,
        recipientEd25519Seed: material.shareWrap.ed25519Seed,
        recipientMlkemDecapsulationKey: material.shareWrap.mlkemDecapsulationKey,
      }),
    /decrypt|DECRYPT|failed|aead/i,
  );
});
