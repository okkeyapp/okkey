import assert from "node:assert/strict";
import test from "node:test";

import { AccountRecoveryError, AccountRecoveryService, extractTrustedContactInviteEmails } from "../src/account-recovery/service.ts";
import type { AccountRecoveryRepository } from "../src/storage/account-recovery.ts";

test("extractTrustedContactInviteEmails accepts email, emails, and invitations", () => {
  assert.deepEqual(extractTrustedContactInviteEmails({ email: "a@b.co" }), ["a@b.co"]);
  assert.deepEqual(
    extractTrustedContactInviteEmails({ emails: ["a@b.co", "c@d.co"] }),
    ["a@b.co", "c@d.co"],
  );
  assert.deepEqual(
    extractTrustedContactInviteEmails({
      invitations: [{ email: "Friend <friend@example.com>" }, { email: "other@example.com" }],
    }),
    ["friend@example.com", "other@example.com"],
  );
  assert.deepEqual(extractTrustedContactInviteEmails({}), []);
});

function mockDevice(input: {
  fingerprint: string;
  status?: "trusted" | "pending" | "blocked" | "revoked";
}): {
  id: string;
  userId: string;
  deviceFingerprint: string;
  deviceName: string;
  devicePublicKey: string;
  deviceShare: Uint8Array;
  platform: string;
  osName: string;
  osVersion: string;
  appVersion: string;
  clientType: string;
  userAgent: string;
  ipFirst: string;
  ipLast: string;
  status: "trusted" | "pending" | "revoked" | "blocked";
  createdAt: string;
  lastSeenAt: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  rejectedAt: string | null;
  rejectionReason: string | null;
  revokedAt: string | null;
  blockedUntil: string | null;
} {
  return {
    id: `d-${input.fingerprint}`,
    userId: "u1",
    deviceFingerprint: input.fingerprint,
    deviceName: "Device",
    devicePublicKey: "pk",
    deviceShare: new Uint8Array(32),
    platform: "web",
    osName: "macOS",
    osVersion: "14",
    appVersion: "1",
    clientType: "web_app",
    userAgent: "test",
    ipFirst: "127.0.0.1",
    ipLast: "127.0.0.1",
    status: input.status ?? "trusted",
    createdAt: "2026-01-01T00:00:00.000Z",
    lastSeenAt: "2026-01-01T00:00:00.000Z",
    approvedBy: null,
    approvedAt: "2026-01-01T00:00:00.000Z",
    rejectedAt: null,
    rejectionReason: null,
    revokedAt: null,
    blockedUntil: null,
  };
}

