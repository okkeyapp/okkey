import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { initSync } from "@okkey/crypto-wasm";
import { createMemoryVaultUnlockAttemptStore } from "../src/account/vault-unlock-attempts.ts";
import {
  createAccountVaultUnlockRoute,
  vaultUnlockAttestationMessageBytes as serverAttestationMessageBytes,
  verifyVaultUnlockAttestation,
} from "../src/routes/account-vault-unlock.ts";

const cryptoDist = join(dirname(fileURLToPath(import.meta.url)), "../../../packages/crypto/dist");
initSync(readFileSync(join(cryptoDist, "okkey_crypto_engine_bg.wasm")));

type CryptoSdk = {
  b64Encode(data: Uint8Array): string;
  buildRegistrationCryptoArtifacts(masterPasswordUtf8: Uint8Array): Promise<{
    vaultKey: Uint8Array;
    userPublicKey: Uint8Array;
    encryptedPrivateKey: Uint8Array;
  }>;
  buildVaultUnlockAttestation(input: {
    userId: string;
    vaultKey: Uint8Array;
    encryptedPrivateKeyPayloadB64: string;
    recordedAt?: string;
  }): Promise<{
    purpose: string;
    user_id: string;
    recorded_at: string;
    signature: string;
  }>;
  vaultUnlockAttestationMessageBytes(input: { userId: string; recordedAt: string }): Uint8Array;
};

const MAX_AGE_MS = 60_000;

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

test("client unlock attestation verifies on the server and a forgery does not stamp unlock", async () => {
  const cryptoSdk = (await import(
    "../../../packages/crypto/dist/index.js"
  )) as CryptoSdk;

  const password = new TextEncoder().encode("unlock-attestation-cross-test-password");
  const material = await cryptoSdk.buildRegistrationCryptoArtifacts(password);
  const userId = "user-unlock-attestation";
  const recordedAt = "2026-10-23T15:00:00.000Z";
  const recordedMs = Date.parse(recordedAt);
  const payloadB64 = cryptoSdk.b64Encode(material.encryptedPrivateKey);
  const publicKeyBase64 = cryptoSdk.b64Encode(material.userPublicKey);

  const attestation = await cryptoSdk.buildVaultUnlockAttestation({
    userId,
    vaultKey: material.vaultKey,
    encryptedPrivateKeyPayloadB64: payloadB64,
    recordedAt,
  });
  assert.equal(attestation.purpose, "account.vault_unlock");
  assert.equal(attestation.user_id, userId);
  assert.equal(Buffer.from(attestation.signature, "base64").length, 64);

  const clientBytes = cryptoSdk.vaultUnlockAttestationMessageBytes({ userId, recordedAt });
  const serverBytes = serverAttestationMessageBytes({ userId, recordedAt });
  assert.deepEqual(Buffer.from(serverBytes), Buffer.from(clientBytes));

  const fresh = {
    userId,
    publicKeyBase64,
    attestation: {
      userId: attestation.user_id,
      recordedAt: attestation.recorded_at,
      signature: attestation.signature,
    },
    now: recordedMs,
  };
  assert.equal(verifyVaultUnlockAttestation(fresh), true);
  assert.equal(
    verifyVaultUnlockAttestation({ ...fresh, now: recordedMs + MAX_AGE_MS }),
    true,
  );
  assert.equal(
    verifyVaultUnlockAttestation({ ...fresh, now: recordedMs + MAX_AGE_MS + 1 }),
    false,
  );
  assert.equal(
    verifyVaultUnlockAttestation({ ...fresh, now: recordedMs - (MAX_AGE_MS + 1) }),
    false,
  );
  assert.equal(verifyVaultUnlockAttestation({ ...fresh, userId: "other-user" }), false);

  const forged = Buffer.from(attestation.signature, "base64");
  forged[0] ^= 0xff;
  assert.equal(
    verifyVaultUnlockAttestation({
      ...fresh,
      attestation: { ...fresh.attestation, signature: forged.toString("base64") },
    }),
    false,
  );

  const wrongKey = new Uint8Array(material.vaultKey);
  wrongKey[0] ^= 0xff;
  await assert.rejects(() =>
    cryptoSdk.buildVaultUnlockAttestation({
      userId,
      vaultKey: wrongKey,
      encryptedPrivateKeyPayloadB64: payloadB64,
      recordedAt,
    }),
  );

  const records = { count: 0 };
  const store = createMemoryVaultUnlockAttemptStore();
  const handler = createAccountVaultUnlockRoute(
    {
      recordVaultUnlock: async () => {
        records.count += 1;
        return true;
      },
      findById: async () => ({ publicKey: publicKeyBase64 }),
    },
    async () => userId,
    { attemptStore: store, now: () => recordedMs },
  );

  async function post(body: unknown): Promise<{ status: number; body: string }> {
    const req = {
      method: "POST",
      url: "/account/vault-unlock",
      body,
    } as IncomingMessage;
    const res = new MockResponse();
    await handler({
      req,
      res: res as unknown as ServerResponse,
      params: {},
      requestId: "req-attest",
    });
    return { status: res.statusCode, body: res.body };
  }

  const rejected = await post({
    attestation: {
      purpose: attestation.purpose,
      user_id: attestation.user_id,
      recorded_at: attestation.recorded_at,
      signature: forged.toString("base64"),
    },
  });
  assert.equal(rejected.status, 400);
  assert.equal(JSON.parse(rejected.body).error, "INVALID_VAULT_UNLOCK");
  assert.equal(records.count, 0);

  const accepted = await post({
    attestation: {
      purpose: attestation.purpose,
      user_id: attestation.user_id,
      recorded_at: attestation.recorded_at,
      signature: attestation.signature,
    },
  });
  assert.equal(accepted.status, 200);
  assert.equal(JSON.parse(accepted.body).recorded, true);
  assert.equal(records.count, 1);
});
