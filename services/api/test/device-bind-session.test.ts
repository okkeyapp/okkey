import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { IncomingMessage, ServerResponse } from "node:http";
import { initSync } from "@okkey/crypto-wasm";
import {
  deviceBindWrapSign,
  ed25519Keypair,
  ed25519Sign,
  encodeSplitKeyShareBFrame,
} from "@okkey/crypto";
import { createApiApp } from "../src/app.ts";
import { verifyDeviceBindWrapProof } from "../src/device/bind-proof.ts";
import { DeviceService } from "../src/device/service.ts";
import type { SessionService } from "../src/session/service.ts";
import { createTestApiConfig } from "./test-api-config.ts";

const DEVICE_ID = "1234567890123456789";
const cryptoDist = join(dirname(fileURLToPath(import.meta.url)), "../../../packages/crypto/dist");
let wasmReady = false;

function ensureWasm(): void {
  if (wasmReady) {
    return;
  }
  initSync(readFileSync(join(cryptoDist, "okkey_crypto_engine_bg.wasm")));
  wasmReady = true;
}

function b64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

function deviceKeys() {
  ensureWasm();
  const pair = ed25519Keypair();
  return { secret: pair.slice(0, 32), publicKey: pair.slice(32, 64) };
}

/** Hybrid share frame addressed to `wrapPublic`, with opaque ciphertext. */
function hybridShareForWrap(wrapPublic: Uint8Array, envelopeFill = 7): Uint8Array {
  const envelope = new Uint8Array(1148 + 48);
  envelope[0] = 1;
  envelope[1] = 1;
  envelope[2] = 1;
  envelope[3] = 0;
  envelope.fill(envelopeFill & 0xff, 4);
  return encodeSplitKeyShareBFrame({
    ed25519PublicKey: wrapPublic,
    mlkemEncapsulationKey: new Uint8Array(1184).fill(9),
    envelope,
  });
}

/** Unkeyed digest over stored share bytes — must not be accepted as a bind proof. */
function digestOfStoredShare(deviceShare: Uint8Array, message: Uint8Array): Buffer {
  const prefix = Buffer.from("okkey-device-bind-share-v1\n", "utf8");
  return createHash("sha256").update(prefix).update(deviceShare).update(message).digest();
}

class MockResponse {
  statusCode = 200;
  body = "";
  writableEnded = false;
  setHeader(): void {}
  end(chunk?: string): void {
    if (chunk) {
      this.body += chunk;
    }
    this.writableEnded = true;
  }
}

function loggerStub() {
  return {
    info() {},
    warn() {},
    error() {},
  };
}

