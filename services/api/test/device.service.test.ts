import test from "node:test";
import assert from "node:assert/strict";
import {
  DeviceService,
  DeviceServiceError,
  type RegisterDeviceInput,
} from "../src/device/service.ts";
import type { EmailTemplateService } from "../src/email/service.ts";
import { UniqueConstraintError } from "../src/storage/errors.ts";
import {
  PendingDeviceLimitError,
  TrustedDeviceKeyConflictError,
} from "../src/storage/repositories.ts";
import type { DeviceApprovalState } from "../src/storage/repositories.ts";
import { hybridDeviceShareB64 } from "./hybrid-share-fixture.ts";

function createInput(overrides?: Partial<RegisterDeviceInput>): RegisterDeviceInput {
  return {
    deviceFingerprint: "a".repeat(64),
    devicePublicKey: Buffer.from("public-key").toString("base64"),
    deviceShare: hybridDeviceShareB64(5),
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
    deviceShare: new Uint8Array(32).fill(1),
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
  claimTrustedAfterRecovery?: (input: {
    deviceFingerprint: string;
    devicePublicKey: string;
    deviceShare: Uint8Array;
  }) => Promise<ReturnType<typeof createDeviceRecord>>;
  findOwnedDeviceAuth?: (
    userId: string,
    deviceId: string,
  ) => Promise<{
    id: string;
    status: string;
    devicePublicKey: string;
    deviceShare: Uint8Array;
    deviceFingerprint: string;
  } | null>;
  isTrustedDevice?: () => Promise<boolean>;
  resolveApproval?: (input: {
    action: "approve" | "reject";
    deviceShare?: Uint8Array;
  }) => Promise<DeviceApprovalState>;
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
      findOwnedDeviceAuth: overrides?.findOwnedDeviceAuth ?? (async () => null),
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

test("approveDevice rejects approval without a device share", async () => {
  let resolved = false;
  const service = createService({
    resolveApproval: async () => {
      resolved = true;
      return { kind: "approved", device: createDeviceRecord({ status: "trusted" }) };
    },
  });

  await assert.rejects(
    () => service.approveDevice("u1", "trusted1", "pending1"),
    (err: unknown) =>
      err instanceof DeviceServiceError &&
      err.statusCode === 400 &&
      err.code === "DEVICE_BAD_REQUEST" &&
      err.message === "device_share is required",
  );
  await assert.rejects(
    () => service.approveDevice("u1", "trusted1", "pending1", undefined, new Uint8Array(0)),
    (err: unknown) =>
      err instanceof DeviceServiceError &&
      err.statusCode === 400 &&
      err.code === "DEVICE_BAD_REQUEST" &&
      err.message === "device_share is required",
  );
  assert.equal(resolved, false);
});

test("approveDevice stores a hybrid device share envelope", async () => {
  const share = Uint8Array.from(Buffer.from(hybridDeviceShareB64(6), "base64"));
  let seen: Uint8Array | undefined;
  const service = createService({
    resolveApproval: async (input) => {
      seen = input.deviceShare;
      return {
        kind: "approved",
        device: createDeviceRecord({ status: "trusted", deviceShare: share }),
      };
    },
  });

  const result = await service.approveDevice("u1", "trusted1", "pending1", undefined, share);
  assert.equal(result.status, "trusted");
  assert.equal(result.deviceId, "d1");
  assert.deepEqual(seen, share);
});

test("approveDevice rejects a raw 32-byte device share", async () => {
  let resolved = false;
  const service = createService({
    resolveApproval: async () => {
      resolved = true;
      return { kind: "approved", device: createDeviceRecord({ status: "trusted" }) };
    },
  });

  await assert.rejects(
    () =>
      service.approveDevice(
        "u1",
        "trusted1",
        "pending1",
        undefined,
        new Uint8Array(32).fill(1),
      ),
    (err: unknown) =>
      err instanceof DeviceServiceError &&
      err.statusCode === 400 &&
      err.code === "DEVICE_BAD_REQUEST" &&
      /hybrid X25519\+ML-KEM share envelope/u.test(err.message),
  );
  assert.equal(resolved, false);
});

test("registerDevice returns pending_approval for new device", async () => {
  const service = createService({
    registerOrUpdate: async () => createDeviceRecord(),
  });

  const result = await service.registerDevice("u1", "127.0.0.1", createInput());
  assert.equal(result.status, "pending_approval");
  assert.equal(result.deviceId, "d1");
});

test("registerDevice rejects a malformed device_share", async () => {
  const service = createService({
    registerOrUpdate: async () => {
      throw new Error("registerOrUpdate must not run for invalid share");
    },
  });

  await assert.rejects(
    () =>
      service.registerDevice(
        "u1",
        "127.0.0.1",
        createInput({ deviceShare: Buffer.from("share").toString("base64") }),
      ),
    (err: unknown) =>
      err instanceof DeviceServiceError &&
      err.code === "DEVICE_BAD_REQUEST" &&
      /hybrid X25519\+ML-KEM share envelope/u.test(err.message),
  );

  await assert.rejects(
    () =>
      service.registerDevice(
        "u1",
        "127.0.0.1",
        createInput({ deviceShare: Buffer.alloc(32, 5).toString("base64") }),
      ),
    (err: unknown) =>
      err instanceof DeviceServiceError &&
      err.statusCode === 400 &&
      err.code === "DEVICE_BAD_REQUEST" &&
      /hybrid X25519\+ML-KEM share envelope/u.test(err.message),
  );

  await assert.rejects(
    () =>
      service.registerDevice(
        "u1",
        "127.0.0.1",
        createInput({ deviceShare: Buffer.alloc(1216, 9).toString("base64") }),
      ),
    (err: unknown) =>
      err instanceof DeviceServiceError &&
      err.code === "DEVICE_BAD_REQUEST" &&
      /hybrid X25519\+ML-KEM share envelope/u.test(err.message),
  );
});

test("registerDevice claimAfterRecovery requires the proved device and keeps its identity", async () => {
  let claimed:
    | { deviceFingerprint: string; devicePublicKey: string; deviceShare: Uint8Array }
    | undefined;
  const pendingKey = Buffer.from("public-key").toString("base64");
  const service = createService({
    claimTrustedAfterRecovery: async (input) => {
      claimed = input;
      return createDeviceRecord({ id: "d-fresh", status: "trusted" });
    },
    findOwnedDeviceAuth: async () => ({
      id: "pending-1",
      status: "pending",
      devicePublicKey: pendingKey,
      deviceFingerprint: "a".repeat(64),
      deviceShare: new Uint8Array(32).fill(1),
    }),
    registerOrUpdate: async () => {
      throw new Error("registerOrUpdate must not run for claimAfterRecovery");
    },
  });

  await assert.rejects(
    () =>
      service.registerDevice(
        "u1",
        "127.0.0.1",
        createInput({ claimAfterRecovery: true }),
      ),
    (error: unknown) =>
      error instanceof DeviceServiceError &&
      error.code === "RECOVERY_CLAIM_REQUIRES_PROVED_DEVICE" &&
      error.statusCode === 403,
  );
  assert.equal(claimed, undefined);

  const mintedShare = hybridDeviceShareB64(9);
  const result = await service.registerDevice(
    "u1",
    "127.0.0.1",
    createInput({
      claimAfterRecovery: true,
      provedDeviceId: "pending-1",
      deviceShare: mintedShare,
    }),
  );
  assert.equal(result.status, "trusted");
  assert.equal(result.deviceId, "d-fresh");
  assert.equal(claimed?.deviceFingerprint, "a".repeat(64));
  assert.equal(claimed?.devicePublicKey, pendingKey);
  assert.deepEqual(claimed?.deviceShare, Uint8Array.from(Buffer.from(mintedShare, "base64")));
});

test("registerDevice claimAfterRecovery keeps repository this when loading the proved device", async () => {
  const pendingKey = Buffer.from("public-key").toString("base64");
  const devices = {
    calls: 0,
    async findOwnedDeviceAuth(this: { calls: number }) {
      this.calls += 1;
      return {
        id: "pending-1",
        status: "pending",
        devicePublicKey: pendingKey,
        deviceFingerprint: "a".repeat(64),
        deviceShare: new Uint8Array(32).fill(1),
      };
    },
    async claimTrustedAfterRecovery() {
      return createDeviceRecord({ id: "d-fresh", status: "trusted" });
    },
  };
  const service = new DeviceService({
    devices: devices as never,
    config: { deviceApprovalTtlSeconds: 60, publicAppBaseUrl: "https://app.test" },
  });

  const result = await service.registerDevice(
    "u1",
    "127.0.0.1",
    createInput({ claimAfterRecovery: true, provedDeviceId: "pending-1" }),
  );
  assert.equal(result.deviceId, "d-fresh");
  assert.equal(devices.calls, 1);
});

test("registerDevice recoveryPending keeps a pending sibling and does not claim", async () => {
  let allowPending: boolean | undefined;
  const service = createService({
    registerOrUpdate: async (input: { allowPendingAlongsideTrusted?: boolean }) => {
      allowPending = input.allowPendingAlongsideTrusted;
      return {
        ...createDeviceRecord({ id: "d-sibling", status: "pending" }),
        sendApprovalEmail: false,
        created: true,
      };
    },
    claimTrustedAfterRecovery: async () => {
      throw new Error("claim must not run for recoveryPending");
    },
  });

  const result = await service.registerDevice(
    "u1",
    "127.0.0.1",
    createInput({ recoveryPending: true }),
  );
  assert.equal(allowPending, true);
  assert.equal(result.deviceId, "d-sibling");
  assert.equal(result.status, "pending_approval");
  assert.equal(result.created, true);
});

test("registerDevice maps the pending device cap to DEVICE_PENDING_LIMIT", async () => {
  const service = createService({
    registerOrUpdate: async () => {
      throw new PendingDeviceLimitError(20);
    },
  });
  await assert.rejects(
    () =>
      service.registerDevice(
        "u1",
        "127.0.0.1",
        createInput({ recoveryPending: true }),
      ),
    (error: unknown) =>
      error instanceof DeviceServiceError &&
      error.code === "DEVICE_PENDING_LIMIT" &&
      error.statusCode === 409 &&
      error.message === "pending device limit reached" &&
      error.details?.limit === 20,
  );
});

test("registerDevice forwards the caller token hash", async () => {
  let seen: string | undefined;
  const service = createService({
    registerOrUpdate: async (input: { preserveSessionTokenHash?: string }) => {
      seen = input.preserveSessionTokenHash;
      return {
        ...createDeviceRecord({ id: "d-sibling", status: "pending" }),
        sendApprovalEmail: false,
        created: true,
      };
    },
  });
  await service.registerDevice(
    "u1",
    "127.0.0.1",
    createInput({ recoveryPending: true, preserveSessionTokenHash: "caller-hash" }),
  );
  assert.equal(seen, "caller-hash");
});

test("registerDevice does not register when sole-device reclaim preconditions fail", async () => {
  let registered = false;
  const service = createService({
    reclaimSoleTrusted: async () => null,
    registerOrUpdate: async () => {
      registered = true;
      return createDeviceRecord();
    },
  });
  await assert.rejects(
    () =>
      service.registerDevice(
        "u1",
        "127.0.0.1",
        createInput({
          reclaimSoleTrusted: true,
          previousDeviceId: "1",
          previousDeviceFingerprint: "ab",
          sessionDeviceId: "1",
        }),
      ),
    (error: unknown) =>
      error instanceof DeviceServiceError &&
      error.code === "DEVICE_RECLAIM_PRECONDITION_FAILED" &&
      error.statusCode === 403 &&
      error.message === "sole trusted device reclaim preconditions were not met",
  );
  assert.equal(registered, false);
});

test("registerDevice does not accept new keys for an existing trusted fingerprint", async () => {
  const service = createService({
    registerOrUpdate: async () => {
      throw new TrustedDeviceKeyConflictError();
    },
  });
  await assert.rejects(
    () => service.registerDevice("u1", "127.0.0.1", createInput()),
    (error: unknown) =>
      error instanceof DeviceServiceError &&
      error.code === "DEVICE_FINGERPRINT_ALREADY_TRUSTED" &&
      error.statusCode === 409,
  );
});

test("registerDevice skips a second approval email for an existing pending device", async () => {
  let sends = 0;
  const service = new DeviceService({
    devices: {
      registerOrUpdate: async () => ({
        ...createDeviceRecord(),
        sendApprovalEmail: false,
      }),
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
      sendDeviceApprovalRequest: async () => {
        sends += 1;
      },
    },
  });

  const result = await service.registerDevice("u1", "127.0.0.1", createInput());
  assert.equal(result.status, "pending_approval");
  assert.equal(sends, 0);
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
  assert.equal(sends[0].localeHints.explicitLocale, undefined);
  assert.equal(sends[0].variables.deviceName, "Pixel");
  assert.equal(sends[0].variables.platform, "Desktop · App");
  assert.equal(sends[0].variables.osName, "macOS");
  assert.equal(sends[0].variables.requestIp, "203.0.113.9");
  assert.match(
    sends[0].variables.helpUrl,
    /^https:\/\/app\.test\/items\?popup=settings%7Cdevices$/,
  );
  assert.ok(typeof sends[0].variables.requestedAtIso === "string");
  assert.ok(typeof sends[0].variables.expiresAtIso === "string");
  const requestedMs = Date.parse(sends[0].variables.requestedAtIso!);
  const expiresMs = Date.parse(sends[0].variables.expiresAtIso!);
  assert.equal(expiresMs - requestedMs, 60_000);
});

test("registerDevice approval email prefers explicit locale over Accept-Language", async () => {
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
        locale: null,
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
    createInput({
      deviceName: "Chrome",
      locale: "en",
      acceptLanguage: "ru-RU,ru;q=0.9",
    }),
  );
  assert.equal(sends.length, 1);
  assert.equal(sends[0].localeHints.userLocale, null);
  assert.equal(sends[0].localeHints.explicitLocale, "en");
  assert.equal(sends[0].localeHints.acceptLanguage, "ru-RU,ru;q=0.9");
});

test("registerDevice approval email maps desktop_app clientType to Desktop · App", async () => {
  const sends: Array<Parameters<EmailTemplateService["sendDeviceApprovalRequest"]>[0]> = [];
  const service = new DeviceService({
    devices: {
      registerOrUpdate: async () => createDeviceRecord({ clientType: "desktop_app" }),
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
    createInput({
      deviceName: "Okkey Desktop",
      clientType: "desktop_app",
      deviceFingerprint: "desktop_app-desktop-macos-14.5",
    }),
  );
  assert.equal(sends.length, 1);
  assert.equal(sends[0].variables.platform, "Desktop · App");
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
  await assert.rejects(
    () =>
      approveService.approveDevice(
        "u1",
        "trusted1",
        "pending1",
        undefined,
        Uint8Array.from(Buffer.from(hybridDeviceShareB64(4), "base64")),
      ),
    (error: unknown) =>
      error instanceof DeviceServiceError &&
      error.code === "DEVICE_APPROVAL_ALREADY_RESOLVED" &&
      error.statusCode === 409,
  );

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
    () =>
      conflictingApprove.approveDevice(
        "u1",
        "trusted1",
        "pending1",
        undefined,
        Uint8Array.from(Buffer.from(hybridDeviceShareB64(4), "base64")),
      ),
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
    () =>
      service.approveDevice(
        "u1",
        "pending-device",
        "pending1",
        undefined,
        Uint8Array.from(Buffer.from(hybridDeviceShareB64(4), "base64")),
      ),
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
