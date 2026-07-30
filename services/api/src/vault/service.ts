import { hasPlanFeature, type EncryptedBlobDto } from "@okkey/types";
import { generateEntityId, isEntityId } from "../entity-id.ts";
import {
  mergeEncryptedBlobMeta,
  parseEncryptedBlobInput,
  serializeEncryptedBlobToStorage,
  type EncryptedBlob,
} from "../crypto/encrypted-blob.ts";
import type { QueryExecutor } from "../storage/postgres.ts";
import type {
  VaultRecord,
  VaultsRepository,
  WorkspaceRecord,
  WorkspacesRepository,
} from "../storage/repositories.ts";
import type { VaultSharingService } from "../vault-sharing/service.ts";

export class VaultServiceError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, statusCode: number, message: string) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
  }
}

export type VaultCreateMemberInput = {
  userId: string;
  profileId: string;
  encryptedVaultKey: unknown;
  role?: string;
};

export type VaultCreateInput = {
  name: string;
  description?: string;
  icon?: string;
  encryptedPayload: unknown;
  signature?: unknown;
  baseVersion?: number;
  idempotencyKey?: string;
  clientCreatedAt?: string;
  members: VaultCreateMemberInput[];
};

export type VaultUpdateInput = {
  name?: string;
  description?: string;
  icon?: string;
};

export type WorkspaceMemberRecord = {
  userId: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  publicKey: string;
  publicPqKey: string | null;
  roleId: string | null;
  roleBuiltinKey: string | null;
};

export type VaultAccessMemberRecord = {
  userId: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: string | null;
  profileId: string | null;
  publicKey: string;
  publicPqKey: string | null;
};

export type VaultAccessUpdateInput = {
  grants: Array<{
    userId: string;
    profileId: string;
    encryptedVaultKey: unknown;
    role?: string;
  }>;
  profileUpdates: Array<{
    userId: string;
    profileId: string;
  }>;
  revokes: Array<{ userId: string }>;
  rotatedVaultKeys?: Array<{ userId: string; encryptedVaultKey: unknown }>;
  encryptedPayload: unknown;
  signature?: unknown;
  baseVersion: number;
  idempotencyKey?: string;
  clientCreatedAt?: string;
};

export interface VaultServiceDeps {
  vaults: Pick<
    VaultsRepository,
    | "findById"
    | "listAccessibleByWorkspace"
    | "listByWorkspace"
    | "canReadVault"
    | "canManageVaultSettings"
    | "create"
    | "updateMetadata"
    | "deleteById"
  >;
  workspaces: Pick<WorkspacesRepository, "findById" | "hasAccess" | "listAccessibleByUser">;
  db?: QueryExecutor & {
    transaction<T>(fn: (tx: QueryExecutor) => Promise<T>): Promise<T>;
  };
  vaultSharing?: Pick<VaultSharingService, "shareVault" | "revokeVaultAccess">;
}

function parseBlobOrThrow(value: unknown, fieldName: string): EncryptedBlob {
  try {
    return parseEncryptedBlobInput(value, {
      fieldName,
      maxPayloadBytes: 1024 * 1024,
      allowLegacyString: false,
    }).blob;
  } catch (error) {
    throw new VaultServiceError("BAD_REQUEST", 400, (error as Error).message);
  }
}

export class VaultService {
  private readonly vaults: VaultServiceDeps["vaults"];
  private readonly workspaces: VaultServiceDeps["workspaces"];
  private readonly db: VaultServiceDeps["db"];
  private readonly vaultSharing: VaultServiceDeps["vaultSharing"];

  constructor(deps: VaultServiceDeps) {
    this.vaults = deps.vaults;
    this.workspaces = deps.workspaces;
    this.db = deps.db;
    this.vaultSharing = deps.vaultSharing;
  }

  async listAccessibleWorkspaces(userId: string): Promise<WorkspaceRecord[]> {
    return this.workspaces.listAccessibleByUser(userId);
  }

