import type { EncryptedBlobDto, VaultUnlockBootstrapResponseDto } from "@okkey/types";

/**
 * Split-key unlock material kept on the device.
 * `server_key_share_b64` is optional: new writes omit it. A value is only a
 * legacy copy from before the server share stayed in memory for the session.
 */
export interface StoredVaultBundle {
  server_key_share_b64?: string;
  device_share_b64: string;
  password_kdf_salt_b64: string;
  password_kdf_params_version: number;
  encrypted_private_key: EncryptedBlobDto;
}

function nonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function parseStoredVaultBundle(raw: unknown): StoredVaultBundle | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const o = raw as Partial<StoredVaultBundle>;
  const deviceShare = nonEmptyString(o.device_share_b64);
  const salt = nonEmptyString(o.password_kdf_salt_b64);
  if (
    !deviceShare ||
    !salt ||
    typeof o.password_kdf_params_version !== "number" ||
    !o.encrypted_private_key ||
    typeof o.encrypted_private_key !== "object"
  ) {
    return null;
  }
  const serverShare = nonEmptyString(o.server_key_share_b64);
  return {
    ...(serverShare ? { server_key_share_b64: serverShare } : {}),
    device_share_b64: deviceShare,
    password_kdf_salt_b64: salt,
    password_kdf_params_version: o.password_kdf_params_version,
    encrypted_private_key: o.encrypted_private_key,
  };
}

/** Drop the server share so device storage never holds it in extractable form. */
export function omitServerKeyShare(bundle: StoredVaultBundle): StoredVaultBundle {
  return {
    device_share_b64: bundle.device_share_b64,
    password_kdf_salt_b64: bundle.password_kdf_salt_b64,
    password_kdf_params_version: bundle.password_kdf_params_version,
    encrypted_private_key: bundle.encrypted_private_key,
  };
}

export function mapVaultUnlockBootstrapToStored(
  dto: VaultUnlockBootstrapResponseDto,
): StoredVaultBundle {
  const serverShare = nonEmptyString(dto.server_key_share);
  return {
    ...(serverShare ? { server_key_share_b64: serverShare } : {}),
    device_share_b64: dto.device_share,
    password_kdf_salt_b64: dto.password_kdf_salt,
    password_kdf_params_version: dto.password_kdf_params_version,
    encrypted_private_key: dto.encrypted_private_key,
  };
}
