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

function createService(overrides?: {
  workspaces?: { planTier: string; planCustomOverride?: boolean; planFeatureOverrides?: Record<string, boolean> }[];
  users?: { id: string; email: string; firstName?: string | null; lastName?: string | null }[];
  recovery?: Partial<AccountRecoveryRepository>;
  emailTemplates?: ConstructorParameters<typeof AccountRecoveryService>[0]["emailTemplates"];
  publicAppBaseUrl?: string;
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
    rejectInvite: async () => false,
    listMembershipsForContact: async () => [],
    deleteMembershipAsContact: async () => null,
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
      findById: async (id: string) => {
        const user = users.find((u) => u.id === id);
        if (!user) {
          return null;
        }
        return {
          id: user.id,
          email: user.email,
          publicKey: "pk",
          publicPqKey: null,
          locale: null,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        };
      },
      findByEmail: async (email: string) => {
        const user = users.find((u) => u.email.toLowerCase() === email.toLowerCase());
        if (!user) {
          return null;
        }
        return {
          id: user.id,
          email: user.email,
          publicKey: "pk",
          publicPqKey: null,
          locale: null,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        };
      },
      loadAccountProfile: async (userId: string) => {
        const user = users.find((u) => u.id === userId);
        if (!user) {
          return null;
        }
        return {
          email: user.email,
          firstName: user.firstName ?? null,
          lastName: user.lastName ?? null,
          locale: null,
          billingRegion: null,
          vaultIdleLockSeconds: 0,
          masterPasswordChangedAt: "2026-01-01T00:00:00.000Z",
        };
      },
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
    emailTemplates: overrides?.emailTemplates,
    publicAppBaseUrl: overrides?.publicAppBaseUrl,
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

test("inviteContacts accepts Name <email> paste and invite-members invitations shape", async () => {
  const service = createService({
    workspaces: [{ planTier: "PREMIUM" }],
  });
  const contacts = await service.inviteContacts("u1", ["Friend <friend@example.com>"]);
  assert.equal(contacts.length, 1);
  assert.equal(contacts[0]?.email, "friend@example.com");
});

test("inviteContact rejects self-invite with RECOVERY_SELF_INVITE", async () => {
  const service = createService({
    workspaces: [{ planTier: "PREMIUM" }],
  });
  await assert.rejects(
    () => service.inviteContact("u1", "owner@example.com"),
    (err: unknown) => err instanceof AccountRecoveryError && err.code === "RECOVERY_SELF_INVITE",
  );
});

test("inviteContact rejects FREE-only account", async () => {
  const service = createService();
  await assert.rejects(
    () => service.inviteContact("u1", "friend@example.com"),
    (err: unknown) => err instanceof AccountRecoveryError && err.code === "RECOVERY_ENTITLEMENT_REQUIRED",
  );
});

test("rejectInvite removes pending invite for contact user", async () => {
  const invites: Array<{
    id: string;
    userId: string;
    contactEmail: string;
    contactUserId: string;
    ownerEmail: string;
    ownerFirstName: string | null;
    ownerLastName: string | null;
    createdAt: string;
  }> = [
    {
      id: "inv1",
      userId: "u1",
      contactEmail: "friend@example.com",
      contactUserId: "u2",
      ownerEmail: "owner@example.com",
      ownerFirstName: "Alex",
      ownerLastName: "Okkey",
      createdAt: "2026-01-01T00:00:00.000Z",
    },
  ];
  const service = createService({
    workspaces: [{ planTier: "PREMIUM" }],
    recovery: {
      listPendingInvitesForContact: async (contactUserId: string) =>
        invites.filter((invite) => invite.contactUserId === contactUserId),
      rejectInvite: async (contactUserId: string, inviteId: string) => {
        const idx = invites.findIndex(
          (invite) => invite.id === inviteId && invite.contactUserId === contactUserId,
        );
        if (idx < 0) {
          return false;
        }
        invites.splice(idx, 1);
        return true;
      },
    },
  });
  const before = await service.getStatus("u2");
  assert.equal(before.pendingInvites.length, 1);
  assert.equal(before.pendingInvites[0]?.ownerFirstName, "Alex");
  const status = await service.rejectInvite("u2", "inv1");
  assert.equal(status.pendingInvites.length, 0);
});

test("leaveAsContact removes membership and disables owner contacts below minimum", async () => {
  const memberships: Array<{
    id: string;
    userId: string;
    ownerEmail: string;
    ownerFirstName: string | null;
    ownerLastName: string | null;
    createdAt: string;
    confirmedAt: string | null;
  }> = [
    {
      id: "c1",
      userId: "u1",
      ownerEmail: "owner@example.com",
      ownerFirstName: "Alex",
      ownerLastName: "Okkey",
      createdAt: "2026-01-01T00:00:00.000Z",
      confirmedAt: "2026-01-02T00:00:00.000Z",
    },
  ];
  const ownerContacts: Array<{
    id: string;
    userId: string;
    contactEmail: string;
    contactUserId: string | null;
    status: "pending" | "confirmed";
    createdAt: string;
    confirmedAt: string | null;
  }> = [
    {
      id: "c1",
      userId: "u1",
      contactEmail: "friend@example.com",
      contactUserId: "u2",
      status: "confirmed",
      createdAt: "2026-01-01T00:00:00.000Z",
      confirmedAt: "2026-01-02T00:00:00.000Z",
    },
  ];
  let ownerSettings = {
    userId: "u1",
    keyEnabled: false,
    devicesEnabled: false,
    contactsEnabled: true,
    updatedAt: "2026-01-01T00:00:00.000Z",
  };

  const service = createService({
    workspaces: [{ planTier: "PREMIUM" }],
    recovery: {
      getSettings: async (userId: string) => (userId === "u1" ? ownerSettings : null),
      upsertSettings: async (userId, input) => {
        ownerSettings = { userId, ...input, updatedAt: "2026-01-03T00:00:00.000Z" };
        return ownerSettings;
      },
      listContacts: async (userId: string) => ownerContacts.filter((c) => c.userId === userId),
      listMembershipsForContact: async (contactUserId: string) =>
        contactUserId === "u2" ? memberships : [],
      deleteMembershipAsContact: async (contactUserId: string, contactId: string) => {
        if (contactUserId !== "u2") {
          return null;
        }
        const idx = memberships.findIndex((row) => row.id === contactId);
        if (idx < 0) {
          return null;
        }
        const [removed] = memberships.splice(idx, 1);
        const ownerIdx = ownerContacts.findIndex((c) => c.id === contactId);
        if (ownerIdx >= 0) {
          ownerContacts.splice(ownerIdx, 1);
        }
        return { ownerUserId: removed.userId };
      },
    },
  });

  const before = await service.getStatus("u2");
  assert.equal(before.servingAsContact.length, 1);
  assert.equal(before.servingAsContact[0]?.ownerEmail, "owner@example.com");

  const after = await service.leaveAsContact("u2", "c1");
  assert.equal(after.servingAsContact.length, 0);
  assert.equal(ownerSettings.contactsEnabled, false);
});

test("inviteContacts sends trusted-contact invite email best-effort", async () => {
  const sends: Array<{ to: string; inviterDisplayName: string; inviterEmail: string }> = [];
  const service = createService({
    workspaces: [{ planTier: "PREMIUM" }],
    users: [
      { id: "u1", email: "owner@example.com", firstName: "Alex", lastName: "Okkey" },
      { id: "u2", email: "friend@example.com" },
    ],
    emailTemplates: {
      sendTrustedContactInviteBestEffort: async (input) => {
        sends.push({
          to: input.to,
          inviterDisplayName: input.variables.inviterDisplayName,
          inviterEmail: input.variables.inviterEmail,
        });
      },
    },
    publicAppBaseUrl: "https://app.example",
  });

  await service.inviteContacts("u1", ["friend@example.com"]);
  assert.equal(sends.length, 1);
  assert.equal(sends[0]?.to, "friend@example.com");
  assert.equal(sends[0]?.inviterDisplayName, "Alex Okkey");
  assert.equal(sends[0]?.inviterEmail, "owner@example.com");
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
