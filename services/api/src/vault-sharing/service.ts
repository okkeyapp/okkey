import type { QueryExecutor } from "../storage/postgres.ts";
import type { VaultsRepository } from "../storage/repositories.ts";
import type { ApiConfig } from "../config.ts";
import {
  CRYPTO_POLICY_VIOLATION,
  CRYPTO_POLICY_VIOLATION_STATUS_CODE,
  buildCryptoPolicyDetails,
  isCryptoProfileAllowed,
} from "../crypto/policy.ts";

export class VaultSharingServiceError extends Error {
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

export interface VaultShareListEntry {
  userId: string;
  email: string;
  publicKey: string;
  role: string | null;
  encryptedVaultKey: string | null;
}

export interface ShareVaultInput {
  recipientUserId: string;
  encryptedVaultKey: string;
  encryptedPayload: string;
  baseVersion: number;
  payloadSchemaVersion?: number;
  idempotencyKey?: string;
  clientCreatedAt?: string;
  role?: string;
}

export interface RevokeVaultInput {
  recipientUserId: string;
  rotatedVaultKeys: Array<{ userId: string; encryptedVaultKey: string }>;
  encryptedPayload: string;
  baseVersion: number;
  payloadSchemaVersion?: number;
  idempotencyKey?: string;
  clientCreatedAt?: string;
}

export interface VaultSharingServiceDeps {
  db: QueryExecutor & {
    transaction<T>(fn: (tx: QueryExecutor) => Promise<T>): Promise<T>;
  };
  vaults: Pick<VaultsRepository, "findById" | "canReadVault">;
  config?: Pick<ApiConfig, "allowedCryptoProfileVersions">;
}

interface VaultAclMeta {
  vaultId: string;
  workspaceId: string;
  workspaceOwnerId: string;
  vaultOwnerId: string | null;
}

const UUID_RE = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;
const SHARE_MANAGER_ROLES = new Set(["owner", "admin"]);

function parseBase64Bytes(input: string): Uint8Array {
  const bytes = Uint8Array.from(Buffer.from(input, "base64"));
  if (bytes.length === 0 || Buffer.from(bytes).toString("base64") !== input) {
    throw new VaultSharingServiceError(
      "VAULT_KEY_WRAP_INVALID",
      400,
      "encryptedVaultKey must be valid base64",
    );
  }
  return bytes;
}

export class VaultSharingService {
  private readonly db: VaultSharingServiceDeps["db"];
  private readonly vaults: VaultSharingServiceDeps["vaults"];
  private readonly config: Pick<ApiConfig, "allowedCryptoProfileVersions">;

  constructor(deps: VaultSharingServiceDeps) {
    this.db = deps.db;
    this.vaults = deps.vaults;
    this.config = deps.config ?? { allowedCryptoProfileVersions: [1, 2] };
  }

  async getUserVaultKey(vaultId: string, userId: string): Promise<{ encryptedVaultKey: string }> {
    await this.ensureVaultReadable(vaultId, userId);
    const rows = await this.db.query<{ encrypted_vault_key: Buffer }>(
      "SELECT encrypted_vault_key FROM vault_keys WHERE vault_id = $1 AND user_id = $2",
      [vaultId, userId],
    );
    if (!rows[0]) {
      throw new VaultSharingServiceError("VAULT_KEY_NOT_FOUND", 404, "vault key not found");
    }
    return {
      encryptedVaultKey: Buffer.from(rows[0].encrypted_vault_key).toString("base64"),
    };
  }