  async listWorkspaceVaults(
    workspaceId: string,
    userId: string,
  ): Promise<VaultRecord[]> {
    const workspace = await this.requireWorkspaceAccess(workspaceId, userId);
    const canManageSettings = await this.canManageWorkspaceVaultSettings(workspace, userId);
    if (canManageSettings) {
      return this.vaults.listByWorkspace(workspaceId);
    }
    return this.vaults.listAccessibleByWorkspace(workspaceId, userId);
  }

  async getVault(vaultId: string, userId: string): Promise<VaultRecord> {
    const vault = await this.vaults.findById(vaultId);
    if (!vault) {
      throw new VaultServiceError("VAULT_NOT_FOUND", 404, "vault not found");
    }

    const canRead = await this.vaults.canReadVault(vaultId, userId);
    if (!canRead) {
      throw new VaultServiceError("ACCESS_DENIED", 403, "access denied");
    }

    return vault;
  }

  async createSharedVault(
    workspaceId: string,
    actorId: string,
    input: VaultCreateInput,
  ): Promise<VaultRecord> {
    if (!this.db) {
      throw new VaultServiceError("INTERNAL_SERVER_ERROR", 500, "database not configured");
    }

    const workspace = await this.requireWorkspaceAccess(workspaceId, actorId);
    if (!hasPlanFeature(workspace.planTier, "sharedVaults")) {
      throw new VaultServiceError(
        "PLAN_FEATURE_REQUIRED",
        403,
        "shared vaults require a paid plan",
      );
    }
    const canManage = await this.canManageWorkspaceVaultSettings(workspace, actorId);
    if (!canManage) {
      throw new VaultServiceError("ACCESS_DENIED", 403, "access denied");
    }

    const name = input.name.trim();
    if (!name) {
      throw new VaultServiceError("BAD_REQUEST", 400, "name is required");
    }
    if (!Array.isArray(input.members) || input.members.length === 0) {
      throw new VaultServiceError("BAD_REQUEST", 400, "members must include at least the creator");
    }

    const creatorIncluded = input.members.some((member) => member.userId === actorId);
    if (!creatorIncluded) {
      throw new VaultServiceError("BAD_REQUEST", 400, "members must include the creating user");
    }

    const payloadBlob = mergeEncryptedBlobMeta(
      parseBlobOrThrow(input.encryptedPayload, "encryptedPayload"),
      {
        entity: "vault_event_payload",
        event_type: "VAULT_CREATE",
      },
    );

    const normalizedMembers: Array<{
      userId: string;
      profileId: string;
      role: string;
      wrappedKey: EncryptedBlob;
    }> = [];

    for (const member of input.members) {
      const userId = String(member.userId).trim();
      const profileId = String(member.profileId).trim();
      if (!isEntityId(userId) || !isEntityId(profileId)) {
        throw new VaultServiceError("BAD_REQUEST", 400, "member userId and profileId must be entity ids");
      }
      const wrappedKey = mergeEncryptedBlobMeta(
        parseBlobOrThrow(member.encryptedVaultKey, "encryptedVaultKey"),
        {
          entity: "vault_key_wrap",
          recipient_user_id: userId,
          key_wrap_scheme: "hybrid_ecc_pq_v1",
        },
      );
      wrappedKey.meta = {
        ...wrappedKey.meta,
        recipient_user_id: userId,
        key_wrap_scheme: wrappedKey.meta?.["key_wrap_scheme"] ?? "hybrid_ecc_pq_v1",
      };
      normalizedMembers.push({
        userId,
        profileId,
        role: member.role?.trim() || (userId === actorId ? "owner" : "member"),
        wrappedKey,
      });
    }

    return this.db.transaction(async (tx) => {
      const vaultId = generateEntityId();
      const description = input.description?.trim() ?? "";
      const icon = input.icon?.trim() ?? "";
      const insertRows = await tx.query<{
        id: string;
        workspace_id: string;
        name: string;
        description: string;
        icon: string;
        is_personal: boolean;
        owner_id: string | null;
        crypto_version: number;
        created_at: string;
        updated_at: string;
      }>(
        `
          INSERT INTO vaults (id, workspace_id, name, description, icon, is_personal, owner_id, crypto_version)
          VALUES ($1, $2, $3, $4, $5, false, $6, 2)
          RETURNING id, workspace_id, name, description, icon, is_personal, owner_id, crypto_version, created_at, updated_at
        `,
        [vaultId, workspaceId, name, description, icon, actorId],
      );
      const inserted = insertRows[0];
      if (!inserted) {
        throw new VaultServiceError("INTERNAL_SERVER_ERROR", 500, "vault create failed");
      }

      for (const member of normalizedMembers) {
        await this.ensureUserInWorkspaceTx(tx, workspaceId, member.userId);
        await this.ensureProfileInWorkspaceTx(tx, workspaceId, member.profileId);

        await tx.query(
          `
            INSERT INTO vault_members (id, vault_id, user_id, role)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (vault_id, user_id)
            DO UPDATE SET role = EXCLUDED.role
          `,
          [generateEntityId(), vaultId, member.userId, member.role],
        );
        await tx.query(
          `
            INSERT INTO vault_keys (id, vault_id, user_id, encrypted_vault_key)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (vault_id, user_id)
            DO UPDATE SET encrypted_vault_key = EXCLUDED.encrypted_vault_key,
                          created_at = now()
          `,
          [
            generateEntityId(),
            vaultId,
            member.userId,
            Buffer.from(serializeEncryptedBlobToStorage(member.wrappedKey)),
          ],
        );
        await tx.query(
          `
            INSERT INTO vault_profiles (id, vault_id, user_id, profile_id)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (vault_id, user_id)
            DO UPDATE SET profile_id = EXCLUDED.profile_id
          `,
          [generateEntityId(), vaultId, member.userId, member.profileId],
        );
      }

      await this.appendVaultEventTx(tx, vaultId, actorId, "VAULT_CREATE", payloadBlob, {
        baseVersion: input.baseVersion ?? 0,
        idempotencyKey: input.idempotencyKey,
        clientCreatedAt: input.clientCreatedAt,
      });

      return {
        id: inserted.id,
        workspaceId: inserted.workspace_id,
        name: inserted.name,
        description: inserted.description,
        icon: inserted.icon,
        isPersonal: inserted.is_personal,
        ownerId: inserted.owner_id,
        cryptoVersion: inserted.crypto_version,
        createdAt: inserted.created_at,
        updatedAt: inserted.updated_at,
      };
    });
  }

