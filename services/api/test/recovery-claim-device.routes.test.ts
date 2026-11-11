import test from "node:test";
import assert from "node:assert/strict";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createApiApp } from "../src/app.ts";
import { DeviceService } from "../src/device/service.ts";
import type { SessionService } from "../src/session/service.ts";
import { hybridDeviceShareB64 } from "./hybrid-share-fixture.ts";
import { createTestApiConfig } from "./test-api-config.ts";

const DEVICE_ID = "1234567890123456789";
const FINGERPRINT = "ab".repeat(32);
const PUBLIC_KEY = Buffer.alloc(32, 3).toString("base64");
const OTHER_KEY = Buffer.alloc(32, 9).toString("base64");
const OTHER_FINGERPRINT = "cd".repeat(32);
const PENDING_SHARE = Uint8Array.from(Buffer.alloc(32, 1));
const CLAIM_SHARE = hybridDeviceShareB64(4);

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
  return { info() {}, warn() {}, error() {} };
}

type OwnedDevice = {
  id: string;
  status: string;
  devicePublicKey: string;
  deviceFingerprint: string;
  deviceShare: Uint8Array;
};

type ClaimCapture = {
  deviceFingerprint: string;
  devicePublicKey: string;
  deviceShare: Uint8Array;
  deviceName: string;
};

function pendingDevice(overrides?: Partial<OwnedDevice>): OwnedDevice {
  return {
    id: DEVICE_ID,
    status: "pending",
    devicePublicKey: PUBLIC_KEY,
    deviceFingerprint: FINGERPRINT,
    deviceShare: PENDING_SHARE,
    ...overrides,
  };
}

function createHarness(options?: {
  device?: OwnedDevice | null;
  deviceId?: string | null;
  proved?: boolean;
}) {
  const device =
    options && "device" in options ? (options.device ?? null) : pendingDevice();
  const deviceId = options && "deviceId" in options ? (options.deviceId ?? null) : DEVICE_ID;
  const proved = options?.proved !== false;
  const claims: ClaimCapture[] = [];

  const deviceService = new DeviceService({
    devices: {
      findOwnedDeviceAuth: async (userId: string, id: string) => {
        if (!device || userId !== "u1" || id !== device.id) {
          return null;
        }
        return device;
      },
      isTrustedDevice: async (userId: string, id: string) =>
        Boolean(device && userId === "u1" && id === device.id && device.status === "trusted"),
      claimTrustedAfterRecovery: async (input: ClaimCapture) => {
        claims.push({
          deviceFingerprint: input.deviceFingerprint,
          devicePublicKey: input.devicePublicKey,
          deviceShare: input.deviceShare,
          deviceName: input.deviceName,
        });
        return { id: device?.id ?? DEVICE_ID };
      },
    } as never,
    config: { deviceApprovalTtlSeconds: 60, publicAppBaseUrl: "https://app.test" },
  });

  const sessionService = {
    resolveAccessToken: async () => ({
      userId: "u1",
      deviceId,
      scope: null,
      tokenHash: "hash-a",
      expiresAt: "2099-01-01T00:00:00.000Z",
      recoveryProvedAt: proved ? "2099-01-01T00:00:00.000Z" : null,
    }),
    hashAccessToken: () => "hash-a",
    bindAccessTokenDevice: async () => true,
  } as unknown as SessionService;

  const app = createApiApp(createTestApiConfig(), loggerStub(), {
    deviceService,
    sessionService,
  });

  return { app, claims };
}

function claimBody(overrides?: Record<string, unknown>) {
  return {
    device_public_key: PUBLIC_KEY,
    device_share: CLAIM_SHARE,
    device_fingerprint: FINGERPRINT,
    device_name: "Browser",
    platform: "desktop",
    os_name: "macOS",
    os_version: "14.5",
    app_version: "web",
    client_type: "web",
    metadata: {
      claim_after_recovery: true,
      recovery_pending: false,
      reclaim_sole_trusted: false,
    },
    ...overrides,
  };
}

async function postClaim(
  app: ReturnType<typeof createApiApp>,
  body: unknown,
) {
  const req = {
    method: "POST",
    url: "/devices/register",
    headers: { authorization: "Bearer tok-a" },
    body,
  } as IncomingMessage;
  const res = new MockResponse();
  await app.handler()(req, res as unknown as ServerResponse);
  const payload = res.body ? (JSON.parse(res.body) as Record<string, unknown>) : {};
  return { statusCode: res.statusCode, payload };
}

function assertError(
  statusCode: number,
  payload: Record<string, unknown>,
  code: string,
  message: string,
) {
  assert.equal(statusCode, 403);
  assert.equal(payload.error, code);
  assert.equal(payload.message, message);
  assert.equal(typeof payload.requestId, "string");
  assert.equal((payload.requestId as string).length > 0, true);
  assert.deepEqual(Object.keys(payload).sort(), ["error", "message", "requestId"]);
}

