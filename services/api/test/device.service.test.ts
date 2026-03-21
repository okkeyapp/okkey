import test from "node:test";
import assert from "node:assert/strict";
import {
  DeviceService,
  DeviceServiceError,
  type RegisterDeviceInput,
} from "../src/device/service.ts";
import { UniqueConstraintError } from "../src/storage/errors.ts";
import type { DeviceApprovalState } from "../src/storage/repositories.ts";

function createInput(overrides?: Partial<RegisterDeviceInput>): RegisterDeviceInput {
  return {
    deviceFingerprint: "a".repeat(64),
    devicePublicKey: Buffer.from("public-key").toString("base64"),
    deviceShare: Buffer.from("share").toString("base64"),
    deviceName: "MacBook Pro",
    platform: "desktop",
    osName: "macOS",
    osVersion: "14.5",
    appVersion: "1.0.0",
    clientType: "desktop",
    userAgent: "okkey-desktop/1.0.0",
    ...(overrides ?? {}),
  };
}

function createDeviceRecord(overrides?: Record<string, unknown>) {
  return {
    id: "d1",
    userId: "u1",
    deviceFingerprint: "a".repeat(64),
    deviceName: "MacBook Pro",
    devicePublicKey: Buffer.from("public-key").toString("base64"),
    deviceShare: new Uint8Array([1, 2]),
    platform: "desktop",
    osName: "macOS",
    osVersion: "14.5",
    appVersion: "1.0.0",
    clientType: "desktop",
    userAgent: "ua",
    ipFirst: "127.0.0.1",
    ipLast: "127.0.0.1",
    status: "pending",
    createdAt: "2026-01-01T00:00:00.000Z",
    lastSeenAt: null,
    approvedBy: null,
    approvedAt: null,
    rejectedAt: null,
    rejectionReason: null,
    revokedAt: null,
    ...(overrides ?? {}),
  };
}

function createService(overrides?: {
  registerOrUpdate?: () => Promise<ReturnType<typeof createDeviceRecord>>;
  isTrustedDevice?: () => Promise<boolean>;
  resolveApproval?: () => Promise<DeviceApprovalState>;
  now?: () => Date;
}) {
  return new DeviceService({
    devices: {
      registerOrUpdate:
        overrides?.registerOrUpdate ??
        (async () => createDeviceRecord() as ReturnType<typeof createDeviceRecord>),
      isTrustedDevice: overrides?.isTrustedDevice ?? (async () => true),
      resolveApproval:
        overrides?.resolveApproval ??
        (async () => ({
          kind: "approved",
          device: createDeviceRecord({ status: "trusted" }),
        })),
    },
    config: {
      deviceApprovalTtlSeconds: 60,
    },
    now: overrides?.now,
  });
}

test("registerDevice returns pending_approval for new device", async () => {
  const service = createService({
    registerOrUpdate: async () => createDeviceRecord(),
  });

  const result = await service.registerDevice("u1", "127.0.0.1", createInput());
  assert.equal(result.status, "pending_approval");
  assert.equal(result.deviceId, "d1");
});

test("registerDevice returns trusted for trusted device", async () => {
  const service = createService({
    registerOrUpdate: async () => createDeviceRecord({ status: "trusted" }),
  });

  const result = await service.registerDevice("u1", "127.0.0.2", createInput());
  assert.equal(result.status, "trusted");
});

test("registerDevice validates fingerprint and public key", async () => {
  const service = createService();

  await assert.rejects(
    () =>
      service.registerDevice(
        "u1",
        "127.0.0.1",
        createInput({ deviceFingerprint: "bad-fingerprint" }),
      ),
    (error: unknown) =>
      error instanceof DeviceServiceError &&
      error.code === "DEVICE_INVALID_FINGERPRINT",
  );

  await assert.rejects(
    () =>
      service.registerDevice(
        "u1",
        "127.0.0.1",
        createInput({ devicePublicKey: "not-base64" }),
      ),
    (error: unknown) =>
      error instanceof DeviceServiceError &&
      error.code === "DEVICE_INVALID_PUBLIC_KEY",
  );
});

test("registerDevice maps unique conflicts to DEVICE_DUPLICATE_CONFLICT", async () => {
  const service = createService({
    registerOrUpdate: async () => {
      throw new UniqueConstraintError("unique constraint violated");
    },
  });

  await assert.rejects(
    () => service.registerDevice("u1", "127.0.0.1", createInput()),
    (error: unknown) =>
      error instanceof DeviceServiceError &&
      error.code === "DEVICE_DUPLICATE_CONFLICT",
  );
});

test("approveDevice and rejectDevice are idempotent for resolved same action", async () => {
  const approveService = createService({
    resolveApproval: async () => ({
      kind: "already_trusted",
      device: createDeviceRecord({ status: "trusted" }),
    }),
  });
  const approved = await approveService.approveDevice("u1", "trusted1", "pending1");
  assert.equal(approved.status, "trusted");

  const rejectService = createService({
    resolveApproval: async () => ({
      kind: "already_revoked",
      device: createDeviceRecord({ status: "revoked" }),
    }),
  });
  const rejected = await rejectService.rejectDevice("u1", "trusted1", "pending1");
  assert.equal(rejected.status, "revoked");
});

test("approval flow rejects invalid transitions and expired challenge", async () => {
  const conflictingApprove = createService({
    resolveApproval: async () => ({
      kind: "already_revoked",
      device: createDeviceRecord({ status: "revoked" }),
    }),
  });
  await assert.rejects(
    () => conflictingApprove.approveDevice("u1", "trusted1", "pending1"),
    (error: unknown) =>
      error instanceof DeviceServiceError &&
      error.code === "DEVICE_APPROVAL_ALREADY_RESOLVED",
  );

  const expired = createService({
    resolveApproval: async () => ({
      kind: "expired",
      device: createDeviceRecord({ status: "revoked" }),
    }),
  });
  await assert.rejects(
    () => expired.rejectDevice("u1", "trusted1", "pending1"),
    (error: unknown) =>
      error instanceof DeviceServiceError &&
      error.code === "DEVICE_APPROVAL_EXPIRED",
  );
});

test("approval flow requires trusted approver device", async () => {
  const service = createService({
    isTrustedDevice: async () => false,
  });

  await assert.rejects(
    () => service.approveDevice("u1", "pending-device", "pending1"),
    (error: unknown) =>
      error instanceof DeviceServiceError &&
      error.code === "DEVICE_APPROVAL_ACCESS_DENIED",
  );
});
