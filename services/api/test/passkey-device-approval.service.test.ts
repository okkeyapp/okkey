import test from "node:test";
import assert from "node:assert/strict";
import { createHash, createSign, generateKeyPairSync, randomBytes } from "node:crypto";
import type { AuthenticationResponseJSON } from "@simplewebauthn/server";
import { createTestApiConfig } from "./test-api-config.ts";
import {
  PasskeyDeviceApprovalError,
  PasskeyDeviceApprovalService,
} from "../src/webauthn/passkey-device-approval.ts";
import { shareWrapBodyRejection } from "../src/routes/passkey-device-approval.ts";
import type { WebAuthnCredentialRecord } from "../src/webauthn/repository.ts";
import { hybridDeviceShareBytes } from "./hybrid-share-fixture.ts";

const SHARE = hybridDeviceShareBytes(9);
const SHARE_B64 = Buffer.from(SHARE).toString("base64");
const OTHER_SHARE = hybridDeviceShareBytes(1);

class MemoryRedis {
  private readonly values = new Map<string, string>();

  async setWithTtl(key: string, value: string): Promise<void> {
    this.values.set(key, value);
  }

  async get(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }

  async del(key: string): Promise<number> {
    return this.values.delete(key) ? 1 : 0;
  }

  async incr(key: string): Promise<number> {
    const next = Number(this.values.get(key) ?? "0") + 1;
    this.values.set(key, String(next));
    return next;
  }

  async expire(): Promise<boolean> {
    return true;
  }

  async setIfNotExistsWithTtl(key: string, value: string): Promise<boolean> {
    if (this.values.has(key)) {
      return false;
    }
    this.values.set(key, value);
    return true;
  }
}

class MemoryCredentials {
  records: WebAuthnCredentialRecord[] = [];

  async findByIdForUser(userId: string, credentialRowId: string) {
    return this.records.find((row) => row.userId === userId && row.id === credentialRowId) ?? null;
  }

  async findByCredentialId(credentialId: string) {
    return this.records.find((row) => row.credentialId === credentialId) ?? null;
  }

  async listByUserId(userId: string) {
    return this.records.filter((row) => row.userId === userId);
  }

  async updateSignCount(credentialRowId: string, signCount: number) {
    const row = this.records.find((item) => item.id === credentialRowId);
    if (row) {
      row.signCount = signCount;
    }
  }

  async saveShareWrap(input: {
    userId: string;
    credentialRowId: string;
    shareWrap: Uint8Array;
    shareWrapSalt: Uint8Array;
  }) {
    const row = this.records.find(
      (item) => item.userId === input.userId && item.id === input.credentialRowId,
    );
    if (!row) {
      return false;
    }
    row.shareWrap = input.shareWrap;
    row.shareWrapSalt = input.shareWrapSalt;
    row.shareWrapVersion = 1;
    return true;
  }
}

class MemoryDevices {
  writes: Uint8Array[] = [];

  async approvePendingWithClientShare(input: { deviceShare: Uint8Array }) {
    this.writes.push(input.deviceShare);
    assert.notDeepEqual(input.deviceShare, OTHER_SHARE);
    return "approved" as const;
  }
}

function coseEs256(x: Buffer, y: Buffer): Uint8Array {
  return Uint8Array.from(
    Buffer.concat([
      Buffer.from([0xa5, 0x01, 0x02, 0x03, 0x26, 0x20, 0x01, 0x21, 0x58, 0x20]),
      x,
      Buffer.from([0x22, 0x58, 0x20]),
      y,
    ]),
  );
}

function authenticator(rpId = "localhost") {
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const jwk = publicKey.export({ format: "jwk" }) as { x: string; y: string };
  const credentialId = randomBytes(16).toString("base64url");
  const publicKeyCose = coseEs256(
    Buffer.from(jwk.x, "base64url"),
    Buffer.from(jwk.y, "base64url"),
  );

  function assertion(input: {
    challenge: string;
    counter: number;
    uv?: boolean;
    badSignature?: boolean;
  }): AuthenticationResponseJSON {
    const rpHash = createHash("sha256").update(rpId).digest();
    const authData = Buffer.alloc(37);
    rpHash.copy(authData, 0);
    authData[32] = input.uv === false ? 0x01 : 0x05;
    authData.writeUInt32BE(input.counter, 33);
    const clientData = JSON.stringify({
      type: "webauthn.get",
      challenge: input.challenge,
      origin: "http://localhost:5173",
      crossOrigin: false,
    });
    const clientDataHash = createHash("sha256").update(clientData).digest();
    let signature = createSign("SHA256")
      .update(Buffer.concat([authData, clientDataHash]))
      .sign(privateKey);
    if (input.badSignature) {
      signature = Buffer.from(signature);
      signature[signature.length - 1] ^= 0xff;
    }
    return {
      id: credentialId,
      rawId: credentialId,
      type: "public-key",
      authenticatorAttachment: "platform",
      clientExtensionResults: {},
      response: {
        clientDataJSON: Buffer.from(clientData).toString("base64url"),
        authenticatorData: authData.toString("base64url"),
        signature: signature.toString("base64url"),
      },
    };
  }

  return { credentialId, publicKeyCose, assertion };
}