test("POST /devices/register claim rejects another device fingerprint", async () => {
  const harness = createHarness();
  const result = await postClaim(
    harness.app,
    claimBody({ device_fingerprint: OTHER_FINGERPRINT }),
  );
  assertError(
    result.statusCode,
    result.payload,
    "RECOVERY_CLAIM_DEVICE_MISMATCH",
    "recovery claim does not match the device that proved the recovery key",
  );
  assert.equal(harness.claims.length, 0);
});

test("POST /devices/register claim rejects another device public key", async () => {
  const harness = createHarness();
  const result = await postClaim(
    harness.app,
    claimBody({ device_public_key: OTHER_KEY }),
  );
  assertError(
    result.statusCode,
    result.payload,
    "RECOVERY_CLAIM_DEVICE_MISMATCH",
    "recovery claim does not match the device that proved the recovery key",
  );
  assert.equal(harness.claims.length, 0);
});

test("POST /devices/register claim rejects when no proved pending device is bound", async () => {
  const message = "recovery claim requires the pending device that proved the recovery key";

  const unbound = createHarness({ deviceId: null });
  const unboundResult = await postClaim(unbound.app, claimBody());
  assertError(unboundResult.statusCode, unboundResult.payload, "RECOVERY_CLAIM_REQUIRES_PROVED_DEVICE", message);
  assert.equal(unbound.claims.length, 0);

  const missing = createHarness({ device: null });
  const missingResult = await postClaim(missing.app, claimBody());
  assertError(missingResult.statusCode, missingResult.payload, "RECOVERY_CLAIM_REQUIRES_PROVED_DEVICE", message);
  assert.equal(missing.claims.length, 0);

  const revoked = createHarness({ device: pendingDevice({ status: "revoked" }) });
  const revokedResult = await postClaim(revoked.app, claimBody());
  assertError(revokedResult.statusCode, revokedResult.payload, "RECOVERY_CLAIM_REQUIRES_PROVED_DEVICE", message);
  assert.equal(revoked.claims.length, 0);

  const blocked = createHarness({ device: pendingDevice({ status: "blocked" }) });
  const blockedResult = await postClaim(blocked.app, claimBody());
  assertError(blockedResult.statusCode, blockedResult.payload, "RECOVERY_CLAIM_REQUIRES_PROVED_DEVICE", message);
  assert.equal(blocked.claims.length, 0);

  const trustedWithoutProof = createHarness({
    device: pendingDevice({ status: "trusted" }),
    proved: false,
  });
  const trustedResult = await postClaim(trustedWithoutProof.app, claimBody());
  assertError(
    trustedResult.statusCode,
    trustedResult.payload,
    "RECOVERY_CLAIM_REQUIRES_PROVED_DEVICE",
    message,
  );
  assert.equal(trustedWithoutProof.claims.length, 0);

  const pendingWithoutProof = createHarness({ proved: false });
  const pendingResult = await postClaim(pendingWithoutProof.app, claimBody());
  assert.equal(pendingResult.statusCode, 403);
  assert.equal(pendingResult.payload.error, "RECOVERY_PROOF_REQUIRED");
  assert.equal(pendingWithoutProof.claims.length, 0);
});

test("POST /devices/register claim trusts the proved pending device and accepts a new share", async () => {
  const harness = createHarness();
  const result = await postClaim(
    harness.app,
    claimBody({
      device_fingerprint: FINGERPRINT.toUpperCase(),
      device_name: "Recovered browser",
    }),
  );
  assert.equal(result.statusCode, 200);
  assert.equal(result.payload.status, "trusted");
  assert.equal(result.payload.device_id, DEVICE_ID);
  assert.equal(harness.claims.length, 1);
  const claimed = harness.claims[0];
  assert.ok(claimed);
  assert.equal(claimed.deviceFingerprint, FINGERPRINT);
  assert.equal(claimed.devicePublicKey, PUBLIC_KEY);
  assert.deepEqual(claimed.deviceShare, Uint8Array.from(Buffer.from(CLAIM_SHARE, "base64")));
  assert.notDeepEqual(claimed.deviceShare, PENDING_SHARE);
  assert.equal(claimed.deviceName, "Recovered browser");
});

test("POST /devices/register claim still updates the sole trusted device that proved", async () => {
  const harness = createHarness({
    device: pendingDevice({ status: "trusted" }),
  });
  const result = await postClaim(harness.app, claimBody());
  assert.equal(result.statusCode, 200);
  assert.equal(result.payload.status, "trusted");
  assert.equal(harness.claims.length, 1);
  assert.equal(harness.claims[0]?.deviceFingerprint, FINGERPRINT);
  assert.equal(harness.claims[0]?.devicePublicKey, PUBLIC_KEY);

  const mismatch = createHarness({
    device: pendingDevice({ status: "trusted" }),
  });
  const rejected = await postClaim(
    mismatch.app,
    claimBody({ device_public_key: OTHER_KEY }),
  );
  assertError(
    rejected.statusCode,
    rejected.payload,
    "RECOVERY_CLAIM_DEVICE_MISMATCH",
    "recovery claim does not match the device that proved the recovery key",
  );
  assert.equal(mismatch.claims.length, 0);
});