  async listVaultShares(vaultId: string, actorId: string): Promise<VaultShareListEntry[]> {
    await this.ensureCanManageShares(vaultId, actorId);
    const rows = await this.db.query<{
      user_id: string;
      email: string;
      public_key: string;
      role: string | null;
      encrypted_vault_key: Buffer | null;
    }>(
      `
        SELECT
          u.id AS user_id,
          u.email,
          u.public_key,
          vm.role,
          vk.encrypted_vault_key
        FROM vault_members vm
        INNER JOIN users u
          ON u.id = vm.user_id
        LEFT JOIN vault_keys vk
          ON vk.vault_id = vm.vault_id
         AND vk.user_id = vm.user_id
        WHERE vm.vault_id = $1
        ORDER BY vm.created_at ASC
      `,
      [vaultId],
    );
    return rows.map((row) => ({
      userId: row.user_id,
      email: row.email,
      publicKey: row.public_key,
      role: row.role,
      encryptedVaultKey: row.encrypted_vault_key
        ? Buffer.from(row.encrypted_vault_key).toString("base64")
        : null,
    }));
  }

  async shareVault(vaultId: string, actorId: string, input: ShareVaultInput): Promise<void> {
    const acl = await this.ensureCanManageShares(vaultId, actorId);
    if (!UUID_RE.test(input.recipientUserId)) {
      throw new VaultSharingServiceError(
        "VAULT_SHARE_INVALID_RECIPIENT",
        400,
        "recipientUserId must be uuid",
      );
    }
    if (input.recipientUserId === acl.workspaceOwnerId || input.recipientUserId === acl.vaultOwnerId) {
      throw new VaultSharingServiceError(
        "VAULT_SHARE_INVALID_RECIPIENT",
        400,
        "recipient already has implicit access",
      );
    }
    const wrappedKey = parseBase64Bytes(input.encryptedVaultKey);
    const payloadBytes = parseBase64Bytes(input.encryptedPayload);
    await this.ensureRecipientInWorkspace(acl.workspaceId, input.recipientUserId);

    await this.db.transaction(async (tx) => {
      await tx.query(
        `
          INSERT INTO vault_members (vault_id, user_id, role)
          VALUES ($1, $2, $3)
          ON CONFLICT (vault_id, user_id)
          DO UPDATE SET role = EXCLUDED.role
        `,
        [vaultId, input.recipientUserId, input.role ?? "member"],
      );
      await tx.query(
        `
          INSERT INTO vault_keys (vault_id, user_id, encrypted_vault_key)
          VALUES ($1, $2, $3)
          ON CONFLICT (vault_id, user_id)
          DO UPDATE SET encrypted_vault_key = EXCLUDED.encrypted_vault_key,
                        created_at = now()
        `,
        [vaultId, input.recipientUserId, Buffer.from(wrappedKey)],
      );
      await this.appendVaultEventTx(tx, vaultId, actorId, "VAULT_SHARE", payloadBytes, input);
    });
  }