  async updateVault(
    vaultId: string,
    actorId: string,
    input: VaultUpdateInput,
  ): Promise<VaultRecord> {
    const vault = await this.vaults.findById(vaultId);
    if (!vault) {
      throw new VaultServiceError("VAULT_NOT_FOUND", 404, "vault not found");
    }

    const workspace = await this.requireWorkspaceAccess(vault.workspaceId, actorId);
    if (vault.isPersonal) {
      if (vault.ownerId !== actorId && workspace.ownerId !== actorId) {
        throw new VaultServiceError("ACCESS_DENIED", 403, "access denied");
      }
    } else {
      const canManage = await this.vaults.canManageVaultSettings(vaultId, actorId);
      if (!canManage) {
        throw new VaultServiceError("ACCESS_DENIED", 403, "access denied");
      }
    }

    if (input.name !== undefined && !input.name.trim()) {
      throw new VaultServiceError("BAD_REQUEST", 400, "name cannot be empty");
    }

    const updated = await this.vaults.updateMetadata(vaultId, {
      name: input.name?.trim(),
      description: input.description !== undefined ? input.description.trim() : undefined,
      icon: input.icon !== undefined ? input.icon.trim() : undefined,
    });
    if (!updated) {
      throw new VaultServiceError("VAULT_NOT_FOUND", 404, "vault not found");
    }
    return updated;
  }

  async deleteVault(vaultId: string, actorId: string): Promise<void> {
    const vault = await this.vaults.findById(vaultId);
    if (!vault) {
      throw new VaultServiceError("VAULT_NOT_FOUND", 404, "vault not found");
    }
    if (vault.isPersonal) {
      throw new VaultServiceError("VAULT_DELETE_FORBIDDEN", 403, "personal vault cannot be deleted");
    }

    const canManage = await this.vaults.canManageVaultSettings(vaultId, actorId);
    if (!canManage) {
      throw new VaultServiceError("ACCESS_DENIED", 403, "access denied");
    }

    const deleted = await this.vaults.deleteById(vaultId);
    if (!deleted) {
      throw new VaultServiceError("VAULT_DELETE_FORBIDDEN", 403, "vault cannot be deleted");
    }
  }