function createHarness() {
  const redis = new MemoryRedis();
  const credentials = new MemoryCredentials();
  const devices = new MemoryDevices();
  const logs: Array<Record<string, unknown>> = [];
  let seq = 0;
  const authn = authenticator();
  const record: WebAuthnCredentialRecord = {
    id: "cred-row-1",
    userId: "user-1",
    credentialId: authn.credentialId,
    publicKey: authn.publicKeyCose,
    signCount: 0,
    transports: ["internal"],
    authenticatorAttachment: "platform",
    aaguid: null,
    name: "Passkey",
    backedUp: true,
    createdAt: new Date().toISOString(),
    lastUsedAt: null,
  };
  credentials.records.push(record);
  const service = new PasskeyDeviceApprovalService({
    redis,
    credentials: credentials as never,
    devices,
    config: createTestApiConfig(),
    log: {
      info(_message, extra) {
        logs.push(extra ?? {});
      },
      warn() {},
    },
    generateId: () => `challenge-${++seq}`,
  });
  return { service, credentials, devices, logs, authn, record };
}

const wrapBytes = Uint8Array.from([1, ...new Uint8Array(72).fill(4)]);

test("share wrap body rejects a PRF output or plaintext share", () => {
  assert.equal(shareWrapBodyRejection({ share_wrap: "abc" }), null);
  assert.equal(shareWrapBodyRejection({ prf_output: "secret" }), "PASSKEY_SHARE_WRAP_REJECTED");
  assert.equal(shareWrapBodyRejection({ device_share: SHARE_B64 }), "PASSKEY_SHARE_WRAP_REJECTED");
});

test("passkey approval stores the client share after a user-verified assertion", async () => {
  const { service, credentials, devices, logs, authn } = createHarness();
  const wrapOptions = await service.shareWrapOptions({
    userId: "user-1",
    credentialRowId: "cred-row-1",
    requestIp: "203.0.113.5",
  });
  await service.shareWrapVerify({
    userId: "user-1",
    credentialRowId: "cred-row-1",
    challengeId: wrapOptions.challengeId,
    response: authn.assertion({ challenge: wrapOptions.options.challenge, counter: 1 }),
    shareWrapB64: Buffer.from(wrapBytes).toString("base64"),
    requestIp: "203.0.113.5",
  });
  assert.equal(credentials.records[0]?.shareWrapVersion, 1);
  assert.equal(credentials.records[0]?.signCount, 1);

  const approval = await service.approvalOptions({
    userId: "user-1",
    deviceId: "42",
    requestIp: "203.0.113.5",
  });
  assert.equal(approval.credentials.length, 1);
  assert.equal(approval.credentials[0]?.credentialId, authn.credentialId);

  const result = await service.approvalVerify({
    userId: "user-1",
    deviceId: "42",
    challengeId: approval.challengeId,
    response: authn.assertion({ challenge: approval.options.challenge, counter: 2 }),
    deviceShareB64: SHARE_B64,
    requestIp: "203.0.113.5",
  });
  assert.deepEqual(result, { deviceId: "42", status: "trusted" });
  assert.equal(devices.writes.length, 1);
  assert.deepEqual(devices.writes[0], SHARE);
  const serialized = JSON.stringify(logs);
  assert.match(serialized, /"outcome":"approved"/);
  assert.equal(serialized.includes(SHARE_B64), false);
  assert.equal(serialized.includes("prf"), false);
});

