import {
  CLIENT_UPGRADE_REQUIRED,
  CLIENT_UPGRADE_REQUIRED_MESSAGE,
  CLIENT_UPGRADE_REQUIRED_STATUS,
  identityBundleRequiresCurrentClient,
} from "../crypto/client-upgrade.ts";
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
  devices: Pick<DevicesRepository, "findTrustedDeviceShareById">;
}

export class VaultUnlockBootstrapService {
  private readonly users: VaultUnlockBootstrapDeps["users"];
  private readonly devices: VaultUnlockBootstrapDeps["devices"];

  constructor(deps: VaultUnlockBootstrapDeps) {
    this.users = deps.users;
    this.devices = deps.devices;
  }

  /**
   * Key material for the trusted device bound to the current session.
   * The caller does not choose a device by fingerprint.
   */
  async getForBoundDevice(input: {
    userId: string;
    deviceId: string;
    /** When false, an ML-DSA identity bundle is refused so an old client fails loudly. */
    clientSupportsMlDsaIdentity?: boolean;
  }): Promise<VaultUnlockBootstrapWire> {
    const row = await this.users.loadVaultUnlockRow(input.userId);
    if (!row) {
      throw new VaultUnlockBootstrapError("USER_NOT_FOUND", 404, "user not found");
    }

    const found = await this.devices.findTrustedDeviceShareById(
      input.userId,
      input.deviceId,
    );
    if (!found) {
      throw new VaultUnlockBootstrapError(
        "VAULT_UNLOCK_DEVICE_NOT_FOUND",
        404,
        "no trusted device match for unlock bootstrap",
      );
    }
    const deviceShare = found.share;

    const encryptedPrivateKey = decodeEncryptedBlobFromStorage(row.encryptedPrivateKey);
    if (
      input.clientSupportsMlDsaIdentity === false &&
      identityBundleRequiresCurrentClient(encryptedPrivateKey.meta)
    ) {
      throw new VaultUnlockBootstrapError(
        CLIENT_UPGRADE_REQUIRED,
        CLIENT_UPGRADE_REQUIRED_STATUS,
        CLIENT_UPGRADE_REQUIRED_MESSAGE,
      );
    }

    return {
      server_key_share: Buffer.from(row.serverKeyShare).toString("base64"),
      device_share: deviceShare ? Buffer.from(deviceShare).toString("base64") : "",
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