function createService(overrides?: {
  workspaces?: { planTier: string; planCustomOverride?: boolean; planFeatureOverrides?: Record<string, boolean> }[];
  users?: {
    id: string;
    email: string;
    firstName?: string | null;
    lastName?: string | null;
    locale?: string | null;
  }[];
  recovery?: Partial<AccountRecoveryRepository>;
  devices?: ReturnType<typeof mockDevice>[];
  config?: {
    deploymentMode: "self_hosted" | "saas";
    enterpriseModulesEnabled: boolean;
  };
}) {
  const workspaces = overrides?.workspaces ?? [{ planTier: "FREE" }];
  const users = overrides?.users ?? [
    { id: "u1", email: "owner@example.com" },
    { id: "u2", email: "friend@example.com" },
  ];
  const contacts: Array<{
    id: string;
    userId: string;
    contactEmail: string;
    contactUserId: string | null;
    status: "pending" | "confirmed";
    createdAt: string;
    confirmedAt: string | null;
  }> = [];
  let wrap: {
    userId: string;
    encryptedBlob: { crypto_version: number; algorithm: string; payload: string; meta: Record<string, unknown> };
    createdAt: string;
    rotatedAt: string | null;
    exportedAt: string | null;
  } | null = null;
  let settings: {
    userId: string;
    keyEnabled: boolean;
    devicesEnabled: boolean;
    contactsEnabled: boolean;
    updatedAt: string;
  } | null = null;

  const recovery = {
    getWrap: async (userId: string) => (wrap?.userId === userId ? wrap : null),
    upsertWrap: async (userId: string, encryptedBlob: typeof wrap extends null ? never : NonNullable<typeof wrap>["encryptedBlob"], rotated: boolean) => {
      wrap = {
        userId,
        encryptedBlob,
        createdAt: wrap?.createdAt ?? "2026-01-01T00:00:00.000Z",
        rotatedAt: rotated ? "2026-01-02T00:00:00.000Z" : null,
        exportedAt: null,
      };
      return wrap;
    },
    insertWrapIfAbsent: async (
      userId: string,
      encryptedBlob: typeof wrap extends null ? never : NonNullable<typeof wrap>["encryptedBlob"],
    ) => {
      if (wrap?.userId === userId) {
        return null;
      }
      wrap = {
        userId,
        encryptedBlob,
        createdAt: "2026-01-01T00:00:00.000Z",
        rotatedAt: null,
        exportedAt: null,
      };
      return wrap;
    },
    markExported: async (userId: string) => {
      if (!wrap || wrap.userId !== userId) {
        return null;
      }
      wrap = { ...wrap, exportedAt: "2026-01-03T00:00:00.000Z" };
      return wrap;
    },
    deleteWrap: async () => {
      wrap = null;
    },
    getSettings: async (userId: string) => (settings?.userId === userId ? settings : null),
    upsertSettings: async (userId: string, input: { keyEnabled: boolean; devicesEnabled: boolean; contactsEnabled: boolean }) => {
      settings = {
        userId,
        ...input,
        updatedAt: "2026-01-01T00:00:00.000Z",
      };
      return settings;
    },
    listContacts: async (userId: string) => contacts.filter((c) => c.userId === userId),
    countConfirmedContacts: async (userId: string) =>
      contacts.filter((c) => c.userId === userId && c.status === "confirmed").length,
    findContactByEmail: async (userId: string, email: string) =>
      contacts.find((c) => c.userId === userId && c.contactEmail === email) ?? null,
    insertContact: async (input: {
      id: string;
      userId: string;
      contactEmail: string;
      contactUserId: string;
    }) => {
      const row = {
        id: input.id,
        userId: input.userId,
        contactEmail: input.contactEmail,
        contactUserId: input.contactUserId,
        status: "pending" as const,
        createdAt: "2026-01-01T00:00:00.000Z",
        confirmedAt: null,
      };
      contacts.push(row);
      return row;
    },
    deleteContact: async (userId: string, contactId: string) => {
      const idx = contacts.findIndex((c) => c.userId === userId && c.id === contactId);
      if (idx < 0) {
        return false;
      }
      contacts.splice(idx, 1);
      return true;
    },
    listPendingInvitesForContact: async () => [],
    confirmInvite: async () => null,
    rejectInvite: async () => false,
    listMembershipsForContact: async () => [],
    deleteMembershipAsContact: async () => null,
    ...overrides?.recovery,
  } as AccountRecoveryRepository;

  const deviceRows = overrides?.devices ?? [];

  return new AccountRecoveryService({
    recovery,
    workspaces: {
      listAccessibleByUser: async () =>
        workspaces.map((w, i) => ({
          id: `w${i}`,
          name: "ws",
          ownerId: "u1",
          planTier: w.planTier,
          planCustomOverride: Boolean(w.planCustomOverride),
          planFeatureOverrides: w.planFeatureOverrides ?? {},
          deletedItemsRetentionDays: 30,
          allowedFileExtensions: [],
          maxFileSizeMb: 10,
          filesInItemsEnabled: false,
          capsulePolicies: {} as never,
          tileColor: null,
          logoVaultId: null,
          logoAttachmentId: null,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        })),
    },
    devices: {
      listByUser: async () => deviceRows,
    },
    users: {
      loadVaultUnlockRow: async (userId: string) => {
        if (userId !== "u1") {
          return null;
        }
        const blob = {
          crypto_version: 2,
          algorithm: "opaque",
          payload: Buffer.from("identity-ciphertext").toString("base64"),
          meta: { entity: "identity_private_key" },
        };
        return {
          encryptedPrivateKey: Uint8Array.from(Buffer.from(JSON.stringify(blob), "utf8")),
          serverKeyShare: new Uint8Array(32),
          passwordKdfSalt: new Uint8Array(16),
          passwordKdfParamsVersion: 2,
        };
      },
    },
    config: overrides?.config,
  });
}

