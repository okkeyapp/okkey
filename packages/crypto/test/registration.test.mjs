import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

import {
  buildRegistrationCryptoArtifacts,
  initCrypto,
  reconstructVaultKeyWithMasterPassword,
} from "../dist/index.js";

const wasmBytes = await readFile(new URL("../dist/okkey_crypto_engine_bg.wasm", import.meta.url));
await initCrypto({ module_or_path: wasmBytes });

test("q2-6: registration split-key shares are opaque 32-byte (not hybrid KEM)", async () => {
  const password = new TextEncoder().encode("q2-6-split-key-test-password");
  const material = await buildRegistrationCryptoArtifacts(password);

  assert.equal(material.serverKeyShare.length, 32);
  assert.equal(material.deviceShare.length, 32);
  assert.equal(material.vaultKey.length, 32);
  // PQ identity is separate from share-B transport.
  assert.ok(material.userPublicPqKey.length > 32);

  const recovered = await reconstructVaultKeyWithMasterPassword({
    masterPasswordUtf8: password,
    serverKeyShare: material.serverKeyShare,
    deviceShare: material.deviceShare,
    passwordKdfSalt: material.passwordKdfSalt,
    passwordKdfParamsVersion: material.passwordKdfParamsVersion,
  });
  assert.deepEqual(recovered, material.vaultKey);
});
