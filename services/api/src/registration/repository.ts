import type { QueryExecutor } from "../storage/postgres.ts";
import { serializeEncryptedBlobToStorage, type EncryptedBlob } from "../crypto/encrypted-blob.ts";

export interface RegistrationBundleInput {
  email: string;
  publicKey: string;
  encryptedPrivateKey: EncryptedBlob;
  serverKeyShare: Uint8Array;
  passwordKdfSalt: Uint8Array;
  passwordKdfParamsVersion: number;
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
  requestIp: string;
  nowIso: string;
}

export interface RegistrationBundleResult {
  userId: string;
  workspaceId: string;
  vaultId: string;
  deviceId: string;
}

export async function insertRegistrationBundle(
  tx: QueryExecutor,
  input: RegistrationBundleInput,
): Promise<RegistrationBundleResult> {
  const userRows = await tx.query<{ id: string }>(
    `
      INSERT INTO users (
        email,
        public_key,
        encrypted_private_key,
        server_key_share,
        password_kdf_salt,
        password_kdf_params_version
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id
    `,
    [
      input.email,
      input.publicKey,
      Buffer.from(serializeEncryptedBlobToStorage(input.encryptedPrivateKey)),
      Buffer.from(input.serverKeyShare),
      Buffer.from(input.passwordKdfSalt),
      input.passwordKdfParamsVersion,
    ],
  );
  const userId = userRows[0]?.id;
  if (!userId) {
    throw new Error("user insert returned no id");
  }

  const workspaceRows = await tx.query<{ id: string }>(
    `
      INSERT INTO workspaces (name, owner_id, plan_tier)
      VALUES ($1, $2, 'FREE')
      RETURNING id
    `,
    ["Personal", userId],
  );
  const workspaceId = workspaceRows[0]?.id;
  if (!workspaceId) {
    throw new Error("workspace insert returned no id");
  }

  const vaultRows = await tx.query<{ id: string }>(
    `
      INSERT INTO vaults (workspace_id, name, is_personal, owner_id)
      VALUES ($1, $2, true, $3)
      RETURNING id
    `,
    [workspaceId, "Personal", userId],
  );
  const vaultId = vaultRows[0]?.id;
  if (!vaultId) {
    throw new Error("vault insert returned no id");
  }

  const deviceRows = await tx.query<{ id: string }>(
    `
      INSERT INTO devices (
        user_id,
        device_fingerprint,
        device_name,
        device_public_key,
        device_share,
        platform,
        os_name,
        os_version,
        app_version,
        client_type,
        user_agent,
        ip_first,
        ip_last,
        status,
        last_seen_at,
        revoked_at
      )
      VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9, $10, $11,
        $12, $12,
        'trusted',
        $13::timestamptz,
        NULL
      )
      RETURNING id
    `,
    [
      userId,
      input.deviceFingerprint,
      input.deviceName,
      input.devicePublicKey,
      Buffer.from(input.deviceShare),
      input.platform,
      input.osName,
      input.osVersion,
      input.appVersion,
      input.clientType,
      input.userAgent,
      input.requestIp,
      input.nowIso,
    ],
  );
  const deviceId = deviceRows[0]?.id;
  if (!deviceId) {
    throw new Error("device insert returned no id");
  }

  return { userId, workspaceId, vaultId, deviceId };
}