test("bind-session requires a device-key signature and rejects reuse, expiry, and inactive devices", async () => {
  const keys = deviceKeys();
  const other = deviceKeys();
  const clock = { now: Date.parse("2026-01-01T00:00:00.000Z") };
  let deviceStatus = "trusted";
  let bound = false;
  const metadataNames: string[] = [];
  const publicKey = b64(keys.publicKey);

  const deviceService = new DeviceService({
    devices: {
      findOwnedDeviceAuth: async () =>
        deviceStatus === "missing"
          ? null
          : { id: DEVICE_ID, status: deviceStatus, devicePublicKey: publicKey },
      updateActiveDeviceMetadata: async (input: { deviceName?: string }) => {
        if (input.deviceName) {
          metadataNames.push(input.deviceName);
        }
        return null;
      },
    } as never,
    config: { deviceApprovalTtlSeconds: 60, publicAppBaseUrl: "https://app.test" },
    now: () => new Date(clock.now),
  });

  const sessionService = {
    hashAccessToken: (token: string) => `hash:${token}`,
    bindAccessTokenDevice: async () => {
      if (deviceStatus !== "trusted" && deviceStatus !== "pending") {
        return false;
      }
      bound = true;
      return true;
    },
    resolveAccessToken: async () => ({
      userId: "u1",
      deviceId: null,
      scope: null,
      tokenHash: "hash:tok",
    }),
  } as unknown as SessionService;

  async function call(method: string, url: string, body?: unknown) {
    const app = createApiApp(createTestApiConfig(), loggerStub(), {
      deviceService,
      sessionService,
    });
    const req = {
      method,
      url,
      headers: { authorization: "Bearer tok" },
      body,
    } as IncomingMessage;
    const res = new MockResponse();
    await app.handler()(req, res as unknown as ServerResponse);
    return { status: res.statusCode, body: res.body ? JSON.parse(res.body) : null };
  }

  const missing = await call("POST", `/devices/${DEVICE_ID}/bind-session`, {});
  assert.equal(missing.status, 400);
  assert.equal(bound, false);

  const nonStringChallenge = await call("POST", `/devices/${DEVICE_ID}/bind-session`, {
    challenge_id: 12345,
    signature: "abcd",
  });
  assert.equal(nonStringChallenge.status, 400);
  assert.equal(nonStringChallenge.body.error, "DEVICE_BAD_REQUEST");
  assert.equal(bound, false);

  deviceStatus = "blocked";
  const blockedChallenge = await call("POST", `/devices/${DEVICE_ID}/bind-challenge`, {});
  assert.equal(blockedChallenge.status, 409);
  assert.equal(bound, false);

  deviceStatus = "revoked";
  const revokedChallenge = await call("POST", `/devices/${DEVICE_ID}/bind-challenge`, {});
  assert.equal(revokedChallenge.status, 409);

  deviceStatus = "trusted";
  const issued = await call("POST", `/devices/${DEVICE_ID}/bind-challenge`, {});
  assert.equal(issued.status, 200);
  const challenge = issued.body as { challenge_id: string; challenge: string };

  const wrongSig = b64(ed25519Sign(other.secret, Buffer.from(challenge.challenge, "base64")));
  const wrong = await call("POST", `/devices/${DEVICE_ID}/bind-session`, {
    challenge_id: challenge.challenge_id,
    signature: wrongSig,
  });
  assert.equal(wrong.status, 403);
  assert.equal(wrong.body.error, "DEVICE_BIND_PROOF_INVALID");
  assert.equal(bound, false);

  const replayIssue = await call("POST", `/devices/${DEVICE_ID}/bind-challenge`, {});
  const replayChallenge = replayIssue.body as { challenge_id: string; challenge: string };
  const goodSig = b64(
    ed25519Sign(keys.secret, Buffer.from(replayChallenge.challenge, "base64")),
  );
  const ok = await call("POST", `/devices/${DEVICE_ID}/bind-session`, {
    challenge_id: replayChallenge.challenge_id,
    signature: goodSig,
    device_name: "Work MacBook",
  });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.status, "trusted");
  assert.equal(bound, true);
  assert.deepEqual(metadataNames, ["Work MacBook"]);

  const replay = await call("POST", `/devices/${DEVICE_ID}/bind-session`, {
    challenge_id: replayChallenge.challenge_id,
    signature: goodSig,
  });
  assert.equal(replay.status, 401);
  assert.equal(replay.body.error, "DEVICE_BIND_CHALLENGE_INVALID");

  const expiredIssue = await call("POST", `/devices/${DEVICE_ID}/bind-challenge`, {});
  const expiredChallenge = expiredIssue.body as { challenge_id: string; challenge: string };
  clock.now += 121_000;
  const expiredSig = b64(
    ed25519Sign(keys.secret, Buffer.from(expiredChallenge.challenge, "base64")),
  );
  const expired = await call("POST", `/devices/${DEVICE_ID}/bind-session`, {
    challenge_id: expiredChallenge.challenge_id,
    signature: expiredSig,
  });
  assert.equal(expired.status, 401);
  assert.equal(expired.body.error, "DEVICE_BIND_CHALLENGE_INVALID");
});

