import { generateEntityId, isEntityId } from "../entity-id.ts";
import {
  workspaceGetPlanQuotaLimits,
  workspaceHasPlanFeature,
  type PlanEntitlementRuntimeConfig,
  type WorkspacePlanEntitlementSource,
} from "../plan-entitlements.ts";
import {
  mergeEncryptedBlobMeta,
  parseEncryptedBlobInput,
  serializeEncryptedBlobToStorage,
  type EncryptedBlob,
} from "../crypto/encrypted-blob.ts";
import {
  assertHybridVaultKeyWrapPolicy,
  VaultKeyWrapPolicyError,
} from "../crypto/vault-key-wrap-policy.ts";
import type { QueryExecutor } from "../storage/postgres.ts";
import type {
  VaultRecord,
  VaultsRepository,
  WorkspaceRecord,
  WorkspacesRepository,
} from "../storage/repositories.ts";
import type { VaultSharingService } from "../vault-sharing/service.ts";
import {
  assertWorkspacePermission,
  assertWorkspacePermissionOnObject,
  permissionAllowsAll,
  WorkspacePermissionError,
} from "../workspace-roles/permissions.ts";
import { recipientPublicKeysAreValid } from "../workspace-members/recipientPublicKeys.ts";

function normalizeWireUserId(raw: string): string {
  return String(raw).trim();
}

export class WorkspaceSharedVaultsServiceError extends Error {
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

export type VaultAccessInvitationRecord = {
  invitationId: string;
  email: string;
  role: string | null;
  profileId: string | null;
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
  invitationUpdates?: Array<{
    invitationId: string;
    profileId: string | null;
  }>;
  rotatedVaultKeys?: Array<{ userId: string; encryptedVaultKey: unknown }>;
  /** Required when revoking access; optional for profile/invitation-only updates. */
  encryptedPayload?: unknown;
  signature?: unknown;
  baseVersion: number;
  idempotencyKey?: string;
  clientCreatedAt?: string;
};

export interface WorkspaceSharedVaultsServiceDeps {
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
  config: PlanEntitlementRuntimeConfig;
}

function parseBlobOrThrow(value: unknown, fieldName: string): EncryptedBlob {
  try {
    return parseEncryptedBlobInput(value, {
      fieldName,
      maxPayloadBytes: 1024 * 1024,
      allowLegacyString: false,
    }).blob;
  } catch (error) {
    throw new WorkspaceSharedVaultsServiceError("BAD_REQUEST", 400, (error as Error).message);
  }
}

export class WorkspaceSharedVaultsService {
  private readonly vaults: WorkspaceSharedVaultsServiceDeps["vaults"];
  private readonly workspaces: WorkspaceSharedVaultsServiceDeps["workspaces"];
  private readonly db: WorkspaceSharedVaultsServiceDeps["db"];
  private readonly vaultSharing: WorkspaceSharedVaultsServiceDeps["vaultSharing"];
  private readonly config: PlanEntitlementRuntimeConfig;

  constructor(deps: WorkspaceSharedVaultsServiceDeps) {
    this.vaults = deps.vaults;
    this.workspaces = deps.workspaces;
    this.db = deps.db;
    this.vaultSharing = deps.vaultSharing;
    this.config = deps.config;
  }

  async listAccessibleWorkspaces(userId: string): Promise<WorkspaceRecord[]> {
    return this.workspaces.listAccessibleByUser(userId);
  }

  async listWorkspaceVaults(
    workspaceId: string,
    userId: string,
  ): Promise<VaultRecord[]> {
    await this.requireWorkspaceAccess(workspaceId, userId);
    const matrix = await this.assertVaults(workspaceId, userId, "get");
    const all = await this.vaults.listByWorkspace(workspaceId);
    return all.filter((vault) => {
      if (vault.isPersonal) {
        return vault.ownerId === userId;
      }
      if (!permissionAllowsAll(matrix.vaults.get)) {
        return vault.ownerId === userId;
      }
      return true;
    });
  }