  async listWorkspaceMembers(
    workspaceId: string,
    actorId: string,
  ): Promise<WorkspaceMemberRecord[]> {
    if (!this.db) {
      throw new VaultServiceError("INTERNAL_SERVER_ERROR", 500, "database not configured");
    }
    const workspace = await this.requireWorkspaceAccess(workspaceId, actorId);
    const canManage = await this.canManageWorkspaceVaultSettings(workspace, actorId);
    if (!canManage) {
      throw new VaultServiceError("ACCESS_DENIED", 403, "access denied");
    }

    const rows = await this.db.query<{
      user_id: string;
      email: string;
      first_name: string | null;
      last_name: string | null;
      public_key: string;
      public_pq_key: string | null;
      role_id: string | null;
      role_builtin_key: string | null;
    }>(
      `
        SELECT
          u.id AS user_id,
          u.email,
          u.first_name,
          u.last_name,
          u.public_key,
          u.public_pq_key,
          wm.role_id,
          r.builtin_key AS role_builtin_key
        FROM (
          SELECT workspace_id, user_id, role_id
          FROM workspace_members
          WHERE workspace_id = $1
          UNION
          SELECT w.id AS workspace_id, w.owner_id AS user_id, owner_role.id AS role_id
          FROM workspaces w
          LEFT JOIN roles owner_role
            ON owner_role.workspace_id = w.id
           AND owner_role.builtin_key = 'owner'
          WHERE w.id = $1
        ) wm
        INNER JOIN users u ON u.id = wm.user_id
        LEFT JOIN roles r ON r.id = wm.role_id
        ORDER BY u.email ASC
      `,
      [workspaceId],
    );

    const seen = new Set<string>();
    const members: WorkspaceMemberRecord[] = [];
    for (const row of rows) {
      if (seen.has(row.user_id)) {
        continue;
      }
      seen.add(row.user_id);
      members.push({
        userId: row.user_id,
        email: row.email,
        firstName: row.first_name,
        lastName: row.last_name,
        publicKey: row.public_key,
        publicPqKey: row.public_pq_key,
        roleId: row.role_id,
        roleBuiltinKey: row.role_builtin_key,
      });
    }
    return members;
  }

  async getVaultAccess(vaultId: string, actorId: string): Promise<VaultAccessMemberRecord[]> {
    if (!this.db) {
      throw new VaultServiceError("INTERNAL_SERVER_ERROR", 500, "database not configured");
    }
    const vault = await this.vaults.findById(vaultId);
    if (!vault) {
      throw new VaultServiceError("VAULT_NOT_FOUND", 404, "vault not found");
    }
    if (vault.isPersonal) {
      throw new VaultServiceError("BAD_REQUEST", 400, "personal vault has no shared access list");
    }
    const canManage = await this.vaults.canManageVaultSettings(vaultId, actorId);
    if (!canManage) {
      throw new VaultServiceError("ACCESS_DENIED", 403, "access denied");
    }

    const rows = await this.db.query<{
      user_id: string;
      email: string;
      first_name: string | null;
      last_name: string | null;
      role: string | null;
      profile_id: string | null;
      public_key: string;
      public_pq_key: string | null;
    }>(
      `
        SELECT
          u.id AS user_id,
          u.email,
          u.first_name,
          u.last_name,
          vm.role,
          vp.profile_id,
          u.public_key,
          u.public_pq_key
        FROM vault_members vm
        INNER JOIN users u ON u.id = vm.user_id
        LEFT JOIN vault_profiles vp
          ON vp.vault_id = vm.vault_id
         AND vp.user_id = vm.user_id
        WHERE vm.vault_id = $1
        ORDER BY u.email ASC
      `,
      [vaultId],
    );

    return rows.map((row) => ({
      userId: row.user_id,
      email: row.email,
      firstName: row.first_name,
      lastName: row.last_name,
      role: row.role,
      profileId: row.profile_id,
      publicKey: row.public_key,
      publicPqKey: row.public_pq_key,
    }));
  }

