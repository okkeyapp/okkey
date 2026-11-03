import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { initSync } from "@okkey/crypto-wasm";
import { createApiApp } from "../src/app.ts";
import type { SessionService } from "../src/session/service.ts";
import type { UsersRepository } from "../src/storage/repositories.ts";
import { createTestApiConfig } from "./test-api-config.ts";

const cryptoDist = join(dirname(fileURLToPath(import.meta.url)), "../../../packages/crypto/dist");
initSync(readFileSync(join(cryptoDist, "okkey_crypto_engine_bg.wasm")));

const {
  buildRegistrationCryptoArtifacts,
  decryptUserIdentityFromEncryptedBlob,
  derivePasswordShareC,
  generateRecoverySecret,
  reconstructVaultKeyWithMasterPassword,
  rebalanceServerShareForNewPassword,
  registrationArtifactsToWire,
  unwrapVaultKeyWithRecoverySecret,
  wipeBytes,
  wrapVaultKeyWithRecoverySecret,
} = await import("../../../packages/crypto/dist/index.js");

class MockResponse {
  statusCode = 200;
  writableEnded = false;
  body = "";

  setHeader(_name: string, _value: string): void {}

  end(chunk?: string): void {
    if (chunk) {
      this.body += chunk;
    }
    this.writableEnded = true;
  }
}

function loggerStub() {
  return {
    info(_message: string, _extra?: Record<string, unknown>) {},
    warn(_message: string, _extra?: Record<string, unknown>) {},
    error(_message: string, _extra?: Record<string, unknown>) {},
  };
}

function bytesToBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

test("recovery key unwrap then master-password change round-trips the vault key", async () => {
  const originalPassword = new TextEncoder().encode("original-master-password");
  const material = await buildRegistrationCryptoArtifacts(originalPassword);
  const wire = registrationArtifactsToWire(material);
  const secret = await generateRecoverySecret();
  const secretBytes = new TextEncoder().encode(secret);
  const wrapped = await wrapVaultKeyWithRecoverySecret(material.vaultKey, secretBytes);
  wipeBytes(material.vaultKey);

  const recovered = await unwrapVaultKeyWithRecoverySecret(secretBytes, wrapped);
  assert.equal(recovered.length, 32);

  const nextPassword = new TextEncoder().encode("replacement-master-password");
  const rebalanced = await rebalanceServerShareForNewPassword({
    newMasterPasswordUtf8: nextPassword,
    vaultKey: recovered,
    deviceShare: material.deviceShare,
    passwordKdfParamsVersion: wire.password_kdf_params_version,
  });

  const unlocked = await reconstructVaultKeyWithMasterPassword({
    masterPasswordUtf8: nextPassword,
    serverKeyShare: rebalanced.serverKeyShare,
    deviceShare: material.deviceShare,
    passwordKdfSalt: rebalanced.passwordKdfSalt,
    passwordKdfParamsVersion: rebalanced.passwordKdfParamsVersion,
  });
  assert.deepEqual(unlocked, recovered);
  await decryptUserIdentityFromEncryptedBlob(unlocked, wire.encrypted_private_key.payload);

  const wrongKey = await reconstructVaultKeyWithMasterPassword({
    masterPasswordUtf8: originalPassword,
    serverKeyShare: rebalanced.serverKeyShare,
    deviceShare: material.deviceShare,
    passwordKdfSalt: rebalanced.passwordKdfSalt,
    passwordKdfParamsVersion: rebalanced.passwordKdfParamsVersion,
  });
  await assert.rejects(() =>
    decryptUserIdentityFromEncryptedBlob(wrongKey, wire.encrypted_private_key.payload),
  );
  wipeBytes(wrongKey);

  const changed: string[] = [];
  const users = {
    updateMasterPasswordShares: async (_userId: string, input: {
      serverKeyShare: Uint8Array;
      passwordKdfSalt: Uint8Array;
      passwordKdfParamsVersion: number;
    }) => {
      changed.push(bytesToBase64(input.serverKeyShare));
      assert.deepEqual(input.serverKeyShare, rebalanced.serverKeyShare);
      assert.deepEqual(input.passwordKdfSalt, rebalanced.passwordKdfSalt);
      return "2026-01-02T00:00:00.000Z";
    },
    recordVaultUnlock: async () => true,
  };
  const config = createTestApiConfig({ allowHeaderUserIdAuth: true });
  const app = createApiApp(config, loggerStub(), {
    sessionService: { resolveAccessToken: async () => null } as unknown as SessionService,
    usersRepository: users as unknown as UsersRepository,
  });
  const req = {
    method: "POST",
    url: "/account/master-password/change",
    headers: { "x-user-id": "42" },
    body: {
      server_key_share: bytesToBase64(rebalanced.serverKeyShare),
      password_kdf_salt: bytesToBase64(rebalanced.passwordKdfSalt),
      password_kdf_params_version: rebalanced.passwordKdfParamsVersion,
    },
  } as IncomingMessage;
  const res = new MockResponse();
  await app.handler()(req, res as unknown as ServerResponse);
  assert.equal(res.statusCode, 200);
  const payload = JSON.parse(res.body) as { master_password_changed_at: string };
  assert.equal(payload.master_password_changed_at, "2026-01-02T00:00:00.000Z");
  assert.equal(changed.length, 1);

  const shareC = await derivePasswordShareC({
    masterPasswordUtf8: nextPassword,
    passwordKdfSalt: rebalanced.passwordKdfSalt,
    passwordKdfParamsVersion: rebalanced.passwordKdfParamsVersion,
  });
  assert.equal(shareC.length, 32);
  wipeBytes(shareC);
  wipeBytes(recovered);
  wipeBytes(unlocked);
  wipeBytes(rebalanced.passwordShareC);
  wipeBytes(rebalanced.serverKeyShare);
  wipeBytes(originalPassword);
  wipeBytes(nextPassword);
  wipeBytes(material.deviceShare);
  wipeBytes(material.serverKeyShare);
});