  async revokeVaultAccess(vaultId: string, actorId: string, input: RevokeVaultInput): Promise<void> {
    const acl = await this.ensureCanManageShares(vaultId, actorId);
    if (input.recipientUserId === acl.workspaceOwnerId || input.recipientUserId === acl.vaultOwnerId) {
      throw new VaultSharingServiceError(
        "VAULT_SHARE_FORBIDDEN",
        403,
        "cannot revoke implicit owner access",
      );
    }
    const payloadBytes = parseBase64Bytes(input.encryptedPayload);
    const rotatedMap = new Map<string, Uint8Array>();
    for (const keyEntry of input.rotatedVaultKeys) {
      if (!UUID_RE.test(keyEntry.userId)) {
        throw new VaultSharingServiceError(
          "VAULT_SHARE_INVALID_RECIPIENT",
          400,
          "rotatedVaultKeys.userId must be uuid",
        );
      }
      rotatedMap.set(keyEntry.userId, parseBase64Bytes(keyEntry.encryptedVaultKey));
    }

    await this.db.transaction(async (tx) => {
      const membership = await tx.query<{ id: string }>(
        "SELECT id FROM vault_members WHERE vault_id = $1 AND user_id = $2",
        [vaultId, input.recipientUserId],
      );
      if (!membership[0]) {
        throw new VaultSharingServiceError("MEMBERSHIP_CONFLICT", 409, "recipient is not a vault member");
      }

      await tx.query("DELETE FROM vault_members WHERE vault_id = $1 AND user_id = $2", [
        vaultId,
        input.recipientUserId,
      ]);
      await tx.query("DELETE FROM vault_keys WHERE vault_id = $1 AND user_id = $2", [
        vaultId,
        input.recipientUserId,
      ]);

      const activeRecipients = await this.listActiveRecipients(tx, vaultId);
      const activeSet = new Set(activeRecipients);
      for (const userId of activeSet) {
        if (!rotatedMap.has(userId)) {
          throw new VaultSharingServiceError(
            "VAULT_KEY_WRAP_INVALID",
            400,
            "rotatedVaultKeys must include all active recipients",
          );
        }
      }
      for (const userId of rotatedMap.keys()) {
        if (!activeSet.has(userId)) {
          throw new VaultSharingServiceError(
            "VAULT_KEY_WRAP_INVALID",
            400,
            "rotatedVaultKeys contains unknown recipient",
          );
        }
      }

      for (const userId of activeSet) {
        await tx.query(
          `
            INSERT INTO vault_keys (vault_id, user_id, encrypted_vault_key)
            VALUES ($1, $2, $3)
            ON CONFLICT (vault_id, user_id)
            DO UPDATE SET encrypted_vault_key = EXCLUDED.encrypted_vault_key,
                          created_at = now()
          `,
          [vaultId, userId, Buffer.from(rotatedMap.get(userId)!)],
        );
      }
      await this.appendVaultEventTx(
        tx,
        vaultId,
        actorId,
        "VAULT_KEY_ROTATION",
        payloadBytes,
        input,
      );
    });
  }

  private async appendVaultEventTx(
    tx: QueryExecutor,
    vaultId: string,
    actorId: string,
    eventType: "VAULT_SHARE" | "VAULT_KEY_ROTATION",
    encryptedPayload: Uint8Array,
    input: {
      baseVersion: number;
      payloadSchemaVersion?: number;
      idempotencyKey?: string;
      clientCreatedAt?: string;
    },
  ): Promise<void> {
    await tx.query("SELECT id FROM vaults WHERE id = $1 FOR UPDATE", [vaultId]);

    if (input.idempotencyKey) {
      const existing = await tx.query<{ id: string }>(
        `
          SELECT id
          FROM events
          WHERE vault_id = $1
            AND idempotency_key = $2::uuid
          FOR UPDATE
        `,
        [vaultId, input.idempotencyKey],
      );
      if (existing[0]) {
        return;
      }
    }

    const versionRows = await tx.query<{ current_version: number }>(
      "SELECT COALESCE(MAX(version), 0) AS current_version FROM events WHERE vault_id = $1",
      [vaultId],
    );
    const currentVersion = Number(versionRows[0]?.current_version ?? 0);
    if (input.baseVersion !== currentVersion) {
      throw new VaultSharingServiceError("VERSION_MISMATCH", 409, "baseVersion is stale", {
        expectedBaseVersion: input.baseVersion,
        latestVersion: currentVersion,
      });
    }

    const payloadSchemaVersion = input.payloadSchemaVersion ?? 2;
    if (!isCryptoProfileAllowed(this.config, payloadSchemaVersion)) {
      throw new VaultSharingServiceError(
        CRYPTO_POLICY_VIOLATION,
        CRYPTO_POLICY_VIOLATION_STATUS_CODE,
        `crypto profile v${payloadSchemaVersion} is not allowed by policy`,
        buildCryptoPolicyDetails(this.config, payloadSchemaVersion),
      );
    }

    await tx.query(
      `
        INSERT INTO events (
          vault_id, actor_id, event_type, encrypted_payload, version,
          payload_schema_version, idempotency_key, client_created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `,
      [
        vaultId,
        actorId,
        eventType,
        Buffer.from(encryptedPayload),
        currentVersion + 1,
        payloadSchemaVersion,
        input.idempotencyKey ?? null,
        input.clientCreatedAt ?? null,
      ],
    );
  }