  async updateVaultAccess(
    vaultId: string,
    actorId: string,
    input: VaultAccessUpdateInput,
  ): Promise<void> {
    if (!this.db || !this.vaultSharing) {
      throw new VaultServiceError("INTERNAL_SERVER_ERROR", 500, "dependencies not configured");
    }

    const vault = await this.vaults.findById(vaultId);
    if (!vault) {
      throw new VaultServiceError("VAULT_NOT_FOUND", 404, "vault not found");
    }
    if (vault.isPersonal) {
      throw new VaultServiceError("BAD_REQUEST", 400, "personal vault access cannot be updated");
    }
    const canManage = await this.vaults.canManageVaultSettings(vaultId, actorId);
    if (!canManage) {
      throw new VaultServiceError("ACCESS_DENIED", 403, "access denied");
    }

    const workspace = await this.workspaces.findById(vault.workspaceId);

    // Profile-only updates first (no crypto events).
    for (const update of input.profileUpdates) {
      await this.upsertVaultProfile(vaultId, update.userId, update.profileId);
    }

    // Grants: write members/keys/profiles directly (avoids per-share version conflicts).
    for (const grant of input.grants) {
      const isImplicitOwner =
        grant.userId === vault.ownerId || grant.userId === workspace?.ownerId;
      const wrappedKey = mergeEncryptedBlobMeta(
        parseBlobOrThrow(grant.encryptedVaultKey, "encryptedVaultKey"),
        {
          entity: "vault_key_wrap",
          recipient_user_id: grant.userId,
          key_wrap_scheme: "hybrid_ecc_pq_v1",
        },
      );
      await this.db.query(
        `
          INSERT INTO vault_members (id, vault_id, user_id, role)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (vault_id, user_id)
          DO UPDATE SET role = EXCLUDED.role
        `,
        [
          generateEntityId(),
          vaultId,
          grant.userId,
          grant.role ?? (isImplicitOwner ? "owner" : "member"),
        ],
      );
      await this.db.query(
        `
          INSERT INTO vault_keys (id, vault_id, user_id, encrypted_vault_key)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (vault_id, user_id)
          DO UPDATE SET encrypted_vault_key = EXCLUDED.encrypted_vault_key,
                        created_at = now()
        `,
        [
          generateEntityId(),
          vaultId,
          grant.userId,
          Buffer.from(serializeEncryptedBlobToStorage(wrappedKey)),
        ],
      );
      await this.upsertVaultProfile(vaultId, grant.userId, grant.profileId);
    }

    // Revokes: one at a time via sharing service (each rotates).
    let baseVersion = input.baseVersion;
    for (const revoke of input.revokes) {
      if (!input.rotatedVaultKeys || input.rotatedVaultKeys.length === 0) {
        throw new VaultServiceError(
          "BAD_REQUEST",
          400,
          "rotatedVaultKeys required when revoking access",
        );
      }
      await this.vaultSharing.revokeVaultAccess(vaultId, actorId, {
        recipientUserId: revoke.userId,
        rotatedVaultKeys: input.rotatedVaultKeys,
        encryptedPayload: input.encryptedPayload,
        signature: input.signature,
        baseVersion,
        idempotencyKey: input.idempotencyKey,
        clientCreatedAt: input.clientCreatedAt,
      });
      await this.db.query(
        `DELETE FROM vault_profiles WHERE vault_id = $1 AND user_id = $2`,
        [vaultId, revoke.userId],
      );
      baseVersion += 1;
    }
  }

  private async upsertVaultProfile(
    vaultId: string,
    userId: string,
    profileId: string,
  ): Promise<void> {
    if (!this.db) {
      return;
    }
    if (!isEntityId(userId) || !isEntityId(profileId)) {
      throw new VaultServiceError("BAD_REQUEST", 400, "userId and profileId must be entity ids");
    }
    await this.db.query(
      `
        INSERT INTO vault_profiles (id, vault_id, user_id, profile_id)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (vault_id, user_id)
        DO UPDATE SET profile_id = EXCLUDED.profile_id
      `,
      [generateEntityId(), vaultId, userId, profileId],
    );
  }

