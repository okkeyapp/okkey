import {
  canEnableTrustedDevicesRecovery,
  MIN_TRUSTED_CONTACTS_CONFIRMED,
  MIN_TRUSTED_DEVICES_FOR_RECOVERY,
  resolveAccountRecoveryEntitlements,
  type AccountRecoveryEntitlements,
  type AccountRecoveryKeyEnrollResponseDto,
  type AccountRecoverySettingsDto,
  type AccountRecoveryStatusResponseDto,
  type EncryptedBlobDto,
  type TrustedDeviceGateItem,
} from "@okkey/types";

import { decodePossessionPublicKey } from "./possession-proof.ts";
import { decodeEncryptedBlobFromStorage } from "../crypto/encrypted-blob.ts";
import {
  planEntitlementRuntimeFromConfig,
  type PlanEntitlementRuntimeConfig,
} from "../plan-entitlements.ts";
import type { AccountRecoveryRepository } from "../storage/account-recovery.ts";
import type {
  DevicesRepository,
  UsersRepository,
  WorkspacesRepository,
} from "../storage/repositories.ts";

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
  users: Pick<UsersRepository, "loadVaultUnlockRow">;
  /** Used to enforce the trusted-devices recovery enable gate. */
  devices: Pick<DevicesRepository, "listByUser">;
  /** When set, self-hosted recovery gates on modules instead of `plan_tier`. */
  config?: PlanEntitlementRuntimeConfig;
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

function defaultSettings(_entitlements: AccountRecoveryEntitlements): AccountRecoverySettingsDto {
  return {
    keyEnabled: true,
    // Off until the user explicitly enables after meeting the trusted-device minimum.
    devicesEnabled: false,
    contactsEnabled: false,
  };
}

export class AccountRecoveryService {
  private readonly recovery: AccountRecoveryServiceDeps["recovery"];
  private readonly workspaces: AccountRecoveryServiceDeps["workspaces"];
  private readonly users: AccountRecoveryServiceDeps["users"];
  private readonly devices: AccountRecoveryServiceDeps["devices"];
  private readonly config?: PlanEntitlementRuntimeConfig;

  constructor(deps: AccountRecoveryServiceDeps) {
    this.recovery = deps.recovery;
    this.workspaces = deps.workspaces;
    this.users = deps.users;
    this.devices = deps.devices;
    this.config = deps.config;
  }

  async resolveEntitlements(userId: string): Promise<AccountRecoveryEntitlements> {
    const workspaces = await this.workspaces.listAccessibleByUser(userId);
    return resolveAccountRecoveryEntitlements(
      workspaces,
      this.config ? planEntitlementRuntimeFromConfig(this.config) : undefined,
    );
  }

  async hasEnrolledRecoveryKey(userId: string): Promise<boolean> {
    const wrap = await this.recovery.getWrap(userId);
    return wrap !== null;
  }

  /** Vault use requires the wrap and an export acknowledgement (copy/PDF). */
  async hasExportedRecoveryKey(userId: string): Promise<boolean> {
    const wrap = await this.recovery.getWrap(userId);
    return wrap !== null && wrap.exportedAt !== null;
  }