  private async ensureRecipientInWorkspace(workspaceId: string, userId: string): Promise<void> {
    const rows = await this.db.query<{ can_access: boolean }>(
      `
        SELECT EXISTS (
          SELECT 1
          FROM workspaces w
          LEFT JOIN workspace_members wm
            ON wm.workspace_id = w.id
           AND wm.user_id = $2
          WHERE w.id = $1
            AND (w.owner_id = $2 OR wm.user_id IS NOT NULL)
        ) AS can_access
      `,
      [workspaceId, userId],
    );
    if (!rows[0]?.can_access) {
      throw new VaultSharingServiceError(
        "VAULT_SHARE_INVALID_RECIPIENT",
        400,
        "recipient has no workspace access",
      );
    }
  }

  private async ensureCanManageShares(vaultId: string, userId: string): Promise<VaultAclMeta> {
    const vault = await this.vaults.findById(vaultId);
    if (!vault) {
      throw new VaultSharingServiceError("VAULT_NOT_FOUND", 404, "vault not found");
    }
    const canRead = await this.vaults.canReadVault(vaultId, userId);
    if (!canRead) {
      throw new VaultSharingServiceError("ACCESS_DENIED", 403, "access denied");
    }

    const rows = await this.db.query<{
      vault_id: string;
      workspace_id: string;
      workspace_owner_id: string;
      vault_owner_id: string | null;
      role: string | null;
    }>(
      `
        SELECT
          v.id AS vault_id,
          v.workspace_id,
          w.owner_id AS workspace_owner_id,
          v.owner_id AS vault_owner_id,
          vm.role
        FROM vaults v
        INNER JOIN workspaces w
          ON w.id = v.workspace_id
        LEFT JOIN vault_members vm
          ON vm.vault_id = v.id
         AND vm.user_id = $2
        WHERE v.id = $1
      `,
      [vaultId, userId],
    );
    const meta = rows[0];
    if (!meta) {
      throw new VaultSharingServiceError("VAULT_NOT_FOUND", 404, "vault not found");
    }
    const canManage =
      userId === meta.workspace_owner_id ||
      userId === meta.vault_owner_id ||
      (meta.role ? SHARE_MANAGER_ROLES.has(meta.role) : false);
    if (!canManage) {
      throw new VaultSharingServiceError(
        "VAULT_SHARE_FORBIDDEN",
        403,
        "sharing requires owner or admin role",
      );
    }

    return {
      vaultId: meta.vault_id,
      workspaceId: meta.workspace_id,
      workspaceOwnerId: meta.workspace_owner_id,
      vaultOwnerId: meta.vault_owner_id,
    };
  }

  private async ensureVaultReadable(vaultId: string, userId: string): Promise<void> {
    const vault = await this.vaults.findById(vaultId);
    if (!vault) {
      throw new VaultSharingServiceError("VAULT_NOT_FOUND", 404, "vault not found");
    }
    const canRead = await this.vaults.canReadVault(vaultId, userId);
    if (!canRead) {
      throw new VaultSharingServiceError("ACCESS_DENIED", 403, "access denied");
    }
  }

  private async listActiveRecipients(tx: QueryExecutor, vaultId: string): Promise<string[]> {
    const rows = await tx.query<{ user_id: string }>(
      `
        SELECT DISTINCT user_id
        FROM (
          SELECT w.owner_id AS user_id
          FROM vaults v
          INNER JOIN workspaces w
            ON w.id = v.workspace_id
          WHERE v.id = $1
          UNION ALL
          SELECT v.owner_id AS user_id
          FROM vaults v
          WHERE v.id = $1
            AND v.owner_id IS NOT NULL
          UNION ALL
          SELECT vm.user_id AS user_id
          FROM vault_members vm
          WHERE vm.vault_id = $1
        ) recipients
      `,
      [vaultId],
    );
    return rows.map((row) => row.user_id);
  }
}
