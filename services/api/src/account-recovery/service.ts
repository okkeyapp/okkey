import {
  MIN_TRUSTED_CONTACTS_CONFIRMED,
  resolveAccountRecoveryEntitlements,
  type AccountRecoveryEntitlements,
  type AccountRecoveryKeyEnrollResponseDto,
  type AccountRecoverySettingsDto,
  type AccountRecoveryStatusResponseDto,
  type EncryptedBlobDto,
  type TrustedContactDto,
} from "@okkey/types";

import { generateEntityId } from "../entity-id.ts";
import { decodeEncryptedBlobFromStorage } from "../crypto/encrypted-blob.ts";
import { buildEmailAppPathUrl, type EmailTemplateService } from "../email/service.ts";
import type { AccountRecoveryRepository } from "../storage/account-recovery.ts";
import type { UsersRepository, WorkspacesRepository } from "../storage/repositories.ts";

export class AccountRecoveryError extends Error {
  readonly code: string;
  readonly statusCode: number;
  readonly details?: Record<string, unknown>;

  constructor(
    code: string,
    statusCode: number,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

export interface AccountRecoveryServiceDeps {
  recovery: AccountRecoveryRepository;
  workspaces: Pick<WorkspacesRepository, "listAccessibleByUser">;
  users: Pick<
    UsersRepository,
    "findById" | "findByEmail" | "loadVaultUnlockRow" | "loadAccountProfile"
  >;
  emailTemplates?: Pick<EmailTemplateService, "sendTrustedContactInviteBestEffort">;
  publicAppBaseUrl?: string;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Accept plain addresses and common paste/autofill shapes like `Name <a@b.com>`.
 */
export function extractEmailAddress(raw: string): string {
  const trimmed = raw.trim();
  const angle = trimmed.match(/<([^<>@\s]+@[^<>@\s]+\.[^<>@\s]+)>/);
  if (angle?.[1]) {
    return normalizeEmail(angle[1]);
  }
  return normalizeEmail(trimmed);
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/** Pull invite emails from `{ email }`, `{ emails }`, or invite-members `{ invitations }`. */
export function extractTrustedContactInviteEmails(body: {
  email?: unknown;
  emails?: unknown;
  invitations?: unknown;
}): string[] {
  const out: string[] = [];
  const push = (value: unknown) => {
    if (typeof value !== "string") {
      return;
    }
    const email = extractEmailAddress(value);
    if (email && !out.includes(email)) {
      out.push(email);
    }
  };

  push(body.email);
  if (Array.isArray(body.emails)) {
    for (const entry of body.emails) {
      push(entry);
    }
  }
  if (Array.isArray(body.invitations)) {
    for (const row of body.invitations) {
      if (row && typeof row === "object" && "email" in row) {
        push((row as { email?: unknown }).email);
      }
    }
  }
  return out;
}

function mapContact(record: {
  id: string;
  contactEmail: string;
  contactUserId: string | null;
  status: "pending" | "confirmed";
  createdAt: string;
  confirmedAt: string | null;
}): TrustedContactDto {
  return {
    id: record.id,
    email: record.contactEmail,
    contactUserId: record.contactUserId,
    status: record.status,
    createdAt: record.createdAt,
    confirmedAt: record.confirmedAt,
  };
}

function defaultSettings(entitlements: AccountRecoveryEntitlements): AccountRecoverySettingsDto {
  return {
    keyEnabled: true,
    devicesEnabled: entitlements.trustedDevices,
    contactsEnabled: false,
  };
}

function formatInviterDisplayName(input: {
  firstName: string | null;
  lastName: string | null;
  email: string;
}): string {
  const name = [input.firstName, input.lastName]
    .map((part) => (typeof part === "string" ? part.trim() : ""))
    .filter((part) => part.length > 0)
    .join(" ");
  return name || input.email;
}

export class AccountRecoveryService {
  private readonly recovery: AccountRecoveryServiceDeps["recovery"];
  private readonly workspaces: AccountRecoveryServiceDeps["workspaces"];
  private readonly users: AccountRecoveryServiceDeps["users"];
  private readonly emailTemplates?: AccountRecoveryServiceDeps["emailTemplates"];
  private readonly publicAppBaseUrl: string;

  constructor(deps: AccountRecoveryServiceDeps) {
    this.recovery = deps.recovery;
    this.workspaces = deps.workspaces;
    this.users = deps.users;
    this.emailTemplates = deps.emailTemplates;
    this.publicAppBaseUrl = deps.publicAppBaseUrl ?? "";
  }

  async resolveEntitlements(userId: string): Promise<AccountRecoveryEntitlements> {
    const workspaces = await this.workspaces.listAccessibleByUser(userId);
    return resolveAccountRecoveryEntitlements(workspaces);
  }

  async getStatus(userId: string): Promise<AccountRecoveryStatusResponseDto> {
    const entitlements = await this.resolveEntitlements(userId);
    const [wrap, settingsRow, contacts, pendingInvites] = await Promise.all([
      this.recovery.getWrap(userId),
      this.recovery.getSettings(userId),
      this.recovery.listContacts(userId),
      this.recovery.listPendingInvitesForContact(userId),
    ]);

    const defaults = defaultSettings(entitlements);
    const settings: AccountRecoverySettingsDto = settingsRow
      ? {
          keyEnabled: settingsRow.keyEnabled,
          devicesEnabled: entitlements.trustedDevices ? settingsRow.devicesEnabled : false,
          contactsEnabled: entitlements.trustedContacts ? settingsRow.contactsEnabled : false,
        }
      : defaults;

    const confirmedContactCount = contacts.filter((c) => c.status === "confirmed").length;

    return {
      entitlements: {
        recoveryKey: true,
        trustedDevices: entitlements.trustedDevices,
        trustedContacts: entitlements.trustedContacts,
      },
      settings,
      key: {
        enrolled: Boolean(wrap),
        createdAt: wrap?.createdAt ?? null,
        rotatedAt: wrap?.rotatedAt ?? null,
        exportedAt: wrap?.exportedAt ?? null,
      },
      contacts: contacts.map(mapContact),
      confirmedContactCount,
      minConfirmedContacts: MIN_TRUSTED_CONTACTS_CONFIRMED,
      pendingInvites: pendingInvites.map((invite) => ({
        id: invite.id,
        ownerEmail: invite.ownerEmail,
        ownerFirstName: invite.ownerFirstName,
        ownerLastName: invite.ownerLastName,
        createdAt: invite.createdAt,
      })),
    };
  }

  async updateSettings(
    userId: string,
    patch: {
      keyEnabled?: boolean;
      devicesEnabled?: boolean;
      contactsEnabled?: boolean;
    },
  ): Promise<AccountRecoveryStatusResponseDto> {
    const entitlements = await this.resolveEntitlements(userId);
    const current = await this.getStatus(userId);
    const next: AccountRecoverySettingsDto = {
      keyEnabled: patch.keyEnabled ?? current.settings.keyEnabled,
      devicesEnabled: patch.devicesEnabled ?? current.settings.devicesEnabled,
      contactsEnabled: patch.contactsEnabled ?? current.settings.contactsEnabled,
    };

    if (patch.devicesEnabled === true && !entitlements.trustedDevices) {
      throw new AccountRecoveryError(
        "RECOVERY_ENTITLEMENT_REQUIRED",
        403,
        "trusted devices recovery requires a paid plan entitlement",
      );
    }
    if (patch.contactsEnabled === true) {
      if (!entitlements.trustedContacts) {
        throw new AccountRecoveryError(
          "RECOVERY_ENTITLEMENT_REQUIRED",
          403,
          "trusted contacts recovery requires a paid plan entitlement",
        );
      }
      if (current.confirmedContactCount < MIN_TRUSTED_CONTACTS_CONFIRMED) {
        throw new AccountRecoveryError(
          "RECOVERY_CONTACTS_INSUFFICIENT",
          400,
          `at least ${MIN_TRUSTED_CONTACTS_CONFIRMED} confirmed contacts are required`,
          { min: MIN_TRUSTED_CONTACTS_CONFIRMED, confirmed: current.confirmedContactCount },
        );
      }
    }

    if (!entitlements.trustedDevices) {
      next.devicesEnabled = false;
    }
    if (!entitlements.trustedContacts) {
      next.contactsEnabled = false;
    }

    if (patch.keyEnabled === false) {
      await this.recovery.deleteWrap(userId);
    }

    await this.recovery.upsertSettings(userId, next);
    return this.getStatus(userId);
  }

  async enrollKey(
    userId: string,
    encryptedBlob: EncryptedBlobDto,
    options?: { rotate?: boolean },
  ): Promise<AccountRecoveryKeyEnrollResponseDto> {
    this.assertValidRecoveryWrap(encryptedBlob);
    const entitlements = await this.resolveEntitlements(userId);
    const existing = await this.recovery.getWrap(userId);
    const rotate = Boolean(options?.rotate) || Boolean(existing);
    const wrap = await this.recovery.upsertWrap(userId, encryptedBlob, rotate);

    const settingsRow = await this.recovery.getSettings(userId);
    const settings = settingsRow
      ? {
          keyEnabled: true,
          devicesEnabled: entitlements.trustedDevices ? settingsRow.devicesEnabled : false,
          contactsEnabled: entitlements.trustedContacts ? settingsRow.contactsEnabled : false,
        }
      : defaultSettings(entitlements);

    await this.recovery.upsertSettings(userId, {
      ...settings,
      keyEnabled: true,
    });

    return {
      key: {
        enrolled: true,
        createdAt: wrap.createdAt,
        rotatedAt: wrap.rotatedAt,
        exportedAt: wrap.exportedAt,
      },
      settings: {
        ...settings,
        keyEnabled: true,
      },
    };
  }

  async ackKeyExport(userId: string): Promise<AccountRecoveryStatusResponseDto> {
    const wrap = await this.recovery.markExported(userId);
    if (!wrap) {
      throw new AccountRecoveryError("RECOVERY_KEY_NOT_ENROLLED", 404, "recovery key is not enrolled");
    }
    return this.getStatus(userId);
  }

  async getKeyWrap(userId: string): Promise<{ encryptedBlob: EncryptedBlobDto }> {
    const status = await this.getStatus(userId);
    if (!status.settings.keyEnabled || !status.key.enrolled) {
      throw new AccountRecoveryError(
        "RECOVERY_KEY_NOT_AVAILABLE",
        404,
        "recovery key is not available for this account",
      );
    }
    const wrap = await this.recovery.getWrap(userId);
    if (!wrap) {
      throw new AccountRecoveryError("RECOVERY_KEY_NOT_ENROLLED", 404, "recovery key is not enrolled");
    }
    return { encryptedBlob: wrap.encryptedBlob };
  }

  /**
   * Ciphertext-only identity private-key blob for post-recovery local bundle bootstrap.
   * Server never sees plaintext; required when restoring on a browser without a local vault bundle.
   */
  async getIdentityEncryptedKey(userId: string): Promise<{ encryptedPrivateKey: EncryptedBlobDto }> {
    const row = await this.users.loadVaultUnlockRow(userId);
    if (!row) {
      throw new AccountRecoveryError("USER_NOT_FOUND", 404, "user not found");
    }
    const encryptedPrivateKey = decodeEncryptedBlobFromStorage(row.encryptedPrivateKey);
    return {
      encryptedPrivateKey: {
        crypto_version: encryptedPrivateKey.crypto_version,
        algorithm: encryptedPrivateKey.algorithm,
        payload: encryptedPrivateKey.payload,
        meta: encryptedPrivateKey.meta,
      },
    };
  }

  async inviteContact(userId: string, rawEmail: string): Promise<TrustedContactDto> {
    const [contact] = await this.inviteContacts(userId, [rawEmail]);
    if (!contact) {
      throw new AccountRecoveryError("RECOVERY_EMAIL_INVALID", 400, "invalid email");
    }
    return contact;
  }

  async inviteContacts(userId: string, rawEmails: string[]): Promise<TrustedContactDto[]> {
    const entitlements = await this.resolveEntitlements(userId);
    if (!entitlements.trustedContacts) {
      throw new AccountRecoveryError(
        "RECOVERY_ENTITLEMENT_REQUIRED",
        403,
        "trusted contacts require a paid plan entitlement",
      );
    }

    const emails = rawEmails
      .map((raw) => extractEmailAddress(raw))
      .filter((email, index, all) => email.length > 0 && all.indexOf(email) === index);
    if (emails.length === 0) {
      throw new AccountRecoveryError("RECOVERY_EMAIL_INVALID", 400, "invalid email");
    }

    const owner = await this.users.findById(userId);
    if (!owner) {
      throw new AccountRecoveryError("USER_NOT_FOUND", 404, "user not found");
    }
    const ownerEmail = normalizeEmail(owner.email);
    const ownerProfile = await this.users.loadAccountProfile(userId);
    const inviterDisplayName = formatInviterDisplayName({
      firstName: ownerProfile?.firstName ?? null,
      lastName: ownerProfile?.lastName ?? null,
      email: ownerEmail,
    });
    const helpUrl = buildEmailAppPathUrl(
      this.publicAppBaseUrl,
      "/items?popup=settings|recovery",
    );

    const created: TrustedContactDto[] = [];
    for (const email of emails) {
      if (!isValidEmail(email)) {
        throw new AccountRecoveryError("RECOVERY_EMAIL_INVALID", 400, "invalid email");
      }
      if (email === ownerEmail) {
        throw new AccountRecoveryError(
          "RECOVERY_SELF_INVITE",
          400,
          "cannot invite yourself",
        );
      }

      const contactUser = await this.users.findByEmail(email);
      if (!contactUser) {
        throw new AccountRecoveryError(
          "RECOVERY_CONTACT_NOT_FOUND",
          404,
          "contact must be an existing Okkey user",
        );
      }

      const existing = await this.recovery.findContactByEmail(userId, email);
      if (existing) {
        throw new AccountRecoveryError("RECOVERY_CONTACT_EXISTS", 409, "contact already invited");
      }

      const row = await this.recovery.insertContact({
        id: generateEntityId(),
        userId,
        contactEmail: email,
        contactUserId: contactUser.id,
      });
      created.push(mapContact(row));

      if (this.emailTemplates) {
        await this.emailTemplates.sendTrustedContactInviteBestEffort({
          to: email,
          localeHints: {
            userLocale: contactUser.locale,
          },
          variables: {
            inviterDisplayName,
            inviterEmail: ownerEmail,
            helpUrl,
          },
        });
      }
    }
    return created;
  }

  async removeContact(userId: string, contactId: string): Promise<AccountRecoveryStatusResponseDto> {
    const deleted = await this.recovery.deleteContact(userId, contactId);
    if (!deleted) {
      throw new AccountRecoveryError("RECOVERY_CONTACT_NOT_FOUND", 404, "contact not found");
    }

    const status = await this.getStatus(userId);
    if (
      status.settings.contactsEnabled &&
      status.confirmedContactCount < MIN_TRUSTED_CONTACTS_CONFIRMED
    ) {
      await this.recovery.upsertSettings(userId, {
        ...status.settings,
        contactsEnabled: false,
      });
      return this.getStatus(userId);
    }
    return status;
  }

  async acceptInvite(contactUserId: string, inviteId: string): Promise<AccountRecoveryStatusResponseDto> {
    const confirmed = await this.recovery.confirmInvite(contactUserId, inviteId);
    if (!confirmed) {
      throw new AccountRecoveryError("RECOVERY_INVITE_NOT_FOUND", 404, "invite not found");
    }
    return this.getStatus(contactUserId);
  }

  async rejectInvite(contactUserId: string, inviteId: string): Promise<AccountRecoveryStatusResponseDto> {
    const rejected = await this.recovery.rejectInvite(contactUserId, inviteId);
    if (!rejected) {
      throw new AccountRecoveryError("RECOVERY_INVITE_NOT_FOUND", 404, "invite not found");
    }
    return this.getStatus(contactUserId);
  }

  private assertValidRecoveryWrap(blob: EncryptedBlobDto): void {
    if (!blob || typeof blob !== "object") {
      throw new AccountRecoveryError("RECOVERY_BAD_REQUEST", 400, "encryptedBlob is required");
    }
    if (typeof blob.payload !== "string" || blob.payload.length === 0) {
      throw new AccountRecoveryError("RECOVERY_BAD_REQUEST", 400, "encryptedBlob.payload is required");
    }
    if (blob.meta?.entity !== "vault_key_recovery_wrap") {
      throw new AccountRecoveryError(
        "RECOVERY_BAD_REQUEST",
        400,
        "encryptedBlob.meta.entity must be vault_key_recovery_wrap",
      );
    }
  }
}
