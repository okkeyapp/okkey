import { decodeEncryptedBlobFromStorage } from "../crypto/encrypted-blob.ts";
import type { DevicesRepository, UsersRepository } from "../storage/repositories.ts";

export class VaultUnlockBootstrapError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, statusCode: number, message: string) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
  }
}

export interface VaultUnlockBootstrapWire {
  server_key_share: string;
  device_share: string;
  password_kdf_salt: string;
  password_kdf_params_version: number;
  encrypted_private_key: {
    crypto_version: number;
    algorithm: string;
    payload: string;
    meta: Record<string, unknown>;
  };
}

export interface VaultUnlockBootstrapDeps {
  users: Pick<UsersRepository, "loadVaultUnlockRow">;
  devices: Pick<DevicesRepository, "findTrustedDeviceShareForUnlock">;
}

/**
 * Same fingerprint rules as device register / findTrustedDeviceShareForUnlock:
 * legacy hex (32–128) or structured `web_app-chrome-macos-14.5`.
 */
export function isUnlockBootstrapFingerprint(value: string): boolean {
  const trimmed = value.trim();
  if (/^[0-9a-f]{32,128}$/i.test(trimmed)) {
    return true;
  }
  return /^(web_app|mobile_app|desktop_app|extension)-[a-z0-9]+-[a-z0-9]+-[a-z0-9.]+$/i.test(
    trimmed,
  );
}

export class VaultUnlockBootstrapService {
  private readonly users: VaultUnlockBootstrapDeps["users"];
  private readonly devices: VaultUnlockBootstrapDeps["devices"];

  constructor(deps: VaultUnlockBootstrapDeps) {
    this.users = deps.users;
    this.devices = deps.devices;
  }

  async getForUser(userId: string, deviceFingerprint: string | undefined): Promise<VaultUnlockBootstrapWire> {
    const row = await this.users.loadVaultUnlockRow(userId);
    if (!row) {
      throw new VaultUnlockBootstrapError("USER_NOT_FOUND", 404, "user not found");
    }

    const fp = deviceFingerprint?.trim();
    if (!fp || !isUnlockBootstrapFingerprint(fp)) {
      throw new VaultUnlockBootstrapError(
        "VAULT_UNLOCK_INVALID_FINGERPRINT",
        400,
        "device_fingerprint must be hex (32–128) or structured web_app-… id",
      );
    }

    const deviceShare = await this.devices.findTrustedDeviceShareForUnlock(
      userId,
      fp.toLowerCase(),
    );
    if (!deviceShare) {
      throw new VaultUnlockBootstrapError(
        "VAULT_UNLOCK_DEVICE_NOT_FOUND",
        404,
        "no trusted device match for unlock bootstrap",
      );
    }

    const encryptedPrivateKey = decodeEncryptedBlobFromStorage(row.encryptedPrivateKey);

    return {
      server_key_share: Buffer.from(row.serverKeyShare).toString("base64"),
      device_share: Buffer.from(deviceShare).toString("base64"),
      password_kdf_salt: Buffer.from(row.passwordKdfSalt).toString("base64"),
      password_kdf_params_version: row.passwordKdfParamsVersion,
      encrypted_private_key: {
        crypto_version: encryptedPrivateKey.crypto_version,
        algorithm: encryptedPrivateKey.algorithm,
        payload: encryptedPrivateKey.payload,
        meta: encryptedPrivateKey.meta,
      },
    };
  }
}
