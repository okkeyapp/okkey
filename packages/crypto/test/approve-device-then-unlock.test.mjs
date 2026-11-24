import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  buildRegistrationCryptoArtifacts,
  classifySplitKeyShareBWire,
  initCrypto,
  openStoredSplitKeyShareB,
  reconstructVaultKeyWithMasterPassword,
  wrapSplitKeyShareB,
} from "../dist/index.js";

const wasmBytes = await readFile(
  new URL("../dist/okkey_crypto_engine_bg.wasm", import.meta.url),
);
await initCrypto({ module_or_path: wasmBytes });

/**
 * Trusted-device (or passkey) approval must leave the new device able to open
 * the stored hybrid with its wrap keys and reconstruct VaultKey from the
 * master password. A leftover placeholder hybrid opens successfully but yields
 * the wrong key — the lock screen then shows "Wrong master password".
 */
test("approve new device then unlock with master password", async () => {
  const password = new TextEncoder().encode("approve-then-unlock-password");
  const phone = await buildRegistrationCryptoArtifacts(password);
  const pending = await buildRegistrationCryptoArtifacts(
    new TextEncoder().encode("pending-bootstrap-only"),
  );

  // Pending registration publishes a random placeholder sealed to its wrap keys.
  const placeholderRaw = crypto.getRandomValues(new Uint8Array(32));
  const placeholderHybrid = await wrapSplitKeyShareB({
    share: placeholderRaw,
    recipientEd25519PublicKey: pending.shareWrap.ed25519PublicKey,
    recipientMlkemEncapsulationKey: pending.shareWrap.mlkemEncapsulationKey,
  });
  assert.equal(classifySplitKeyShareBWire(placeholderHybrid), "hybrid");

  // Opening the placeholder "succeeds" but reconstructs the wrong vault key.
  const openedPlaceholder = await openStoredSplitKeyShareB({
    stored: placeholderHybrid,
    recipientEd25519Seed: pending.shareWrap.ed25519Seed,
    recipientMlkemDecapsulationKey: pending.shareWrap.mlkemDecapsulationKey,
  });
  assert.deepEqual(openedPlaceholder, placeholderRaw);
  const wrongKey = await reconstructVaultKeyWithMasterPassword({
    masterPasswordUtf8: password,
    serverKeyShare: phone.serverKeyShare,
    deviceShare: openedPlaceholder,
    passwordKdfSalt: phone.passwordKdfSalt,
    passwordKdfParamsVersion: phone.passwordKdfParamsVersion,
  });
  assert.notDeepEqual(wrongKey, phone.vaultKey);

  // Approval reseals the phone's raw share B for the pending wrap public keys.
  const approvedHybrid = await wrapSplitKeyShareB({
    share: phone.deviceShare,
    recipientEd25519PublicKey: pending.shareWrap.ed25519PublicKey,
    recipientMlkemEncapsulationKey: pending.shareWrap.mlkemEncapsulationKey,
  });

  // Unlock on the new device must use the approved hybrid, not the placeholder.
  const openedApproved = await openStoredSplitKeyShareB({
    stored: approvedHybrid,
    recipientEd25519Seed: pending.shareWrap.ed25519Seed,
    recipientMlkemDecapsulationKey: pending.shareWrap.mlkemDecapsulationKey,
  });
  assert.deepEqual(openedApproved, phone.deviceShare);

  const unlocked = await reconstructVaultKeyWithMasterPassword({
    masterPasswordUtf8: password,
    serverKeyShare: phone.serverKeyShare,
    deviceShare: openedApproved,
    passwordKdfSalt: phone.passwordKdfSalt,
    passwordKdfParamsVersion: phone.passwordKdfParamsVersion,
  });
  assert.deepEqual(unlocked, phone.vaultKey);
});
