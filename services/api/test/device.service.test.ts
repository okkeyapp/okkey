import test from "node:test";
import assert from "node:assert/strict";
import {
  DeviceService,
  DeviceServiceError,
  type RegisterDeviceInput,
} from "../src/device/service.ts";
import type { EmailTemplateService } from "../src/email/service.ts";
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
    blockedUntil: null,
    ...(overrides ?? {}),
  };
}

function createService(overrides?: {
  registerOrUpdate?: () => Promise<ReturnType<typeof createDeviceRecord>>;
  reclaimSoleTrusted?: () => Promise<ReturnType<typeof createDeviceRecord> | null>;
  claimTrustedAfterRecovery?: () => Promise<ReturnType<typeof createDeviceRecord>>;
  isTrustedDevice?: () => Promise<boolean>;
  resolveApproval?: () => Promise<DeviceApprovalState>;
  listByUser?: () => Promise<Array<ReturnType<typeof createDeviceRecord>>>;
  renameDevice?: () => Promise<ReturnType<typeof createDeviceRecord> | null>;
  revokeOwned?: () => Promise<ReturnType<typeof createDeviceRecord> | null>;
  blockPending?: () => Promise<ReturnType<typeof createDeviceRecord> | null>;
  unblockDevice?: () => Promise<ReturnType<typeof createDeviceRecord> | null>;
  clearExpiredBlocks?: () => Promise<void>;
  geoIp?: { lookup: (ip: string) => Promise<{ country: string | null; city: string | null }> };
  now?: () => Date;
}) {
  return new DeviceService({
    devices: {
      registerOrUpdate:
        overrides?.registerOrUpdate ??
        (async () => createDeviceRecord() as ReturnType<typeof createDeviceRecord>),
      reclaimSoleTrusted: overrides?.reclaimSoleTrusted ?? (async () => null),
      claimTrustedAfterRecovery:
        overrides?.claimTrustedAfterRecovery ??
        (async () => createDeviceRecord({ status: "trusted", id: "d-claim" })),
      isTrustedDevice: overrides?.isTrustedDevice ?? (async () => true),
      resolveApproval:
        overrides?.resolveApproval ??
        (async () => ({
          kind: "approved",
          device: createDeviceRecord({ status: "trusted" }),
        })),
      listByUser:
        overrides?.listByUser ??
        (async () => [createDeviceRecord({ status: "trusted" })]),
      renameDevice:
        overrides?.renameDevice ??
        (async () => createDeviceRecord({ status: "trusted", deviceName: "Renamed" })),
      revokeOwned:
        overrides?.revokeOwned ??
        (async () => createDeviceRecord({ status: "revoked" })),
      blockPending:
        overrides?.blockPending ??
        (async () => createDeviceRecord({ status: "blocked", blockedUntil: null })),
      unblockDevice:
        overrides?.unblockDevice ??
        (async () => createDeviceRecord({ status: "revoked" })),
      clearExpiredBlocks: overrides?.clearExpiredBlocks ?? (async () => undefined),
    },
    config: {
      deviceApprovalTtlSeconds: 60,
      publicAppBaseUrl: "https://app.test",
    },
    geoIp: overrides?.geoIp,
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

test("registerDevice claimAfterRecovery becomes sole trusted without pending", async () => {
  let claimed = false;
  const service = createService({
    claimTrustedAfterRecovery: async () => {
      claimed = true;
      return createDeviceRecord({ id: "d-fresh", status: "trusted" });
    },
    registerOrUpdate: async () => {
      throw new Error("registerOrUpdate must not run for claimAfterRecovery");
    },
  });

  const result = await service.registerDevice(
    "u1",
    "127.0.0.1",
    createInput({ claimAfterRecovery: true }),
  );
  assert.equal(claimed, true);
  assert.equal(result.status, "trusted");
  assert.equal(result.deviceId, "d-fresh");
});

test("registerDevice sends device_approval_request when pending and email deps configured", async () => {
  const sends: Array<Parameters<EmailTemplateService["sendDeviceApprovalRequest"]>[0]> = [];
  const service = new DeviceService({
    devices: {
      registerOrUpdate: async () => createDeviceRecord(),
      reclaimSoleTrusted: async () => null,
      claimTrustedAfterRecovery: async () => createDeviceRecord({ status: "trusted" }),
      isTrustedDevice: async () => true,
      resolveApproval: async () => ({
        kind: "approved",
        device: createDeviceRecord({ status: "trusted" }),
      }),
      listByUser: async () => [],
      renameDevice: async () => null,
      revokeOwned: async () => null,
      blockPending: async () => null,
      unblockDevice: async () => null,
      clearExpiredBlocks: async () => undefined,
    },
    config: {
      deviceApprovalTtlSeconds: 60,
      publicAppBaseUrl: "https://app.test",
    },
    users: {
      findById: async () => ({
        id: "u1",
        email: "owner@test.local",
        publicKey: "pk",
        locale: "en",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      }),
    },
    emailTemplates: {
      sendDeviceApprovalRequest: async (input) => {
        sends.push(input);
      },
    },
  });

  await service.registerDevice(
    "u1",
    "203.0.113.9",
    createInput({ deviceName: "Pixel", acceptLanguage: "ru-RU" }),
  );
  assert.equal(sends.length, 1);
  assert.equal(sends[0].to, "owner@test.local");
  assert.equal(sends[0].localeHints.acceptLanguage, "ru-RU");
  assert.equal(sends[0].variables.deviceName, "Pixel");
  assert.equal(sends[0].variables.platform, "Desktop · App");
  assert.equal(sends[0].variables.osName, "macOS");
  assert.equal(sends[0].variables.requestIp, "203.0.113.9");
  assert.match(
    sends[0].variables.helpUrl,
    /^https:\/\/app\.test\/items\?popup=settings\|devices$/,
  );
  assert.ok(typeof sends[0].variables.requestedAtIso === "string");
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

test("registerDevice accepts structured browser fingerprint", async () => {
  const service = createService({
    registerOrUpdate: async (input) =>
      createDeviceRecord({
        status: "trusted",
        deviceFingerprint: input.deviceFingerprint,
      }),
  });
  const result = await service.registerDevice(
    "u1",
    "127.0.0.1",
    createInput({ deviceFingerprint: "web_app-chrome-macos-10.15.7" }),
  );
  assert.equal(result.status, "trusted");
  assert.equal(result.deviceId, "d1");
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

test("listDevices splits trusted and pending and enriches geo", async () => {
  const fingerprint = "b".repeat(64);
  const service = createService({
    listByUser: async () => [
      createDeviceRecord({
        id: "pending-1",
        status: "pending",
        deviceFingerprint: "c".repeat(64),
        createdAt: "2026-01-01T00:00:00.000Z",
        ipLast: "203.0.113.10",
      }),
      createDeviceRecord({
        id: "trusted-1",
        status: "trusted",
        deviceFingerprint: fingerprint,
        lastSeenAt: "2026-01-02T00:00:00.000Z",
        ipLast: "203.0.113.10",
      }),
    ],
    geoIp: {
      lookup: async () => ({ country: "Singapore", city: "Singapore" }),
    },
    now: () => new Date("2026-01-01T00:00:30.000Z"),
  });

  const result = await service.listDevices("u1", fingerprint);
  assert.equal(result.devices.length, 1);
  assert.equal(result.pending.length, 1);
  assert.equal(result.devices[0].isCurrent, true);
  assert.equal(result.devices[0].country, "Singapore");
  assert.equal(result.pending[0].status, "pending_approval");
  assert.equal(result.pending[0].approvalExpiresAt, "2026-01-01T00:01:00.000Z");
});

test("renameDevice and revokeDevice map not found", async () => {
  const renameMissing = createService({
    renameDevice: async () => null,
  });
  await assert.rejects(
    () => renameMissing.renameDevice("u1", "missing", "New name"),
    (error: unknown) =>
      error instanceof DeviceServiceError && error.code === "DEVICE_NOT_FOUND",
  );

  const revokeMissing = createService({
    revokeOwned: async () => null,
  });
  await assert.rejects(
    () => revokeMissing.revokeDevice("u1", "missing"),
    (error: unknown) =>
      error instanceof DeviceServiceError && error.code === "DEVICE_NOT_FOUND",
  );

  const revoked = await createService().revokeDevice("u1", "d1", "not now");
  assert.equal(revoked.status, "revoked");

  const renamed = await createService().renameDevice("u1", "d1", "Office laptop");
  assert.equal(renamed.deviceName, "Renamed");
});


test("blockDevice blocks pending for 1h and unblockDevice can trust", async () => {
  const until = "2026-01-01T01:00:00.000Z";
  const service = createService({
    blockPending: async () =>
      createDeviceRecord({
        id: "d-pending",
        status: "blocked",
        blockedUntil: until,
      }),
    unblockDevice: async () =>
      createDeviceRecord({
        id: "d-pending",
        status: "trusted",
        blockedUntil: null,
      }),
    now: () => new Date("2026-01-01T00:00:00.000Z"),
  });

  const blocked = await service.blockDevice("u1", "d-approver", "d-pending", "1h");
  assert.equal(blocked.status, "blocked");
  assert.equal(blocked.blockedUntil, until);

  const trusted = await service.unblockDevice("u1", "d-pending", true);
  assert.equal(trusted.status, "trusted");
});
