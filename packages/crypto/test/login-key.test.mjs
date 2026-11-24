import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { kdf_derive } from "@okkey/crypto-wasm";

import {
  LOGIN_KDF_DOMAIN,
  OKKEY_PASSWORD_KDF_PARAMS_V1,
  deriveLoginKey,
  derivePasswordShareC,
  initCrypto,
  loginKdfSaltForEmail,
  reconstructVaultKeyWithMasterPassword,
} from "../dist/index.js";

const wasmBytes = await readFile(new URL("../dist/okkey_crypto_engine_bg.wasm", import.meta.url));
await initCrypto({ module_or_path: wasmBytes });

const password = new TextEncoder().encode("login-key-domain-separation-test");
const email = "User@Example.com";

test("login key is not password share C and does not rebuild VaultKey", async () => {
  const loginKey = await deriveLoginKey({ masterPasswordUtf8: password, email });
  const vaultSalt = new Uint8Array(16).fill(9);
  const shareC = await derivePasswordShareC({
    masterPasswordUtf8: password,
    passwordKdfSalt: vaultSalt,
    passwordKdfParamsVersion: 2,
  });
  assert.equal(loginKey.length, 32);
  assert.notDeepEqual(loginKey, shareC);

  const emailSalt = await loginKdfSaltForEmail(email);
  const bare = kdf_derive(
    password,
    emailSalt,
    OKKEY_PASSWORD_KDF_PARAMS_V1.mCost,
    OKKEY_PASSWORD_KDF_PARAMS_V1.tCost,
    OKKEY_PASSWORD_KDF_PARAMS_V1.pCost,
    32,
  );
  assert.notDeepEqual(loginKey, bare);
  assert.ok(LOGIN_KDF_DOMAIN.includes("login"));

  const serverShare = new Uint8Array(32).fill(1);
  const deviceShare = new Uint8Array(32).fill(2);
  const vaultKey = await reconstructVaultKeyWithMasterPassword({
    masterPasswordUtf8: password,
    serverKeyShare: serverShare,
    deviceShare,
    passwordKdfSalt: vaultSalt,
    passwordKdfParamsVersion: 2,
  });
  const forged = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    forged[i] = serverShare[i] ^ deviceShare[i] ^ loginKey[i];
  }
  assert.notDeepEqual(forged, vaultKey);
});

test("login key depends on the normalized email", async () => {
  const a = await deriveLoginKey({ masterPasswordUtf8: password, email: "a@example.com" });
  const b = await deriveLoginKey({ masterPasswordUtf8: password, email: "b@example.com" });
  const again = await deriveLoginKey({
    masterPasswordUtf8: password,
    email: "  A@Example.com ",
  });
  const normalized = await deriveLoginKey({
    masterPasswordUtf8: password,
    email: "a@example.com",
  });
  assert.notDeepEqual(a, b);
  assert.deepEqual(again, normalized);
});