  private async requireWorkspaceAccess(
    workspaceId: string,
    userId: string,
  ): Promise<WorkspaceRecord> {
    const workspace = await this.workspaces.findById(workspaceId);
    if (!workspace) {
      throw new VaultServiceError("WORKSPACE_NOT_FOUND", 404, "workspace not found");
    }
    const hasAccess = await this.workspaces.hasAccess(workspaceId, userId);
    if (!hasAccess) {
      throw new VaultServiceError("ACCESS_DENIED", 403, "access denied");
    }
    return workspace;
  }

  private async canManageWorkspaceVaultSettings(
    workspace: WorkspaceRecord,
    userId: string,
  ): Promise<boolean> {
    if (workspace.ownerId === userId) {
      return true;
    }
    if (!this.db) {
      return false;
    }
    const rows = await this.db.query<{ ok: boolean }>(
      `
        SELECT EXISTS (
          SELECT 1
          FROM workspace_members wm
          INNER JOIN roles r ON r.id = wm.role_id
          WHERE wm.workspace_id = $1
            AND wm.user_id = $2
            AND r.builtin_key IN ('owner', 'admin')
        ) AS ok
      `,
      [workspace.id, userId],
    );
    return Boolean(rows[0]?.ok);
  }

  private async ensureUserInWorkspaceTx(
    tx: QueryExecutor,
    workspaceId: string,
    userId: string,
  ): Promise<void> {
    const rows = await tx.query<{ ok: boolean }>(
      `
        SELECT EXISTS (
          SELECT 1 FROM (
            SELECT 1 AS x FROM workspaces WHERE id = $1 AND owner_id = $2
            UNION ALL
            SELECT 1 AS x FROM workspace_members WHERE workspace_id = $1 AND user_id = $2
          ) access_rows
        ) AS ok
      `,
      [workspaceId, userId],
    );
    if (!rows[0]?.ok) {
      throw new VaultServiceError("BAD_REQUEST", 400, "member is not in workspace");
    }
  }

  private async ensureProfileInWorkspaceTx(
    tx: QueryExecutor,
    workspaceId: string,
    profileId: string,
  ): Promise<void> {
    const rows = await tx.query<{ id: string }>(
      `SELECT id FROM profiles WHERE id = $1 AND workspace_id = $2`,
      [profileId, workspaceId],
    );
    if (!rows[0]) {
      throw new VaultServiceError("BAD_REQUEST", 400, "profile not found in workspace");
    }
  }

  private async appendVaultEventTx(
    tx: QueryExecutor,
    vaultId: string,
    actorId: string,
    eventType: "VAULT_CREATE",
    encryptedPayload: EncryptedBlob,
    input: {
      baseVersion: number;
      idempotencyKey?: string;
      clientCreatedAt?: string;
    },
  ): Promise<void> {
    if (input.idempotencyKey) {
      const existing = await tx.query<{ id: string }>(
        `
          SELECT id
          FROM events
          WHERE vault_id = $1
            AND idempotency_key = $2::bigint
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
    const currentVersion = versionRows[0]?.current_version ?? 0;
    if (input.baseVersion !== currentVersion) {
      throw new VaultServiceError(
        "VERSION_CONFLICT",
        409,
        `baseVersion ${input.baseVersion} does not match current ${currentVersion}`,
      );
    }

    const eventId = generateEntityId();
    const nextVersion = currentVersion + 1;
    await tx.query(
      `
        INSERT INTO events (
          id, vault_id, actor_id, event_type, encrypted_payload, idempotency_key, client_created_at, version
        )
        VALUES ($1, $2, $3, $4, $5, $6::bigint, $7::timestamptz, $8)
      `,
      [
        eventId,
        vaultId,
        actorId,
        eventType,
        Buffer.from(serializeEncryptedBlobToStorage(encryptedPayload)),
        input.idempotencyKey ?? null,
        input.clientCreatedAt ?? null,
        nextVersion,
      ],
    );
  }
}

/** Helper for mapping EncryptedBlobDto wire shapes in route handlers. */
export type { EncryptedBlobDto };