test("getStatus FREE-only: key entitlement true, paid methods false", async () => {
  const service = createService();
  const status = await service.getStatus("u1");
  assert.equal(status.entitlements.recoveryKey, true);
  assert.equal(status.entitlements.trustedDevices, false);
  assert.equal(status.entitlements.trustedContacts, false);
  assert.equal(status.settings.devicesEnabled, false);
});

test("getStatus PREMIUM defaults devicesEnabled off until explicitly enabled", async () => {
  const service = createService({ workspaces: [{ planTier: "PREMIUM" }] });
  const status = await service.getStatus("u1");
  assert.equal(status.entitlements.trustedDevices, true);
  assert.equal(status.settings.devicesEnabled, false);
});

test("enrollKey forbidRotate rejects when a wrap already exists", async () => {
  const service = createService({ workspaces: [{ planTier: "PREMIUM" }] });
  const blob = {
    crypto_version: 2,
    algorithm: "xchacha20-poly1305",
    payload: "abc",
    meta: { entity: "vault_key_recovery_wrap", key_scope: "account" },
  };
  await service.enrollKey("u1", blob, { forbidRotate: true });
  await assert.rejects(
    () => service.enrollKey("u1", { ...blob, payload: "def" }, { forbidRotate: true }),
    (err: unknown) =>
      err instanceof AccountRecoveryError && err.code === "RECOVERY_ROTATE_FORBIDDEN",
  );
});

test("getRecoveryPossession reports a public key or a legacy wrap and never returns ciphertext", async () => {
  const publicKey = Buffer.alloc(32, 4).toString("base64");
  const blob = {
    crypto_version: 2,
    algorithm: "xchacha20-poly1305",
    payload: "abc",
    meta: { entity: "vault_key_recovery_wrap", key_scope: "account" },
  };
  const ready = createService({
    recovery: {
      getWrap: async () => ({
        userId: "u1",
        encryptedBlob: blob,
        createdAt: "2026-01-01T00:00:00.000Z",
        rotatedAt: null,
        exportedAt: null,
        possessionPublicKey: publicKey,
      }),
    },
  });
  const readyState = await ready.getRecoveryPossession("u1");
  assert.equal(readyState.kind, "ready");
  if (readyState.kind === "ready") {
    assert.equal(readyState.publicKey, publicKey);
    assert.equal("encryptedBlob" in readyState, false);
  }

  const legacy = createService({
    recovery: {
      getWrap: async () => ({
        userId: "u1",
        encryptedBlob: blob,
        createdAt: "2026-01-01T00:00:00.000Z",
        rotatedAt: null,
        exportedAt: null,
        possessionPublicKey: null,
      }),
    },
  });
  const legacyState = await legacy.getRecoveryPossession("u1");
  assert.equal(legacyState.kind, "legacy");
  assert.equal(JSON.stringify(legacyState).includes("abc"), false);
});

test("enrollKey rejects a wrap whose key_scope is not account", async () => {
  const service = createService();
  const base = {
    crypto_version: 2,
    algorithm: "xchacha20-poly1305",
    payload: "abc",
  };
  await assert.rejects(
    () =>
      service.enrollKey("u1", {
        ...base,
        meta: { entity: "vault_key_recovery_wrap", key_scope: "vault" },
      }),
    (err: unknown) =>
      err instanceof AccountRecoveryError &&
      err.code === "RECOVERY_BAD_REQUEST" &&
      err.statusCode === 400,
  );
  await assert.rejects(
    () =>
      service.enrollKey("u1", {
        ...base,
        meta: { entity: "vault_key_recovery_wrap" },
      }),
    (err: unknown) =>
      err instanceof AccountRecoveryError && err.code === "RECOVERY_BAD_REQUEST",
  );
  assert.equal(await service.hasEnrolledRecoveryKey("u1"), false);

  const enrolled = await service.enrollKey("u1", {
    ...base,
    meta: { entity: "vault_key_recovery_wrap", key_scope: "account" },
  });
  assert.equal(enrolled.key.enrolled, true);
  assert.equal(await service.hasEnrolledRecoveryKey("u1"), true);
});