  async getStatus(userId: string): Promise<AccountRecoveryStatusResponseDto> {
    const entitlements = await this.resolveEntitlements(userId);
    const [wrap, settingsRow] = await Promise.all([
      this.recovery.getWrap(userId),
      this.recovery.getSettings(userId),
    ]);

    const defaults = defaultSettings(entitlements);
    const settings: AccountRecoverySettingsDto = settingsRow
      ? {
          keyEnabled: settingsRow.keyEnabled,
          devicesEnabled: entitlements.trustedDevices ? settingsRow.devicesEnabled : false,
          // Directory stays out of core. Report the stored flag only when the plan allows it.
          contactsEnabled: entitlements.trustedContacts ? settingsRow.contactsEnabled : false,
        }
      : defaults;

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
      contacts: [],
      confirmedContactCount: 0,
      minConfirmedContacts: MIN_TRUSTED_CONTACTS_CONFIRMED,
      pendingInvites: [],
      servingAsContact: [],
    };
  }

  async updateSettings(
    userId: string,
    patch: {
      keyEnabled?: boolean;
      devicesEnabled?: boolean;
      contactsEnabled?: boolean;
    },
    options?: { currentFingerprint?: string | null },
  ): Promise<AccountRecoveryStatusResponseDto> {
    if (patch.contactsEnabled === true) {
      throw new AccountRecoveryError(
        "RECOVERY_CONTACTS_UNAVAILABLE",
        403,
        "trusted contacts catalog is not available in core",
      );
    }
    const entitlements = await this.resolveEntitlements(userId);
    const current = await this.getStatus(userId);
    const stored = await this.recovery.getSettings(userId);
    const next: AccountRecoverySettingsDto = {
      keyEnabled: patch.keyEnabled ?? current.settings.keyEnabled,
      devicesEnabled: patch.devicesEnabled ?? current.settings.devicesEnabled,
      // Core does not toggle the contacts method. Keep the stored bit for the module.
      contactsEnabled: stored?.contactsEnabled ?? false,
    };

    if (patch.devicesEnabled === true) {
      if (!entitlements.trustedDevices) {
        throw new AccountRecoveryError(
          "RECOVERY_ENTITLEMENT_REQUIRED",
          403,
          "trusted devices recovery requires a paid plan entitlement",
        );
      }
      const gateItems = await this.listTrustedDeviceGateItems(
        userId,
        options?.currentFingerprint,
      );
      if (!canEnableTrustedDevicesRecovery(gateItems)) {
        const trustedCount = gateItems.filter((d) => d.status === "trusted").length;
        throw new AccountRecoveryError(
          "RECOVERY_DEVICES_INSUFFICIENT",
          400,
          `at least ${MIN_TRUSTED_DEVICES_FOR_RECOVERY} trusted devices including the current one are required`,
          {
            min: MIN_TRUSTED_DEVICES_FOR_RECOVERY,
            trusted: trustedCount,
            hasCurrentTrusted: gateItems.some((d) => d.status === "trusted" && d.is_current),
          },
        );
      }
    }
    if (!entitlements.trustedDevices) {
      next.devicesEnabled = false;
    }

    if (patch.keyEnabled === false) {
      throw new AccountRecoveryError(
        "RECOVERY_KEY_REQUIRED",
        403,
        "recovery key cannot be disabled",
      );
    }

    await this.recovery.upsertSettings(userId, next);
    return this.getStatus(userId);
  }

  async enrollKey(
    userId: string,
    encryptedBlob: EncryptedBlobDto,
    options?: { rotate?: boolean; forbidRotate?: boolean; possessionPublicKey?: string | null },
  ): Promise<AccountRecoveryKeyEnrollResponseDto> {
    this.assertValidRecoveryWrap(encryptedBlob);
    const possessionPublicKey = this.normalizePossessionPublicKey(options?.possessionPublicKey);
    const entitlements = await this.resolveEntitlements(userId);
    const existing = await this.recovery.getWrap(userId);
    const rotate = Boolean(options?.rotate) || Boolean(existing);
    if (options?.forbidRotate && rotate) {
      throw new AccountRecoveryError(
        "RECOVERY_ROTATE_FORBIDDEN",
        403,
        "recovery key rotation is not allowed for this session",
      );
    }

    let wrap: Awaited<ReturnType<AccountRecoveryRepository["upsertWrap"]>>;
    if (options?.forbidRotate) {
      // Atomic first-enroll: concurrent losers hit ON CONFLICT DO NOTHING → forbidden.
      const inserted = await this.recovery.insertWrapIfAbsent(
        userId,
        encryptedBlob,
        possessionPublicKey,
      );
      if (!inserted) {
        throw new AccountRecoveryError(
          "RECOVERY_ROTATE_FORBIDDEN",
          403,
          "recovery key rotation is not allowed for this session",
        );
      }
      wrap = inserted;
    } else {
      wrap = await this.recovery.upsertWrap(userId, encryptedBlob, rotate, possessionPublicKey);
    }

    const settingsRow = await this.recovery.getSettings(userId);
    const storedContactsEnabled = settingsRow?.contactsEnabled ?? false;
    const settings = {
      keyEnabled: true,
      devicesEnabled: entitlements.trustedDevices ? Boolean(settingsRow?.devicesEnabled) : false,
      contactsEnabled: storedContactsEnabled,
    };

    await this.recovery.upsertSettings(userId, settings);

    return {
      key: {
        enrolled: true,
        createdAt: wrap.createdAt,
        rotatedAt: wrap.rotatedAt,
        exportedAt: wrap.exportedAt,
      },
      settings: {
        ...settings,
        contactsEnabled: entitlements.trustedContacts ? storedContactsEnabled : false,
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
   * Whether this account can be proved from an untrusted device.
   * Legacy wraps have no verifying key. This method never returns ciphertext.
   */
  async getRecoveryPossession(
    userId: string,
  ): Promise<{ kind: "unavailable" } | { kind: "legacy" } | { kind: "ready"; publicKey: string }> {
    const status = await this.getStatus(userId);
    if (!status.settings.keyEnabled || !status.key.enrolled) {
      return { kind: "unavailable" };
    }
    const wrap = await this.recovery.getWrap(userId);
    if (!wrap) {
      return { kind: "unavailable" };
    }
    if (!wrap.possessionPublicKey) {
      return { kind: "legacy" };
    }
    return { kind: "ready", publicKey: wrap.possessionPublicKey };
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


  private async listTrustedDeviceGateItems(
    userId: string,
    currentFingerprint?: string | null,
  ): Promise<TrustedDeviceGateItem[]> {
    const normalized =
      typeof currentFingerprint === "string" && currentFingerprint.trim().length > 0
        ? currentFingerprint.trim().toLowerCase()
        : null;
    const records = await this.devices.listByUser(userId, ["trusted", "pending", "blocked"]);
    return records.map((record) => {
      const status =
        record.status === "pending"
          ? "pending_approval"
          : record.status === "blocked"
            ? "blocked"
            : "trusted";
      return {
        status,
        is_current:
          normalized !== null &&
          record.status === "trusted" &&
          record.deviceFingerprint.toLowerCase() === normalized,
      };
    });
  }

  private normalizePossessionPublicKey(value: string | null | undefined): string | null {
    if (value == null || value.trim() === "") {
      return null;
    }
    const decoded = decodePossessionPublicKey(value);
    if (!decoded) {
      throw new AccountRecoveryError(
        "RECOVERY_BAD_REQUEST",
        400,
        "possessionPublicKey must be a base64 Ed25519 public key",
      );
    }
    return decoded.toString("base64");
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
    if (blob.meta.key_scope !== "account") {
      throw new AccountRecoveryError(
        "RECOVERY_BAD_REQUEST",
        400,
        "encryptedBlob.meta.key_scope must be account",
      );
    }
  }
}