test("passkey approval rejects a missing UV flag and a replayed challenge", async () => {
  const { service, devices, authn } = createHarness();
  const wrapOptions = await service.shareWrapOptions({
    userId: "user-1",
    credentialRowId: "cred-row-1",
    requestIp: "203.0.113.5",
  });
  await service.shareWrapVerify({
    userId: "user-1",
    credentialRowId: "cred-row-1",
    challengeId: wrapOptions.challengeId,
    response: authn.assertion({ challenge: wrapOptions.options.challenge, counter: 1 }),
    shareWrapB64: Buffer.from(wrapBytes).toString("base64"),
    requestIp: "203.0.113.5",
  });
  const approval = await service.approvalOptions({
    userId: "user-1",
    deviceId: "42",
    requestIp: "203.0.113.9",
  });
  await assert.rejects(
    () =>
      service.approvalVerify({
        userId: "user-1",
        deviceId: "42",
        challengeId: approval.challengeId,
        response: authn.assertion({
          challenge: approval.options.challenge,
          counter: 2,
          uv: false,
        }),
        deviceShareB64: SHARE_B64,
        requestIp: "203.0.113.9",
      }),
    (error: unknown) =>
      error instanceof PasskeyDeviceApprovalError &&
      error.code === "PASSKEY_APPROVAL_VERIFICATION_FAILED",
  );
  assert.equal(devices.writes.length, 0);

  const again = await service.approvalOptions({
    userId: "user-1",
    deviceId: "42",
    requestIp: "203.0.113.9",
  });
  const response = authn.assertion({ challenge: again.options.challenge, counter: 3 });
  await service.approvalVerify({
    userId: "user-1",
    deviceId: "42",
    challengeId: again.challengeId,
    response,
    deviceShareB64: SHARE_B64,
    requestIp: "203.0.113.9",
  });
  await assert.rejects(
    () =>
      service.approvalVerify({
        userId: "user-1",
        deviceId: "42",
        challengeId: again.challengeId,
        response,
        deviceShareB64: SHARE_B64,
        requestIp: "203.0.113.9",
      }),
    (error: unknown) =>
      error instanceof PasskeyDeviceApprovalError && error.code === "PASSKEY_APPROVAL_REPLAY",
  );
  assert.equal(devices.writes.length, 1);
});

test("passkey approval rate-limits options and verification failures", async () => {
  const { service, authn } = createHarness();
  const wrapOptions = await service.shareWrapOptions({
    userId: "user-1",
    credentialRowId: "cred-row-1",
    requestIp: "198.51.100.8",
  });
  await service.shareWrapVerify({
    userId: "user-1",
    credentialRowId: "cred-row-1",
    challengeId: wrapOptions.challengeId,
    response: authn.assertion({ challenge: wrapOptions.options.challenge, counter: 1 }),
    shareWrapB64: Buffer.from(wrapBytes).toString("base64"),
    requestIp: "198.51.100.8",
  });

  for (let i = 0; i < 5; i += 1) {
    const options = await service.approvalOptions({
      userId: "user-1",
      deviceId: "42",
      requestIp: "198.51.100.8",
    });
    await assert.rejects(
      () =>
        service.approvalVerify({
          userId: "user-1",
          deviceId: "42",
          challengeId: options.challengeId,
          response: authn.assertion({
            challenge: options.options.challenge,
            counter: i + 2,
            badSignature: true,
          }),
          deviceShareB64: SHARE_B64,
          requestIp: "198.51.100.8",
        }),
      (error: unknown) =>
        error instanceof PasskeyDeviceApprovalError &&
        error.code === "PASSKEY_APPROVAL_VERIFICATION_FAILED",
    );
  }

  await assert.rejects(
    () =>
      service.approvalOptions({
        userId: "user-1",
        deviceId: "42",
        requestIp: "198.51.100.8",
      }),
    (error: unknown) =>
      error instanceof PasskeyDeviceApprovalError &&
      error.code === "PASSKEY_APPROVAL_RATE_LIMITED",
  );
});

test("approval options are rate limited per user before a wrap is required", async () => {
  const { service } = createHarness();
  for (let i = 0; i < 10; i += 1) {
    await assert.rejects(
      () =>
        service.approvalOptions({
          userId: "user-1",
          deviceId: "42",
          requestIp: "198.51.100.20",
        }),
      (error: unknown) =>
        error instanceof PasskeyDeviceApprovalError &&
        error.code === "PASSKEY_SHARE_WRAP_MISSING",
    );
  }
  await assert.rejects(
    () =>
      service.approvalOptions({
        userId: "user-1",
        deviceId: "42",
        requestIp: "198.51.100.20",
      }),
    (error: unknown) =>
      error instanceof PasskeyDeviceApprovalError &&
      error.code === "PASSKEY_APPROVAL_RATE_LIMITED",
  );
});
