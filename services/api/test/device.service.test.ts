import test from "node:test";
import assert from "node:assert/strict";
import {
  DeviceService,
  DeviceServiceError,
  type RegisterDeviceInput,
} from "../src/device/service.ts";
import { UniqueConstraintError } from "../src/storage/errors.ts";

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

test("registerDevice returns pending_approval for new device", async () => {
  const service = new DeviceService({
    devices: {
      registerOrUpdate: async () => ({
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
        revokedAt: null,
      }),
    },
  });

  const result = await service.registerDevice("u1", "127.0.0.1", createInput());
  assert.equal(result.status, "pending_approval");
  assert.equal(result.deviceId, "d1");
});

test("registerDevice returns trusted for trusted device", async () => {
  const service = new DeviceService({
    devices: {
      registerOrUpdate: async () => ({
        id: "d1",
        userId: "u1",
        deviceFingerprint: "a".repeat(64),
        deviceName: "MacBook Pro",
        devicePublicKey: Buffer.from("public-key").toString("base64"),
        deviceShare: new Uint8Array([1, 2]),
        platform: "desktop",
        osName: "macOS",
        osVersion: "14.5",
        appVersion: "1.0.1",
        clientType: "desktop",
        userAgent: "ua",
        ipFirst: "127.0.0.1",
        ipLast: "127.0.0.2",
        status: "trusted",
        createdAt: "2026-01-01T00:00:00.000Z",
        lastSeenAt: "2026-01-01T00:01:00.000Z",
        revokedAt: null,
      }),
    },
  });

  const result = await service.registerDevice("u1", "127.0.0.2", createInput());
  assert.equal(result.status, "trusted");
});

test("registerDevice validates fingerprint and public key", async () => {
  const service = new DeviceService({
    devices: {
      registerOrUpdate: async () => {
        throw new Error("not used");
      },
    },
  });

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
  const service = new DeviceService({
    devices: {
      registerOrUpdate: async () => {
        throw new UniqueConstraintError("unique constraint violated");
      },
    },
  });

  await assert.rejects(
    () => service.registerDevice("u1", "127.0.0.1", createInput()),
    (error: unknown) =>
      error instanceof DeviceServiceError &&
      error.code === "DEVICE_DUPLICATE_CONFLICT",
  );
});
