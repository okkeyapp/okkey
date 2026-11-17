import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  buildRegistrationCryptoArtifacts,
  classifySplitKeyShareBWire,
  initCrypto,
  openPasskeyShareWrap,
  openStoredSplitKeyShareB,
  reconstructVaultKeyWithMasterPassword,
  sealPasskeyShareWrap,
  wrapSplitKeyShareB,
} from "../dist/index.js";

const wasmBytes = await readFile(
  new URL("../dist/okkey_crypto_engine_bg.wasm", import.meta.url),
);
await initCrypto({ module_or_path: wasmBytes });

function random32() {
  return crypto.getRandomValues(new Uint8Array(32));
}

/**
 * End-to-end crypto path for TSK-158: PRF wrap must seal raw share B.
 * After approval, the pending device re-wraps that share for its wrap keys,
 * then master-password unlock reconstructs the same vault key.
 */
test("passkey PRF wrap of raw share B then pending re-wrap unlocks with master password", async () => {
  const password = new TextEncoder().encode("passkey-approve-unlock-password");
  const phone = await buildRegistrationCryptoArtifacts(password);
  const pending = await buildRegistrationCryptoArtifacts(
    new TextEncoder().encode("pending-device-bootstrap"),
  );

  assert.equal(classifySplitKeyShareBWire(phone.deviceShare), "legacy");
  assert.equal(classifySplitKeyShareBWire(phone.wrappedDeviceShare), "hybrid");

  const prfOutput = random32();
  const salt = random32();
  const credentialId = "cred-approve-unlock";

  // Bug that shipped: sealing the phone hybrid frame under PRF. Opening that
  // and posting it as the pending device share leaves the wrong recipient
  // ciphertext on the new device, so master-password unlock fails.
  const badWrap = await sealPasskeyShareWrap({
    deviceShare: phone.wrappedDeviceShare,
    prfOutput,
    salt,
    credentialId,
  });
  const openedHybrid = await openPasskeyShareWrap({
    wrap: badWrap,
    prfOutput,
    salt,
    credentialId,
  });
  assert.equal(classifySplitKeyShareBWire(openedHybrid), "hybrid");
  await assert.rejects(
    () =>
      openStoredSplitKeyShareB({
        stored: openedHybrid,
        recipientEd25519Seed: pending.shareWrap.ed25519Seed,
        recipientMlkemDecapsulationKey: pending.shareWrap.mlkemDecapsulationKey,
      }),
    /decrypt|DECRYPT|failed|aead|recipient|wrap/i,
  );

  const wrap = await sealPasskeyShareWrap({
    deviceShare: phone.deviceShare,
    prfOutput,
    salt,
    credentialId,
  });
  const rawShare = await openPasskeyShareWrap({
    wrap,
    prfOutput,
    salt,
    credentialId,
  });
  assert.equal(classifySplitKeyShareBWire(rawShare), "legacy");
  assert.deepEqual(rawShare, phone.deviceShare);

  const forPending = await wrapSplitKeyShareB({
    share: rawShare,
    recipientEd25519PublicKey: pending.shareWrap.ed25519PublicKey,
    recipientMlkemEncapsulationKey: pending.shareWrap.mlkemEncapsulationKey,
  });
  assert.equal(classifySplitKeyShareBWire(forPending), "hybrid");

  const openedOnPending = await openStoredSplitKeyShareB({
    stored: forPending,
    recipientEd25519Seed: pending.shareWrap.ed25519Seed,
    recipientMlkemDecapsulationKey: pending.shareWrap.mlkemDecapsulationKey,
  });
  assert.deepEqual(openedOnPending, phone.deviceShare);

  const unlocked = await reconstructVaultKeyWithMasterPassword({
    masterPasswordUtf8: password,
    serverKeyShare: phone.serverKeyShare,
    deviceShare: openedOnPending,
    passwordKdfSalt: phone.passwordKdfSalt,
    passwordKdfParamsVersion: phone.passwordKdfParamsVersion,
  });
  assert.deepEqual(unlocked, phone.vaultKey);
});