test("enrollKey persists wrap and enables key settings", async () => {
  const service = createService({ workspaces: [{ planTier: "PREMIUM" }] });
  assert.equal(await service.hasEnrolledRecoveryKey("u1"), false);
  assert.equal(await service.hasExportedRecoveryKey("u1"), false);
  const result = await service.enrollKey("u1", {
    crypto_version: 2,
    algorithm: "xchacha20-poly1305",
    payload: "abc",
    meta: { entity: "vault_key_recovery_wrap", key_scope: "account" },
  });
  assert.equal(result.key.enrolled, true);
  assert.equal(result.settings.keyEnabled, true);
  assert.equal(result.settings.devicesEnabled, false);
  assert.equal(await service.hasEnrolledRecoveryKey("u1"), true);
  assert.equal(await service.hasExportedRecoveryKey("u1"), false);
  await service.ackKeyExport("u1");
  assert.equal(await service.hasExportedRecoveryKey("u1"), true);
  const status = await service.getStatus("u1");
  assert.equal(status.settings.devicesEnabled, false);
});

test("updateSettings rejects disabling the recovery key", async () => {
  const service = createService();
  await service.enrollKey("u1", {
    crypto_version: 2,
    algorithm: "xchacha20-poly1305",
    payload: "abc",
    meta: { entity: "vault_key_recovery_wrap", key_scope: "account" },
  });
  await assert.rejects(
    () => service.updateSettings("u1", { keyEnabled: false }),
    (err: unknown) => err instanceof AccountRecoveryError && err.code === "RECOVERY_KEY_REQUIRED",
  );
  assert.equal(await service.hasEnrolledRecoveryKey("u1"), true);
});

test("devicesEnabled requires paid entitlement", async () => {
  const service = createService();
  await assert.rejects(
    () => service.updateSettings("u1", { devicesEnabled: true }),
    (err: unknown) => err instanceof AccountRecoveryError && err.code === "RECOVERY_ENTITLEMENT_REQUIRED",
  );
});

test("self-hosted modules off ignores plan_tier ENTERPRISE for trusted recovery", async () => {
  const service = createService({
    workspaces: [{ planTier: "ENTERPRISE" }],
    devices: [
      mockDevice({ fingerprint: "fp-current", status: "trusted" }),
      mockDevice({ fingerprint: "fp-other", status: "trusted" }),
    ],
    config: { deploymentMode: "self_hosted", enterpriseModulesEnabled: false },
  });
  const status = await service.getStatus("u1");
  assert.equal(status.entitlements.recoveryKey, true);
  assert.equal(status.entitlements.trustedDevices, false);
  assert.equal(status.entitlements.trustedContacts, false);
  await assert.rejects(
    () =>
      service.updateSettings(
        "u1",
        { devicesEnabled: true },
        { currentFingerprint: "fp-current" },
      ),
    (err: unknown) =>
      err instanceof AccountRecoveryError && err.code === "RECOVERY_ENTITLEMENT_REQUIRED",
  );
});

