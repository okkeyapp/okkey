import assert from "node:assert/strict";
import test from "node:test";

import { AccountRecoveryError, AccountRecoveryService } from "../src/account-recovery/service.ts";
import type { AccountRecoveryRepository } from "../src/storage/account-recovery.ts";

function createService(overrides?: {
  workspaces?: { planTier: string; planCustomOverride?: boolean; planFeatureOverrides?: Record<string, boolean> }[];
  users?: { id: string; email: string }[];
  recovery?: Partial<AccountRecoveryRepository>;
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
    ...overrides?.recovery,
  } as AccountRecoveryRepository;

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
          monitoringCardSettings: {} as never,
          tileColor: null,
          logoVaultId: null,
          logoAttachmentId: null,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        })),
    },
    users: {
      findById: async (id: string) => users.find((u) => u.id === id) ?? null,
      findByEmail: async (email: string) =>
        users.find((u) => u.email.toLowerCase() === email.toLowerCase()) ?? null,
    },
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

test("enrollKey persists wrap and enables key settings", async () => {
  const service = createService();
  const result = await service.enrollKey("u1", {
    crypto_version: 2,
    algorithm: "xchacha20-poly1305",
    payload: "abc",
    meta: { entity: "vault_key_recovery_wrap", key_scope: "account" },
  });
  assert.equal(result.key.enrolled, true);
  assert.equal(result.settings.keyEnabled, true);
});

test("devicesEnabled requires paid entitlement", async () => {
  const service = createService();
  await assert.rejects(
    () => service.updateSettings("u1", { devicesEnabled: true }),
    (err: unknown) => err instanceof AccountRecoveryError && err.code === "RECOVERY_ENTITLEMENT_REQUIRED",
  );
});

test("inviteContact works on PREMIUM membership", async () => {
  const service = createService({
    workspaces: [{ planTier: "PREMIUM" }],
  });
  const contact = await service.inviteContact("u1", "friend@example.com");
  assert.equal(contact.email, "friend@example.com");
  assert.equal(contact.status, "pending");
});

test("inviteContact rejects FREE-only account", async () => {
  const service = createService();
  await assert.rejects(
    () => service.inviteContact("u1", "friend@example.com"),
    (err: unknown) => err instanceof AccountRecoveryError && err.code === "RECOVERY_ENTITLEMENT_REQUIRED",
  );
});
