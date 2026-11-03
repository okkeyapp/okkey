import type { EncryptedBlobDto, VaultUnlockBootstrapResponseDto } from "@okkey/types";

/** Split-key unlock material stored on the client after bootstrap / registration. */
export interface StoredVaultBundle {
  server_key_share_b64: string;
  device_share_b64: string;
  password_kdf_salt_b64: string;
  password_kdf_params_version: number;
  encrypted_private_key: EncryptedBlobDto;
}

export function parseStoredVaultBundle(raw: unknown): StoredVaultBundle | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const o = raw as Partial<StoredVaultBundle>;
  if (
    !o.server_key_share_b64 ||
    !o.device_share_b64 ||
    !o.password_kdf_salt_b64 ||
    typeof o.password_kdf_params_version !== "number" ||
    !o.encrypted_private_key ||
    typeof o.encrypted_private_key !== "object"
  ) {
    return null;
  }
  return {
    server_key_share_b64: o.server_key_share_b64,
    device_share_b64: o.device_share_b64,
    password_kdf_salt_b64: o.password_kdf_salt_b64,
    password_kdf_params_version: o.password_kdf_params_version,
    encrypted_private_key: o.encrypted_private_key,
  };
}

export function mapVaultUnlockBootstrapToStored(
  dto: VaultUnlockBootstrapResponseDto,
): StoredVaultBundle {
  return {
    server_key_share_b64: dto.server_key_share,
    device_share_b64: dto.device_share,
    password_kdf_salt_b64: dto.password_kdf_salt,
    password_kdf_params_version: dto.password_kdf_params_version,
    encrypted_private_key: dto.encrypted_private_key,
  };
}