  async getVault(vaultId: string, userId: string): Promise<VaultRecord> {
    const vault = await this.vaults.findById(vaultId);
    if (!vault) {
      throw new WorkspaceSharedVaultsServiceError("VAULT_NOT_FOUND", 404, "vault not found");
    }

    const canRead = await this.vaults.canReadVault(vaultId, userId);
    if (!canRead) {
      throw new WorkspaceSharedVaultsServiceError("ACCESS_DENIED", 403, "access denied");
    }

    return vault;
  }

  async createSharedVault(
    workspaceId: string,
    actorId: string,
    input: VaultCreateInput,
  ): Promise<VaultRecord> {
    if (!this.db) {
      throw new WorkspaceSharedVaultsServiceError("INTERNAL_SERVER_ERROR", 500, "database not configured");
    }

    const workspace = await this.requireWorkspaceAccess(workspaceId, actorId);
    if (!workspaceHasPlanFeature(this.config, workspace, "sharedVaults")) {
      throw new WorkspaceSharedVaultsServiceError(
        "PLAN_FEATURE_REQUIRED",
        403,
        "shared vaults are not available on the current plan",
      );
    }
    await this.assertSharedVaultQuota(workspaceId, workspace);
    await this.assertVaults(workspaceId, actorId, "post");

    const name = input.name.trim();
    if (!name) {
      throw new WorkspaceSharedVaultsServiceError("BAD_REQUEST", 400, "name is required");
    }
    if (!Array.isArray(input.members) || input.members.length === 0) {
      throw new WorkspaceSharedVaultsServiceError("BAD_REQUEST", 400, "members must include at least the creator");
    }

    const creatorIncluded = input.members.some((member) => member.userId === actorId);
    if (!creatorIncluded) {
      throw new WorkspaceSharedVaultsServiceError("BAD_REQUEST", 400, "members must include the creating user");
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
        throw new WorkspaceSharedVaultsServiceError("BAD_REQUEST", 400, "member userId and profileId must be entity ids");
      }
      const recipientPqKey = await this.assertRecipientPublicKeysValid(userId);
      const wrappedKeyBlob = parseBlobOrThrow(member.encryptedVaultKey, "encryptedVaultKey");
      this.assertVaultKeyWrapPolicy(wrappedKeyBlob, userId, recipientPqKey);
      const wrappedKey = mergeEncryptedBlobMeta(wrappedKeyBlob, {
        entity: "vault_key_wrap",
        recipient_user_id: userId,
      });
      wrappedKey.meta = {
        ...wrappedKey.meta,
        recipient_user_id: userId,
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
        throw new WorkspaceSharedVaultsServiceError("INTERNAL_SERVER_ERROR", 500, "vault create failed");
      }

      for (const member of normalizedMembers) {
        await this.ensureUserInWorkspaceTx(tx, workspaceId, member.userId);
        await this.ensureProfileInWorkspaceTx(tx, workspace, workspaceId, member.profileId);

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
      throw new WorkspaceSharedVaultsServiceError("VAULT_NOT_FOUND", 404, "vault not found");
    }

    const workspace = await this.requireWorkspaceAccess(vault.workspaceId, actorId);
    if (vault.isPersonal) {
      if (vault.ownerId !== actorId && workspace.ownerId !== actorId) {
        throw new WorkspaceSharedVaultsServiceError("ACCESS_DENIED", 403, "access denied");
      }
    } else if (!workspaceHasPlanFeature(this.config, workspace, "sharedVaults")) {
      throw new WorkspaceSharedVaultsServiceError(
        "PLAN_FEATURE_REQUIRED",
        403,
        "shared vaults are not available on the current plan",
      );
    }
    await this.assertVaultsOnObject(
      vault.workspaceId,
      actorId,
      "put",
      vault.ownerId === actorId,
    );

    if (input.name !== undefined && !input.name.trim()) {
      throw new WorkspaceSharedVaultsServiceError("BAD_REQUEST", 400, "name cannot be empty");
    }

    const updated = await this.vaults.updateMetadata(vaultId, {
      name: input.name?.trim(),
      description: input.description !== undefined ? input.description.trim() : undefined,
      icon: input.icon !== undefined ? input.icon.trim() : undefined,
    });
    if (!updated) {
      throw new WorkspaceSharedVaultsServiceError("VAULT_NOT_FOUND", 404, "vault not found");
    }
    return updated;
  }