test("bind-session accepts a share-wrap signature and rotates only the signing key", async () => {
  ensureWasm();
  const wrap = deviceKeys();
  const share = hybridShareForWrap(wrap.publicKey);
  const storedSigning = deviceKeys();
  let publicKey = b64(storedSigning.publicKey);
  let bound = false;
  const deviceService = new DeviceService({
    devices: {
      findOwnedDeviceAuth: async () => ({
        id: DEVICE_ID,
        status: "trusted",
        devicePublicKey: publicKey,
        deviceShare: share,
      }),
      rotateActiveDevicePublicKey: async (input: { devicePublicKey: string }) => {
        publicKey = input.devicePublicKey;
        return { id: DEVICE_ID };
      },
      updateActiveDeviceMetadata: async () => null,
    } as never,
    config: { deviceApprovalTtlSeconds: 60, publicAppBaseUrl: "https://app.test" },
    now: () => new Date("2026-01-01T00:00:00.000Z"),
  });
  const sessionService = {
    hashAccessToken: (token: string) => `hash:${token}`,
    bindAccessTokenDevice: async () => {
      bound = true;
      return true;
    },
    resolveAccessToken: async () => ({
      userId: "u1",
      deviceId: null,
      scope: null,
      tokenHash: "hash:tok",
    }),
  } as unknown as SessionService;

  async function call(method: string, url: string, body?: unknown) {
    const app = createApiApp(createTestApiConfig(), loggerStub(), {
      deviceService,
      sessionService,
    });
    const req = {
      method,
      url,
      headers: { authorization: "Bearer tok" },
      body,
    } as IncomingMessage;
    const res = new MockResponse();
    await app.handler()(req, res as unknown as ServerResponse);
    return { status: res.statusCode, body: res.body ? JSON.parse(res.body) : null };
  }

  const nextKeys = deviceKeys();
  const nextPublic = b64(nextKeys.publicKey);
  const issued = await call("POST", `/devices/${DEVICE_ID}/bind-challenge`, {});
  const challenge = issued.body as { challenge_id: string; challenge: string };
  const message = Buffer.from(challenge.challenge, "base64");

  // Digest of stored share bytes alone must not bind the session.
  assert.equal(verifyDeviceBindWrapProof(share, message, b64(digestOfStoredShare(share, message))), false);
  const storedOnly = await call("POST", `/devices/${DEVICE_ID}/bind-session`, {
    challenge_id: challenge.challenge_id,
    share_proof: b64(digestOfStoredShare(share, message)),
    new_device_public_key: nextPublic,
  });
  assert.equal(storedOnly.status, 403);
  assert.equal(storedOnly.body.error, "DEVICE_BIND_PROOF_INVALID");
  assert.equal(bound, false);
  assert.equal(publicKey, b64(storedSigning.publicKey));

  const again = await call("POST", `/devices/${DEVICE_ID}/bind-challenge`, {});
  const fresh = again.body as { challenge_id: string; challenge: string };
  const freshMessage = Buffer.from(fresh.challenge, "base64");
  const stranger = deviceKeys();
  const wrongWrap = await call("POST", `/devices/${DEVICE_ID}/bind-session`, {
    challenge_id: fresh.challenge_id,
    share_proof: b64(deviceBindWrapSign(stranger.secret, freshMessage)),
    new_device_public_key: nextPublic,
  });
  assert.equal(wrongWrap.status, 403);
  assert.equal(bound, false);
  assert.equal(publicKey, b64(storedSigning.publicKey));

  const third = await call("POST", `/devices/${DEVICE_ID}/bind-challenge`, {});
  const okChallenge = third.body as { challenge_id: string; challenge: string };
  const okMessage = Buffer.from(okChallenge.challenge, "base64");
  assert.equal(
    verifyDeviceBindWrapProof(share, okMessage, b64(deviceBindWrapSign(wrap.secret, okMessage))),
    true,
  );
  const proved = await call("POST", `/devices/${DEVICE_ID}/bind-session`, {
    challenge_id: okChallenge.challenge_id,
    share_proof: b64(deviceBindWrapSign(wrap.secret, okMessage)),
    new_device_public_key: nextPublic,
  });
  assert.equal(proved.status, 200);
  assert.equal(bound, true);
  assert.equal(publicKey, nextPublic);
  assert.notEqual(publicKey, b64(storedSigning.publicKey));

  const replayed = await call("POST", `/devices/${DEVICE_ID}/bind-session`, {
    challenge_id: okChallenge.challenge_id,
    share_proof: b64(deviceBindWrapSign(wrap.secret, okMessage)),
    new_device_public_key: nextPublic,
  });
  assert.equal(replayed.status, 401);
  assert.equal(replayed.body.error, "DEVICE_BIND_CHALLENGE_INVALID");

  bound = false;
  const fourth = await call("POST", `/devices/${DEVICE_ID}/bind-challenge`, {});
  const rotatedChallenge = fourth.body as { challenge_id: string; challenge: string };
  const rotatedSig = b64(
    ed25519Sign(nextKeys.secret, Buffer.from(rotatedChallenge.challenge, "base64")),
  );
  const afterUpgrade = await call("POST", `/devices/${DEVICE_ID}/bind-session`, {
    challenge_id: rotatedChallenge.challenge_id,
    signature: rotatedSig,
  });
  assert.equal(afterUpgrade.status, 200);
  assert.equal(bound, true);
});