test("self-hosted modules on grants trusted recovery when plan_tier is FREE", async () => {
  const blocked = createService({
    workspaces: [{ planTier: "FREE" }],
    devices: [mockDevice({ fingerprint: "fp-current", status: "trusted" })],
    config: { deploymentMode: "self_hosted", enterpriseModulesEnabled: true },
  });
  const status = await blocked.getStatus("u1");
  assert.equal(status.entitlements.recoveryKey, true);
  assert.equal(status.entitlements.trustedDevices, true);
  assert.equal(status.entitlements.trustedContacts, true);
  await assert.rejects(
    () =>
      blocked.updateSettings(
        "u1",
        { devicesEnabled: true },
        { currentFingerprint: "fp-current" },
      ),
    (err: unknown) =>
      err instanceof AccountRecoveryError && err.code === "RECOVERY_DEVICES_INSUFFICIENT",
  );

  const allowed = createService({
    workspaces: [{ planTier: "FREE" }],
    devices: [
      mockDevice({ fingerprint: "fp-current", status: "trusted" }),
      mockDevice({ fingerprint: "fp-other", status: "trusted" }),
    ],
    config: { deploymentMode: "self_hosted", enterpriseModulesEnabled: true },
  });
  const updated = await allowed.updateSettings(
    "u1",
    { devicesEnabled: true },
    { currentFingerprint: "fp-current" },
  );
  assert.equal(updated.settings.devicesEnabled, true);
  assert.equal(updated.entitlements.trustedDevices, true);
});

test("devicesEnabled requires ≥2 trusted devices including current", async () => {
  const insufficient = createService({
    workspaces: [{ planTier: "PREMIUM" }],
    devices: [mockDevice({ fingerprint: "fp-current", status: "trusted" })],
  });
  await assert.rejects(
    () =>
      insufficient.updateSettings(
        "u1",
        { devicesEnabled: true },
        { currentFingerprint: "fp-current" },
      ),
    (err: unknown) =>
      err instanceof AccountRecoveryError && err.code === "RECOVERY_DEVICES_INSUFFICIENT",
  );

  const noCurrent = createService({
    workspaces: [{ planTier: "PREMIUM" }],
    devices: [
      mockDevice({ fingerprint: "fp-a", status: "trusted" }),
      mockDevice({ fingerprint: "fp-b", status: "trusted" }),
    ],
  });
  await assert.rejects(
    () =>
      noCurrent.updateSettings("u1", { devicesEnabled: true }, { currentFingerprint: "fp-other" }),
    (err: unknown) =>
      err instanceof AccountRecoveryError && err.code === "RECOVERY_DEVICES_INSUFFICIENT",
  );

  const enough = createService({
    workspaces: [{ planTier: "PREMIUM" }],
    devices: [
      mockDevice({ fingerprint: "fp-current", status: "trusted" }),
      mockDevice({ fingerprint: "fp-other", status: "trusted" }),
    ],
  });
  const status = await enough.updateSettings(
    "u1",
    { devicesEnabled: true },
    { currentFingerprint: "fp-current" },
  );
  assert.equal(status.settings.devicesEnabled, true);
});

test("core status does not include the trusted-contacts directory", async () => {
  const service = createService({ workspaces: [{ planTier: "PREMIUM" }] });
  const status = await service.getStatus("u1");
  assert.equal(status.entitlements.trustedContacts, true);
  assert.deepEqual(status.contacts, []);
  assert.deepEqual(status.pendingInvites, []);
  assert.deepEqual(status.servingAsContact, []);
  assert.equal(status.confirmedContactCount, 0);
});

test("settings patch cannot enable trusted contacts in core", async () => {
  const service = createService({ workspaces: [{ planTier: "PREMIUM" }] });
  await assert.rejects(
    () => service.updateSettings("u1", { contactsEnabled: true }),
    (err: unknown) =>
      err instanceof AccountRecoveryError && err.code === "RECOVERY_CONTACTS_UNAVAILABLE",
  );
});

test("getIdentityEncryptedKey returns ciphertext blob for restore bootstrap", async () => {
  const service = createService();
  const result = await service.getIdentityEncryptedKey("u1");
  assert.equal(result.encryptedPrivateKey.crypto_version, 2);
  assert.equal(result.encryptedPrivateKey.algorithm, "opaque");
  assert.ok(result.encryptedPrivateKey.payload.length > 0);
  assert.equal(result.encryptedPrivateKey.meta.entity, "identity_private_key");
});

test("getIdentityEncryptedKey rejects unknown user", async () => {
  const service = createService();
  await assert.rejects(
    () => service.getIdentityEncryptedKey("missing"),
    (err: unknown) => err instanceof AccountRecoveryError && err.code === "USER_NOT_FOUND",
  );
});