  async deleteVault(vaultId: string, actorId: string): Promise<void> {
    const vault = await this.vaults.findById(vaultId);
    if (!vault) {
      throw new WorkspaceSharedVaultsServiceError("VAULT_NOT_FOUND", 404, "vault not found");
    }
    if (vault.isPersonal) {
      throw new WorkspaceSharedVaultsServiceError("VAULT_DELETE_FORBIDDEN", 403, "personal vault cannot be deleted");
    }

    await this.requireWorkspaceAccess(vault.workspaceId, actorId);
    await this.assertVaultsOnObject(
      vault.workspaceId,
      actorId,
      "delete",
      vault.ownerId === actorId,
    );

    const deleted = await this.vaults.deleteById(vaultId);
    if (!deleted) {
      throw new WorkspaceSharedVaultsServiceError("VAULT_DELETE_FORBIDDEN", 403, "vault cannot be deleted");
    }
  }

  async listWorkspaceMembers(
    workspaceId: string,
    actorId: string,
  ): Promise<WorkspaceMemberRecord[]> {
    if (!this.db) {
      throw new WorkspaceSharedVaultsServiceError("INTERNAL_SERVER_ERROR", 500, "database not configured");
    }
    await this.requireWorkspaceAccess(workspaceId, actorId);
    await this.assertVaults(workspaceId, actorId, "get");

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

  async getVaultAccess(
    vaultId: string,
    actorId: string,
  ): Promise<{
    members: VaultAccessMemberRecord[];
    invitations: VaultAccessInvitationRecord[];
    latestVersion: number;
  }> {
    if (!this.db) {
      throw new WorkspaceSharedVaultsServiceError("INTERNAL_SERVER_ERROR", 500, "database not configured");
    }
    const vault = await this.vaults.findById(vaultId);
    if (!vault) {
      throw new WorkspaceSharedVaultsServiceError("VAULT_NOT_FOUND", 404, "vault not found");
    }
    if (vault.isPersonal) {
      throw new WorkspaceSharedVaultsServiceError("BAD_REQUEST", 400, "personal vault has no shared access list");
    }
    await this.requireWorkspaceAccess(vault.workspaceId, actorId);
    await this.assertVaultsOnObject(
      vault.workspaceId,
      actorId,
      "get",
      vault.ownerId === actorId,
    );

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

    const invitationRows = await this.db.query<{
      invitation_id: string;
      email: string;
      role: string | null;
      profile_id: string | null;
    }>(
      `
        SELECT
          wi.id AS invitation_id,
          wi.email,
          r.name AS role,
          iva.profile_id
        FROM workspace_invitations wi
        LEFT JOIN roles r ON r.id = wi.role_id
        LEFT JOIN workspace_invitation_vault_access iva
          ON iva.invitation_id = wi.id
         AND iva.vault_id = $1
        WHERE wi.workspace_id = $2
          AND wi.status = 'pending'
          AND wi.expires_at > now()
        ORDER BY wi.email ASC
      `,
      [vaultId, vault.workspaceId],
    );

    const versionRows = await this.db.query<{ current_version: number }>(
      "SELECT COALESCE(MAX(version), 0) AS current_version FROM events WHERE vault_id = $1",
      [vaultId],
    );
    const latestVersion = Number(versionRows[0]?.current_version ?? 0);

    return {
      members: rows.map((row) => ({
        userId: row.user_id,
        email: row.email,
        firstName: row.first_name,
        lastName: row.last_name,
        role: row.role,
        profileId: row.profile_id,
        publicKey: row.public_key,
        publicPqKey: row.public_pq_key,
      })),
      invitations: invitationRows.map((row) => ({
        invitationId: row.invitation_id,
        email: row.email,
        role: row.role,
        profileId: row.profile_id,
      })),
      latestVersion,
    };
  }

  async updateVaultAccess(
    vaultId: string,
    actorId: string,
    input: VaultAccessUpdateInput,
  ): Promise<void> {
    if (!this.db || !this.vaultSharing) {
      throw new WorkspaceSharedVaultsServiceError("INTERNAL_SERVER_ERROR", 500, "dependencies not configured");
    }

    const vault = await this.vaults.findById(vaultId);
    if (!vault) {
      throw new WorkspaceSharedVaultsServiceError("VAULT_NOT_FOUND", 404, "vault not found");
    }
    if (vault.isPersonal) {
      throw new WorkspaceSharedVaultsServiceError("BAD_REQUEST", 400, "personal vault access cannot be updated");
    }
    const workspace = await this.requireWorkspaceAccess(vault.workspaceId, actorId);
    if (!workspaceHasPlanFeature(this.config, workspace, "sharedVaults")) {
      throw new WorkspaceSharedVaultsServiceError(
        "PLAN_FEATURE_REQUIRED",
        403,
        "shared vaults are not available on the current plan",
      );
    }
    await this.assertVaultsOnObject(
      vault.workspaceId,
      actorId,
      "put",
      vault.ownerId === actorId,
    );

    // Validate every grant wrap before any mutation so invalid crypto cannot
    // partially apply invitation/profile updates from the same request.
    const normalizedGrants: Array<{
      userId: string;
      profileId: string;
      role: string;
      wrappedKey: EncryptedBlob;
    }> = [];
    for (const grant of input.grants) {
      const grantUserId = normalizeWireUserId(grant.userId);
      const recipientPqKey = await this.assertRecipientPublicKeysValid(grantUserId);
      const wrappedKeyBlob = parseBlobOrThrow(grant.encryptedVaultKey, "encryptedVaultKey");
      this.assertVaultKeyWrapPolicy(wrappedKeyBlob, grantUserId, recipientPqKey);
      const isImplicitOwner =
        grantUserId === vault.ownerId || grantUserId === workspace?.ownerId;
      const wrappedKey = mergeEncryptedBlobMeta(wrappedKeyBlob, {
        entity: "vault_key_wrap",
        recipient_user_id: grantUserId,
      });
      wrappedKey.meta = {
        ...wrappedKey.meta,
        recipient_user_id: grantUserId,
      };
      normalizedGrants.push({
        userId: grantUserId,
        profileId: grant.profileId,
        role: grant.role ?? (isImplicitOwner ? "owner" : "member"),
        wrappedKey,
      });
    }

    for (const update of input.invitationUpdates ?? []) {
      await this.upsertInvitationVaultAccess(
        vaultId,
        workspace,
        vault.workspaceId,
        update.invitationId,
        update.profileId,
      );
    }

    // Profile-only updates (no crypto events).
    for (const update of input.profileUpdates) {
      await this.upsertVaultProfile(vault.workspaceId, workspace, vaultId, update.userId, update.profileId);
    }

    // Grants: write members/keys/profiles directly (avoids per-share version conflicts).
    for (const grant of normalizedGrants) {
      await this.db.query(
        `
          INSERT INTO vault_members (id, vault_id, user_id, role)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (vault_id, user_id)
          DO UPDATE SET role = EXCLUDED.role
        `,
        [generateEntityId(), vaultId, grant.userId, grant.role],
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
          Buffer.from(serializeEncryptedBlobToStorage(grant.wrappedKey)),
        ],
      );
      await this.upsertVaultProfile(vault.workspaceId, workspace, vaultId, grant.userId, grant.profileId);
    }

    // Revokes: one at a time via sharing service (each rotates).
    let baseVersion = input.baseVersion;
    for (const revoke of input.revokes) {
      if (!input.rotatedVaultKeys || input.rotatedVaultKeys.length === 0) {
        throw new WorkspaceSharedVaultsServiceError(
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
    workspaceId: string,
    workspace: WorkspacePlanEntitlementSource,
    vaultId: string,
    userId: string,
    profileId: string,
  ): Promise<void> {
    if (!this.db) {
      return;
    }
    if (!isEntityId(userId) || !isEntityId(profileId)) {
      throw new WorkspaceSharedVaultsServiceError("BAD_REQUEST", 400, "userId and profileId must be entity ids");
    }
    await this.assertAssignableWorkspaceProfile(this.db, workspace, workspaceId, profileId);
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

  private async upsertInvitationVaultAccess(
    vaultId: string,
    workspace: WorkspacePlanEntitlementSource,
    workspaceId: string,
    invitationId: string,
    profileId: string | null,
  ): Promise<void> {
    if (!this.db) {
      return;
    }
    if (!isEntityId(invitationId)) {
      throw new WorkspaceSharedVaultsServiceError("BAD_REQUEST", 400, "invalid invitationId");
    }
    const invitationRows = await this.db.query<{ id: string; status: string }>(
      `
        SELECT id, status FROM workspace_invitations
        WHERE id = $1 AND workspace_id = $2
        LIMIT 1
      `,
      [invitationId, workspaceId],
    );
    const invitation = invitationRows[0];
    if (!invitation) {
      throw new WorkspaceSharedVaultsServiceError("NOT_FOUND", 404, "invitation not found");
    }
    if (invitation.status !== "pending") {
      throw new WorkspaceSharedVaultsServiceError("BAD_REQUEST", 400, "invitation is not pending");
    }

    if (profileId == null) {
      await this.db.query(
        `
          DELETE FROM workspace_invitation_vault_access
          WHERE invitation_id = $1 AND vault_id = $2
        `,
        [invitationId, vaultId],
      );
      return;
    }

    if (!isEntityId(profileId)) {
      throw new WorkspaceSharedVaultsServiceError("BAD_REQUEST", 400, "invalid profileId");
    }
    await this.assertAssignableWorkspaceProfile(this.db, workspace, workspaceId, profileId);

    await this.db.query(
      `
        INSERT INTO workspace_invitation_vault_access (invitation_id, vault_id, profile_id)
        VALUES ($1, $2, $3)
        ON CONFLICT (invitation_id, vault_id)
        DO UPDATE SET profile_id = EXCLUDED.profile_id
      `,
      [invitationId, vaultId, profileId],
    );
  }

  private async requireWorkspaceAccess(
    workspaceId: string,
    userId: string,
  ): Promise<WorkspaceRecord> {
    const workspace = await this.workspaces.findById(workspaceId);
    if (!workspace) {
      throw new WorkspaceSharedVaultsServiceError("WORKSPACE_NOT_FOUND", 404, "workspace not found");
    }
    const hasAccess = await this.workspaces.hasAccess(workspaceId, userId);
    if (!hasAccess) {
      throw new WorkspaceSharedVaultsServiceError("ACCESS_DENIED", 403, "access denied");
    }
    return workspace;
  }

  /** Soft shared-vault cap from the effective entitlement tier. */
  private async assertSharedVaultQuota(
    workspaceId: string,
    workspace: WorkspaceRecord,
  ): Promise<void> {
    if (!this.db) {
      throw new WorkspaceSharedVaultsServiceError("INTERNAL_SERVER_ERROR", 500, "database not configured");
    }
    const { maxSharedVaults } = workspaceGetPlanQuotaLimits(this.config, workspace);
    if (maxSharedVaults === null) {
      return;
    }
    const rows = await this.db.query<{ count: string }>(
      `
        SELECT COUNT(*)::text AS count
        FROM vaults
        WHERE workspace_id = $1 AND is_personal = false
      `,
      [workspaceId],
    );
    const used = Number(rows[0]?.count ?? 0);
    if (used >= maxSharedVaults) {
      throw new WorkspaceSharedVaultsServiceError(
        "PLAN_QUOTA_EXCEEDED",
        403,
        "shared vault quota exceeded",
      );
    }
  }

  private async assertVaults(
    workspaceId: string,
    userId: string,
    action: "get" | "post" | "put" | "delete",
  ) {
    if (!this.db) {
      throw new WorkspaceSharedVaultsServiceError("INTERNAL_SERVER_ERROR", 500, "database not configured");
    }
    try {
      return await assertWorkspacePermission(this.db, workspaceId, userId, "vaults", action);
    } catch (error) {
      if (error instanceof WorkspacePermissionError) {
        throw new WorkspaceSharedVaultsServiceError(error.code, error.statusCode, error.message);
      }
      throw error;
    }
  }

  private async assertVaultsOnObject(
    workspaceId: string,
    userId: string,
    action: "get" | "put" | "delete",
    isOwn: boolean,
  ) {
    if (!this.db) {
      throw new WorkspaceSharedVaultsServiceError("INTERNAL_SERVER_ERROR", 500, "database not configured");
    }
    try {
      return await assertWorkspacePermissionOnObject(
        this.db,
        workspaceId,
        userId,
        "vaults",
        action,
        isOwn,
      );
    } catch (error) {
      if (error instanceof WorkspacePermissionError) {
        throw new WorkspaceSharedVaultsServiceError(error.code, error.statusCode, error.message);
      }
      throw error;
    }
  }

  /** Maps the shared hybrid wrap policy into service errors. */
  private assertVaultKeyWrapPolicy(
    wrappedKeyBlob: EncryptedBlob,
    recipientUserId: string,
    recipientPublicPqKey: string | null,
  ): void {
    try {
      assertHybridVaultKeyWrapPolicy({
        wrappedKeyBlob,
        recipientUserId,
        recipientPublicPqKey,
      });
    } catch (error) {
      if (error instanceof VaultKeyWrapPolicyError) {
        throw new WorkspaceSharedVaultsServiceError(error.code, error.statusCode, error.message);
      }
      throw error;
    }
  }

  private async assertRecipientPublicKeysValid(userId: string): Promise<string> {
    if (!this.db) {
      throw new WorkspaceSharedVaultsServiceError("INTERNAL_SERVER_ERROR", 500, "database not configured");
    }
    const rows = await this.db.query<{ public_key: string; public_pq_key: string | null }>(
      `
        SELECT public_key, public_pq_key
        FROM users
        WHERE id = $1
        LIMIT 1
      `,
      [userId],
    );
    const row = rows[0];
    if (!row || !recipientPublicKeysAreValid(row.public_key, row.public_pq_key)) {
      throw new WorkspaceSharedVaultsServiceError(
        "CRYPTO_PAYLOAD_INVALID",
        400,
        "recipient public key is invalid",
      );
    }
    return row.public_pq_key as string;
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
      throw new WorkspaceSharedVaultsServiceError("BAD_REQUEST", 400, "member is not in workspace");
    }
  }

  private async ensureProfileInWorkspaceTx(
    tx: QueryExecutor,
    workspace: WorkspacePlanEntitlementSource,
    workspaceId: string,
    profileId: string,
  ): Promise<void> {
    await this.assertAssignableWorkspaceProfile(tx, workspace, workspaceId, profileId);
  }

  private async assertAssignableWorkspaceProfile(
    db: QueryExecutor,
    workspace: WorkspacePlanEntitlementSource,
    workspaceId: string,
    profileId: string,
  ): Promise<void> {
    const rows = await db.query<{ id: string; builtin_key: string | null }>(
      `
        SELECT id, builtin_key FROM profiles
        WHERE id = $1 AND workspace_id = $2
        LIMIT 1
      `,
      [profileId, workspaceId],
    );
    const row = rows[0];
    if (!row) {
      throw new WorkspaceSharedVaultsServiceError("BAD_REQUEST", 400, "profile not found in workspace");
    }
    if (row.builtin_key === "extended" || row.builtin_key === "simple") {
      return;
    }
    if (workspaceHasPlanFeature(this.config, workspace, "customWorkspaceProfiles")) {
      return;
    }
    throw new WorkspaceSharedVaultsServiceError(
      "PLAN_FEATURE_REQUIRED",
      403,
      "custom workspace profiles require a plan that includes them",
    );
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
      throw new WorkspaceSharedVaultsServiceError(
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