test("bind-session rejects a wrap proof when the stored share has no wrap public key", async () => {
  ensureWasm();
  const legacyShare = new Uint8Array(32).fill(4);
  const nextPublic = b64(deviceKeys().publicKey);
  const wrap = deviceKeys();
  let bound = false;
  const deviceService = new DeviceService({
    devices: {
      findOwnedDeviceAuth: async () => ({
        id: DEVICE_ID,
        status: "trusted",
        devicePublicKey: b64(deviceKeys().publicKey),
        deviceShare: legacyShare,
      }),
      rotateActiveDevicePublicKey: async () => ({ id: DEVICE_ID }),
      updateActiveDeviceMetadata: async () => null,
    } as never,
    config: { deviceApprovalTtlSeconds: 60, publicAppBaseUrl: "https://app.test" },
    now: () => new Date("2026-01-01T00:00:00.000Z"),
  });
  const sessionService = {
    hashAccessToken: (token: string) => `hash:${token}`,
    bindAccessTokenDevice: async () => {
      bound = true;
      return true;
    },
    resolveAccessToken: async () => ({
      userId: "u1",
      deviceId: null,
      scope: null,
      tokenHash: "hash:tok",
    }),
  } as unknown as SessionService;

  async function call(method: string, url: string, body?: unknown) {
    const app = createApiApp(createTestApiConfig(), loggerStub(), {
      deviceService,
      sessionService,
    });
    const req = {
      method,
      url,
      headers: { authorization: "Bearer tok" },
      body,
    } as IncomingMessage;
    const res = new MockResponse();
    await app.handler()(req, res as unknown as ServerResponse);
    return { status: res.statusCode, body: res.body ? JSON.parse(res.body) : null };
  }

  const issued = await call("POST", `/devices/${DEVICE_ID}/bind-challenge`, {});
  const challenge = issued.body as { challenge_id: string; challenge: string };
  const message = Buffer.from(challenge.challenge, "base64");
  const rejected = await call("POST", `/devices/${DEVICE_ID}/bind-session`, {
    challenge_id: challenge.challenge_id,
    share_proof: b64(deviceBindWrapSign(wrap.secret, message)),
    new_device_public_key: nextPublic,
  });
  assert.equal(rejected.status, 403);
  assert.equal(rejected.body.error, "DEVICE_BIND_PROOF_INVALID");
  assert.equal(bound, false);
});
