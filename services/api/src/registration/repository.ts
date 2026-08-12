import { DEFAULT_NEW_VAULT_CRYPTO_VERSION } from "../crypto/downgrade.ts";
import { generateEntityId } from "../entity-id.ts";
import type { QueryExecutor } from "../storage/postgres.ts";
import { serializeEncryptedBlobToStorage, type EncryptedBlob } from "../crypto/encrypted-blob.ts";
import { ensureDefaultWorkspaceRoles } from "../workspace-roles/seed.ts";
import { ensureDefaultWorkspaceProfiles } from "../workspace-profiles/seed.ts";

export interface RegistrationBundleInput {
  email: string;
  publicKey: string;
  publicPqKey: string;
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
  /** Default personal workspace + vault label; server default is "Personal". */
  personalWorkspaceName?: string;
  /** Optional display name fields (stored server-side for UX after client storage loss). */
  firstName?: string | null;
  lastName?: string | null;
  /** Plan for the personal workspace created at registration. */
  planTier?: string;
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
  const userId = generateEntityId();
  const userRows = await tx.query<{ id: string }>(
    `
      INSERT INTO users (
        id,
        email,
        public_key,
        public_pq_key,
        encrypted_private_key,
        server_key_share,
        password_kdf_salt,
        password_kdf_params_version,
        first_name,
        last_name,
        last_vault_unlocked_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::timestamptz)
      RETURNING id
    `,
    [
      userId,
      input.email,
      input.publicKey,
      input.publicPqKey,
      Buffer.from(serializeEncryptedBlobToStorage(input.encryptedPrivateKey)),
      Buffer.from(input.serverKeyShare),
      Buffer.from(input.passwordKdfSalt),
      input.passwordKdfParamsVersion,
      input.firstName ?? null,
      input.lastName ?? null,
      input.nowIso,
    ],
  );
  const insertedUserId = userRows[0]?.id;
  if (!insertedUserId) {
    throw new Error("user insert returned no id");
  }

  const workspaceLabel = input.personalWorkspaceName?.trim() || "Personal";
  const workspaceId = generateEntityId();

  const workspaceRows = await tx.query<{ id: string }>(
    `
      INSERT INTO workspaces (id, name, owner_id, plan_tier)
      VALUES ($1, $2, $3, $4)
      RETURNING id
    `,
    [workspaceId, workspaceLabel, insertedUserId, input.planTier ?? "FREE"],
  );
  const insertedWorkspaceId = workspaceRows[0]?.id;
  if (!insertedWorkspaceId) {
    throw new Error("workspace insert returned no id");
  }

  await ensureDefaultWorkspaceRoles(tx, insertedWorkspaceId, insertedUserId);
  await ensureDefaultWorkspaceProfiles(tx, insertedWorkspaceId);

  const vaultId = generateEntityId();
  const vaultRows = await tx.query<{ id: string }>(
    `
      INSERT INTO vaults (id, workspace_id, name, is_personal, owner_id, crypto_version)
      VALUES ($1, $2, $3, true, $4, $5)
      RETURNING id
    `,
    [vaultId, insertedWorkspaceId, workspaceLabel, insertedUserId, DEFAULT_NEW_VAULT_CRYPTO_VERSION],
  );
  const insertedVaultId = vaultRows[0]?.id;
  if (!insertedVaultId) {
    throw new Error("vault insert returned no id");
  }

  const deviceId = generateEntityId();
  const deviceRows = await tx.query<{ id: string }>(
    `
      INSERT INTO devices (
        id,
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
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9, $10, $11, $12,
        $13, $13,
        'trusted',
        $14::timestamptz,
        NULL
      )
      RETURNING id
    `,
    [
      deviceId,
      insertedUserId,
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
  const insertedDeviceId = deviceRows[0]?.id;
  if (!insertedDeviceId) {
    throw new Error("device insert returned no id");
  }

  return {
    userId: insertedUserId,
    workspaceId: insertedWorkspaceId,
    vaultId: insertedVaultId,
    deviceId: insertedDeviceId,
  };
}
