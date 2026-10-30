import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { IncomingMessage, ServerResponse } from "node:http";
import { initSync } from "@okkey/crypto-wasm";
import { ed25519Keypair, ed25519Sign } from "@okkey/crypto";
import { createApiApp } from "../src/app.ts";
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
