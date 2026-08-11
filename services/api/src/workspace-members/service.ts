import { createHash, randomBytes } from "node:crypto";

import { hasPlanFeature } from "@okkey/types";

import { generateEntityId, isEntityId } from "../entity-id.ts";
import type { QueryExecutor } from "../storage/postgres.ts";
import type { WorkspacesRepository } from "../storage/repositories.ts";
import type { VaultService, VaultAccessUpdateInput } from "../vault/service.ts";
import type { EmailTemplateService } from "../email/service.ts";
import {
  assertWorkspacePermission,
  type WorkspacePermissionsMatrix,
  type WorkspaceResourcePermission,
  WorkspacePermissionError,
} from "../workspace-roles/permissions.ts";
import { ensureDefaultWorkspaceRoles } from "../workspace-roles/seed.ts";

const INVITE_TTL_MS = 14 * 24 * 60 * 60 * 1000;

export class WorkspaceMembersServiceError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, statusCode: number, message: string) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
  }
}

export type MemberActorRef = {
  userId: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
};

export type WorkspaceMemberRecord = {
  userId: string | null;
  email: string;
  firstName: string | null;
  lastName: string | null;
  publicKey: string;
  publicPqKey: string | null;
  roleId: string | null;
  roleBuiltinKey: string | null;
  roleName: string | null;
  status: "active" | "pending";
  invitationId: string | null;
  invitedAt: string | null;
  invitedBy: MemberActorRef | null;
  roleChangedAt: string | null;
  roleChangedBy: MemberActorRef | null;
  joinedAt: string | null;
  lastLoginAt: string | null;
};

export type MemberVaultAccessEntry = {
  vaultId: string;
  name: string;
  icon: string;
  description: string;
  profileId: string | null;
};

export type MemberVaultAccessChange = {
  vaultId: string;
  profileId: string | null;
  encryptedVaultKey?: unknown;
  rotatedVaultKeys?: Array<{ userId: string; encryptedVaultKey: unknown }>;
  encryptedPayload?: unknown;
  signature?: unknown;
  baseVersion?: number;
  idempotencyKey?: string;
  clientCreatedAt?: string;
};

export interface WorkspaceMembersServiceDeps {
  db: QueryExecutor;
  workspaces: Pick<WorkspacesRepository, "findById" | "hasAccess">;
  vaultService: Pick<VaultService, "updateVaultAccess" | "getVaultAccess">;
  emailTemplates?: Pick<EmailTemplateService, "sendWorkspaceInvite">;
  publicAppBaseUrl: string;
}

function toIso(value: string | Date | null | undefined): string | null {
  if (value == null) {
    return null;
  }
  if (typeof value === "string") {
    return value;
  }
  return value.toISOString();
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function hashInviteToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function actorFromRow(row: {
  user_id: string | null;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
} | null): MemberActorRef | null {
  if (!row?.user_id || !row.email) {
    return null;
  }
  return {
    userId: row.user_id,
    email: row.email,
    firstName: row.first_name,
    lastName: row.last_name,
  };
}

export class WorkspaceMembersService {
  private readonly db: QueryExecutor;
  private readonly workspaces: Pick<WorkspacesRepository, "findById" | "hasAccess">;
  private readonly vaultService: Pick<VaultService, "updateVaultAccess" | "getVaultAccess">;
  private readonly emailTemplates?: Pick<EmailTemplateService, "sendWorkspaceInvite">;
  private readonly publicAppBaseUrl: string;

  constructor(deps: WorkspaceMembersServiceDeps) {
    this.db = deps.db;
    this.workspaces = deps.workspaces;
    this.vaultService = deps.vaultService;
    this.emailTemplates = deps.emailTemplates;
    this.publicAppBaseUrl = deps.publicAppBaseUrl.replace(/\/$/, "");
  }

  async listMembers(
    workspaceId: string,
    actorId: string,
  ): Promise<{
    members: WorkspaceMemberRecord[];
    actorPermissions: { members: WorkspaceResourcePermission };
  }> {
    await this.requireAccessibleWorkspace(workspaceId, actorId);
    const matrix = await this.assertMembers(workspaceId, actorId, "get");
    await ensureDefaultWorkspaceRoles(this.db, workspaceId, (await this.requireWorkspace(workspaceId)).ownerId);

    const active = await this.loadActiveMembers(workspaceId);
    const pending = await this.loadPendingInvitations(workspaceId);
    return {
      members: [...active, ...pending],
      actorPermissions: { members: matrix.members },
    };
  }

  async createInvitations(
    workspaceId: string,
    actorId: string,
    invitations: Array<{ email: string; roleId: string }>,
  ): Promise<Array<{ invitationId: string; email: string; roleId: string }>> {
    if (!Array.isArray(invitations) || invitations.length === 0) {
      throw new WorkspaceMembersServiceError("BAD_REQUEST", 400, "invitations required");
    }
    if (invitations.length > 50) {
      throw new WorkspaceMembersServiceError("BAD_REQUEST", 400, "too many invitations");
    }

    const workspace = await this.requireAccessibleWorkspace(workspaceId, actorId);
    if (!hasPlanFeature(workspace.planTier, "additionalWorkspaceMembers")) {
      throw new WorkspaceMembersServiceError(
        "PLAN_FEATURE_REQUIRED",
        403,
        "additional workspace members require a paid plan",
      );
    }
    await this.assertMembers(workspaceId, actorId, "post");
    await ensureDefaultWorkspaceRoles(this.db, workspaceId, workspace.ownerId);

    const inviter = await this.loadUserBrief(actorId);
    if (!inviter) {
      throw new WorkspaceMembersServiceError("ACCESS_DENIED", 403, "access denied");
    }

    const created: Array<{ invitationId: string; email: string; roleId: string }> = [];

    for (const item of invitations) {
      const email = normalizeEmail(item.email ?? "");
      if (!email || !email.includes("@")) {
        throw new WorkspaceMembersServiceError("BAD_REQUEST", 400, "invalid email");
      }
      if (!isEntityId(item.roleId)) {
        throw new WorkspaceMembersServiceError("BAD_REQUEST", 400, "invalid roleId");
      }

      const role = await this.loadRole(workspaceId, item.roleId);
      if (!role) {
        throw new WorkspaceMembersServiceError("BAD_REQUEST", 400, "role not found");
      }
      if (role.builtinKey === "owner") {
        throw new WorkspaceMembersServiceError("BAD_REQUEST", 400, "cannot invite as owner");
      }

      const alreadyMember = await this.db.query<{ ok: boolean }>(
        `
          SELECT EXISTS (
            SELECT 1 FROM (
              SELECT 1 AS x FROM workspaces w
              JOIN users u ON u.id = w.owner_id
              WHERE w.id = $1 AND lower(u.email) = $2
              UNION ALL
              SELECT 1 AS x FROM workspace_members wm
              JOIN users u ON u.id = wm.user_id
              WHERE wm.workspace_id = $1 AND lower(u.email) = $2
            ) rows
          ) AS ok
        `,
        [workspaceId, email],
      );
      if (alreadyMember[0]?.ok) {
        throw new WorkspaceMembersServiceError(
          "CONFLICT",
          409,
          `user already a member: ${email}`,
        );
      }

      const existingPending = await this.db.query<{ id: string }>(
        `
          SELECT id FROM workspace_invitations
          WHERE workspace_id = $1 AND lower(email) = $2 AND status = 'pending'
          LIMIT 1
        `,
        [workspaceId, email],
      );
      if (existingPending[0]) {
        throw new WorkspaceMembersServiceError(
          "CONFLICT",
          409,
          `pending invitation already exists: ${email}`,
        );
      }

      const invitationId = generateEntityId();
      const rawToken = randomBytes(32).toString("base64url");
      const tokenHash = hashInviteToken(rawToken);
      const expiresAt = new Date(Date.now() + INVITE_TTL_MS).toISOString();

      await this.db.query(
        `
          INSERT INTO workspace_invitations (
            id, workspace_id, email, role_id, invited_by_user_id, token_hash, status, expires_at
          ) VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7::timestamptz)
        `,
        [invitationId, workspaceId, email, item.roleId, actorId, tokenHash, expiresAt],
      );

      if (this.emailTemplates && this.publicAppBaseUrl) {
        const inviteUrl = `${this.publicAppBaseUrl}/invite/${rawToken}`;
        await this.emailTemplates.sendWorkspaceInvite({
          to: email,
          localeHints: {},
          variables: {
            inviterDisplayName: displayName(inviter),
            workspaceName: workspace.name,
            inviteUrl,
          },
        });
      }

      created.push({ invitationId, email, roleId: item.roleId });
    }

    return created;
  }

  async revokeInvitation(
    workspaceId: string,
    actorId: string,
    invitationId: string,
  ): Promise<void> {
    await this.requireAccessibleWorkspace(workspaceId, actorId);
    await this.assertMembers(workspaceId, actorId, "delete");
    if (!isEntityId(invitationId)) {
      throw new WorkspaceMembersServiceError("BAD_REQUEST", 400, "invalid invitationId");
    }

    const rows = await this.db.query<{ id: string; status: string }>(
      `
        SELECT id, status FROM workspace_invitations
        WHERE id = $1 AND workspace_id = $2
        LIMIT 1
      `,
      [invitationId, workspaceId],
    );
    const row = rows[0];
    if (!row) {
      throw new WorkspaceMembersServiceError("NOT_FOUND", 404, "invitation not found");
    }
    if (row.status !== "pending") {
      throw new WorkspaceMembersServiceError("BAD_REQUEST", 400, "invitation is not pending");
    }

    await this.db.query(
      `
        UPDATE workspace_invitations
        SET status = 'revoked'
        WHERE id = $1 AND workspace_id = $2
      `,
      [invitationId, workspaceId],
    );
  }

  async updateInvitationRole(
    workspaceId: string,
    actorId: string,
    invitationId: string,
    roleId: string,
  ): Promise<void> {
    await this.requireAccessibleWorkspace(workspaceId, actorId);
    await this.assertMembers(workspaceId, actorId, "put");
    if (!isEntityId(invitationId) || !isEntityId(roleId)) {
      throw new WorkspaceMembersServiceError("BAD_REQUEST", 400, "invalid ids");
    }

    const role = await this.loadRole(workspaceId, roleId);
    if (!role) {
      throw new WorkspaceMembersServiceError("BAD_REQUEST", 400, "role not found");
    }
    if (role.builtinKey === "owner") {
      throw new WorkspaceMembersServiceError("BAD_REQUEST", 400, "cannot assign owner role");
    }

    const rows = await this.db.query<{ id: string; status: string; role_id: string }>(
      `
        SELECT id, status, role_id FROM workspace_invitations
        WHERE id = $1 AND workspace_id = $2
        LIMIT 1
      `,
      [invitationId, workspaceId],
    );
    const row = rows[0];
    if (!row) {
      throw new WorkspaceMembersServiceError("NOT_FOUND", 404, "invitation not found");
    }
    if (row.status !== "pending") {
      throw new WorkspaceMembersServiceError("BAD_REQUEST", 400, "invitation is not pending");
    }
    if (row.role_id === roleId) {
      return;
    }

    await this.db.query(
      `
        UPDATE workspace_invitations
        SET role_id = $3
        WHERE id = $1 AND workspace_id = $2 AND status = 'pending'
      `,
      [invitationId, workspaceId, roleId],
    );
  }

  async getInvitationVaultAccess(
    workspaceId: string,
    actorId: string,
    invitationId: string,
  ): Promise<MemberVaultAccessEntry[]> {
    await this.requireAccessibleWorkspace(workspaceId, actorId);
    await this.assertMembers(workspaceId, actorId, "get");
    await this.requirePendingInvitation(workspaceId, invitationId);

    const rows = await this.db.query<{
      vault_id: string;
      name: string;
      icon: string;
      description: string;
      profile_id: string | null;
    }>(
      `
        SELECT
          v.id AS vault_id,
          v.name,
          v.icon,
          v.description,
          iva.profile_id
        FROM vaults v
        LEFT JOIN workspace_invitation_vault_access iva
          ON iva.vault_id = v.id AND iva.invitation_id = $2
        WHERE v.workspace_id = $1
          AND v.is_personal = false
        ORDER BY v.created_at ASC, v.id ASC
      `,
      [workspaceId, invitationId],
    );

    return rows.map((row) => ({
      vaultId: row.vault_id,
      name: row.name,
      icon: row.icon,
      description: row.description,
      profileId: row.profile_id,
    }));
  }

  async updateInvitationVaultAccess(
    workspaceId: string,
    actorId: string,
    invitationId: string,
    changes: Array<{ vaultId: string; profileId: string | null }>,
  ): Promise<void> {
    await this.requireAccessibleWorkspace(workspaceId, actorId);
    await this.assertMembers(workspaceId, actorId, "put");
    await this.requirePendingInvitation(workspaceId, invitationId);
    if (!Array.isArray(changes) || changes.length === 0) {
      return;
    }

    for (const change of changes) {
      if (!isEntityId(change.vaultId)) {
        throw new WorkspaceMembersServiceError("BAD_REQUEST", 400, "invalid vaultId");
      }
      const vaultRows = await this.db.query<{ id: string; is_personal: boolean }>(
        `
          SELECT id, is_personal FROM vaults
          WHERE id = $1 AND workspace_id = $2
          LIMIT 1
        `,
        [change.vaultId, workspaceId],
      );
      const vault = vaultRows[0];
      if (!vault) {
        throw new WorkspaceMembersServiceError("NOT_FOUND", 404, "vault not found");
      }
      if (vault.is_personal) {
        throw new WorkspaceMembersServiceError(
          "BAD_REQUEST",
          400,
          "personal vault access cannot be updated",
        );
      }

      if (change.profileId == null) {
        await this.db.query(
          `
            DELETE FROM workspace_invitation_vault_access
            WHERE invitation_id = $1 AND vault_id = $2
          `,
          [invitationId, change.vaultId],
        );
        continue;
      }

      if (!isEntityId(change.profileId)) {
        throw new WorkspaceMembersServiceError("BAD_REQUEST", 400, "invalid profileId");
      }
      const profileRows = await this.db.query<{ id: string }>(
        `
          SELECT id FROM profiles
          WHERE id = $1 AND workspace_id = $2
          LIMIT 1
        `,
        [change.profileId, workspaceId],
      );
      if (!profileRows[0]) {
        throw new WorkspaceMembersServiceError("BAD_REQUEST", 400, "profile not found");
      }

      await this.db.query(
        `
          INSERT INTO workspace_invitation_vault_access (invitation_id, vault_id, profile_id)
          VALUES ($1, $2, $3)
          ON CONFLICT (invitation_id, vault_id)
          DO UPDATE SET profile_id = EXCLUDED.profile_id
        `,
        [invitationId, change.vaultId, change.profileId],
      );
    }
  }

  async updateMemberRole(
    workspaceId: string,
    actorId: string,
    targetUserId: string,
    roleId: string,
  ): Promise<void> {
    const workspace = await this.requireAccessibleWorkspace(workspaceId, actorId);
    await this.assertMembers(workspaceId, actorId, "put");
    if (!isEntityId(targetUserId) || !isEntityId(roleId)) {
      throw new WorkspaceMembersServiceError("BAD_REQUEST", 400, "invalid ids");
    }
    if (targetUserId === workspace.ownerId) {
      throw new WorkspaceMembersServiceError("BAD_REQUEST", 400, "cannot change owner role");
    }

    const role = await this.loadRole(workspaceId, roleId);
    if (!role) {
      throw new WorkspaceMembersServiceError("BAD_REQUEST", 400, "role not found");
    }
    if (role.builtinKey === "owner") {
      throw new WorkspaceMembersServiceError("BAD_REQUEST", 400, "cannot assign owner role");
    }

    const memberRows = await this.db.query<{ id: string; role_id: string | null }>(
      `
        SELECT id, role_id FROM workspace_members
        WHERE workspace_id = $1 AND user_id = $2
        LIMIT 1
      `,
      [workspaceId, targetUserId],
    );
    if (!memberRows[0]) {
      throw new WorkspaceMembersServiceError("NOT_FOUND", 404, "member not found");
    }
    if (memberRows[0].role_id === roleId) {
      return;
    }

    await this.db.query(
      `
        UPDATE workspace_members
        SET role_id = $3,
            role_changed_by_user_id = $4,
            role_changed_at = now()
        WHERE workspace_id = $1 AND user_id = $2
      `,
      [workspaceId, targetUserId, roleId, actorId],
    );
  }

  async removeMember(workspaceId: string, actorId: string, targetUserId: string): Promise<void> {
    const workspace = await this.requireAccessibleWorkspace(workspaceId, actorId);
    await this.assertMembers(workspaceId, actorId, "delete");
    if (!isEntityId(targetUserId)) {
      throw new WorkspaceMembersServiceError("BAD_REQUEST", 400, "invalid userId");
    }
    if (targetUserId === workspace.ownerId) {
      throw new WorkspaceMembersServiceError("BAD_REQUEST", 400, "cannot remove owner");
    }
    if (targetUserId === actorId) {
      throw new WorkspaceMembersServiceError("BAD_REQUEST", 400, "cannot remove yourself");
    }

    const memberRows = await this.db.query<{ id: string }>(
      `
        SELECT id FROM workspace_members
        WHERE workspace_id = $1 AND user_id = $2
        LIMIT 1
      `,
      [workspaceId, targetUserId],
    );
    if (!memberRows[0]) {
      throw new WorkspaceMembersServiceError("NOT_FOUND", 404, "member not found");
    }

    // Minimal revoke: drop shared vault memberships/keys/profiles (no key rotation in this iteration).
    await this.db.query(
      `
        DELETE FROM vault_keys
        WHERE user_id = $1
          AND vault_id IN (
            SELECT id FROM vaults WHERE workspace_id = $2 AND is_personal = false
          )
      `,
      [targetUserId, workspaceId],
    );
    await this.db.query(
      `
        DELETE FROM vault_profiles
        WHERE user_id = $1
          AND vault_id IN (
            SELECT id FROM vaults WHERE workspace_id = $2 AND is_personal = false
          )
      `,
      [targetUserId, workspaceId],
    );
    await this.db.query(
      `
        DELETE FROM vault_members
        WHERE user_id = $1
          AND vault_id IN (
            SELECT id FROM vaults WHERE workspace_id = $2 AND is_personal = false
          )
      `,
      [targetUserId, workspaceId],
    );
    await this.db.query(
      `DELETE FROM workspace_members WHERE workspace_id = $1 AND user_id = $2`,
      [workspaceId, targetUserId],
    );
  }

  async getMemberVaultAccess(
    workspaceId: string,
    actorId: string,
    targetUserId: string,
  ): Promise<MemberVaultAccessEntry[]> {
    await this.requireAccessibleWorkspace(workspaceId, actorId);
    await this.assertMembers(workspaceId, actorId, "get");
    if (!isEntityId(targetUserId)) {
      throw new WorkspaceMembersServiceError("BAD_REQUEST", 400, "invalid userId");
    }
    await this.requireActiveMember(workspaceId, targetUserId);

    const rows = await this.db.query<{
      vault_id: string;
      name: string;
      icon: string;
      description: string;
      profile_id: string | null;
    }>(
      `
        SELECT
          v.id AS vault_id,
          v.name,
          v.icon,
          v.description,
          vp.profile_id
        FROM vaults v
        LEFT JOIN vault_profiles vp
          ON vp.vault_id = v.id AND vp.user_id = $2
        WHERE v.workspace_id = $1
          AND v.is_personal = false
        ORDER BY v.created_at ASC, v.id ASC
      `,
      [workspaceId, targetUserId],
    );

    return rows.map((row) => ({
      vaultId: row.vault_id,
      name: row.name,
      icon: row.icon,
      description: row.description,
      profileId: row.profile_id,
    }));
  }

  async updateMemberVaultAccess(
    workspaceId: string,
    actorId: string,
    targetUserId: string,
    changes: MemberVaultAccessChange[],
  ): Promise<void> {
    await this.requireAccessibleWorkspace(workspaceId, actorId);
    await this.assertMembers(workspaceId, actorId, "put");
    if (!isEntityId(targetUserId)) {
      throw new WorkspaceMembersServiceError("BAD_REQUEST", 400, "invalid userId");
    }
    await this.requireActiveMember(workspaceId, targetUserId);
    if (!Array.isArray(changes) || changes.length === 0) {
      return;
    }

    for (const change of changes) {
      if (!isEntityId(change.vaultId)) {
        throw new WorkspaceMembersServiceError("BAD_REQUEST", 400, "invalid vaultId");
      }
      const vaultRows = await this.db.query<{ id: string; is_personal: boolean }>(
        `
          SELECT id, is_personal FROM vaults
          WHERE id = $1 AND workspace_id = $2
          LIMIT 1
        `,
        [change.vaultId, workspaceId],
      );
      const vault = vaultRows[0];
      if (!vault) {
        throw new WorkspaceMembersServiceError("NOT_FOUND", 404, "vault not found");
      }
      if (vault.is_personal) {
        throw new WorkspaceMembersServiceError("BAD_REQUEST", 400, "personal vault access cannot be updated");
      }

      const current = await this.db.query<{ profile_id: string | null }>(
        `
          SELECT profile_id FROM vault_profiles
          WHERE vault_id = $1 AND user_id = $2
          LIMIT 1
        `,
        [change.vaultId, targetUserId],
      );
      const currentProfileId = current[0]?.profile_id ?? null;
      const nextProfileId = change.profileId;

      if (nextProfileId === currentProfileId) {
        continue;
      }

      if (nextProfileId == null) {
        // Revoke
        if (!change.rotatedVaultKeys || change.rotatedVaultKeys.length === 0) {
          throw new WorkspaceMembersServiceError(
            "BAD_REQUEST",
            400,
            "rotatedVaultKeys required when revoking access",
          );
        }
        if (change.encryptedPayload == null || change.baseVersion == null) {
          throw new WorkspaceMembersServiceError(
            "BAD_REQUEST",
            400,
            "encryptedPayload and baseVersion required when revoking",
          );
        }
        const input: VaultAccessUpdateInput = {
          grants: [],
          profileUpdates: [],
          revokes: [{ userId: targetUserId }],
          rotatedVaultKeys: change.rotatedVaultKeys,
          encryptedPayload: change.encryptedPayload,
          signature: change.signature,
          baseVersion: change.baseVersion,
          idempotencyKey: change.idempotencyKey,
          clientCreatedAt: change.clientCreatedAt,
        };
        await this.vaultService.updateVaultAccess(change.vaultId, actorId, input);
        continue;
      }

      if (!isEntityId(nextProfileId)) {
        throw new WorkspaceMembersServiceError("BAD_REQUEST", 400, "invalid profileId");
      }

      if (currentProfileId == null) {
        // Grant
        if (change.encryptedVaultKey == null) {
          throw new WorkspaceMembersServiceError(
            "BAD_REQUEST",
            400,
            "encryptedVaultKey required when granting access",
          );
        }
        if (change.encryptedPayload == null || change.baseVersion == null) {
          // Grants in vault service don't require encryptedPayload for the batch path,
          // but VaultAccessUpdateInput requires it for revokes. For grants-only we pass a
          // dummy opaque payload isn't needed — updateVaultAccess only uses payload on revoke.
          // Provide minimal fields.
        }
        const input: VaultAccessUpdateInput = {
          grants: [
            {
              userId: targetUserId,
              profileId: nextProfileId,
              encryptedVaultKey: change.encryptedVaultKey,
            },
          ],
          profileUpdates: [],
          revokes: [],
          encryptedPayload: change.encryptedPayload ?? { v: 1, alg: "none", ciphertext: "" },
          signature: change.signature,
          baseVersion: change.baseVersion ?? 0,
          idempotencyKey: change.idempotencyKey,
          clientCreatedAt: change.clientCreatedAt,
        };
        await this.vaultService.updateVaultAccess(change.vaultId, actorId, input);
        continue;
      }

      // Profile-only update
      const input: VaultAccessUpdateInput = {
        grants: [],
        profileUpdates: [{ userId: targetUserId, profileId: nextProfileId }],
        revokes: [],
        encryptedPayload: change.encryptedPayload ?? { v: 1, alg: "none", ciphertext: "" },
        baseVersion: change.baseVersion ?? 0,
      };
      await this.vaultService.updateVaultAccess(change.vaultId, actorId, input);
    }
  }

  private async assertMembers(
    workspaceId: string,
    actorId: string,
    action: "get" | "post" | "put" | "delete",
  ): Promise<WorkspacePermissionsMatrix> {
    try {
      return await assertWorkspacePermission(this.db, workspaceId, actorId, "members", action);
    } catch (error) {
      if (error instanceof WorkspacePermissionError) {
        throw new WorkspaceMembersServiceError(error.code, error.statusCode, error.message);
      }
      throw error;
    }
  }

  private async requireWorkspace(workspaceId: string) {
    const workspace = await this.workspaces.findById(workspaceId);
    if (!workspace) {
      throw new WorkspaceMembersServiceError("WORKSPACE_NOT_FOUND", 404, "workspace not found");
    }
    return workspace;
  }

  private async requireAccessibleWorkspace(workspaceId: string, userId: string) {
    const workspace = await this.requireWorkspace(workspaceId);
    const hasAccess = await this.workspaces.hasAccess(workspaceId, userId);
    if (!hasAccess) {
      throw new WorkspaceMembersServiceError("ACCESS_DENIED", 403, "access denied");
    }
    return workspace;
  }

  private async requireActiveMember(workspaceId: string, userId: string): Promise<void> {
    const workspace = await this.requireWorkspace(workspaceId);
    if (workspace.ownerId === userId) {
      return;
    }
    const rows = await this.db.query<{ id: string }>(
      `
        SELECT id FROM workspace_members
        WHERE workspace_id = $1 AND user_id = $2
        LIMIT 1
      `,
      [workspaceId, userId],
    );
    if (!rows[0]) {
      throw new WorkspaceMembersServiceError("NOT_FOUND", 404, "member not found");
    }
  }

  private async requirePendingInvitation(workspaceId: string, invitationId: string): Promise<void> {
    if (!isEntityId(invitationId)) {
      throw new WorkspaceMembersServiceError("BAD_REQUEST", 400, "invalid invitationId");
    }
    const rows = await this.db.query<{ id: string; status: string }>(
      `
        SELECT id, status FROM workspace_invitations
        WHERE id = $1 AND workspace_id = $2
        LIMIT 1
      `,
      [invitationId, workspaceId],
    );
    const row = rows[0];
    if (!row) {
      throw new WorkspaceMembersServiceError("NOT_FOUND", 404, "invitation not found");
    }
    if (row.status !== "pending") {
      throw new WorkspaceMembersServiceError("BAD_REQUEST", 400, "invitation is not pending");
    }
  }

  private async loadRole(workspaceId: string, roleId: string) {
    const rows = await this.db.query<{ id: string; builtin_key: string | null; name: string }>(
      `
        SELECT id, builtin_key, name FROM roles
        WHERE id = $1 AND workspace_id = $2
        LIMIT 1
      `,
      [roleId, workspaceId],
    );
    const row = rows[0];
    if (!row) {
      return null;
    }
    return { id: row.id, builtinKey: row.builtin_key, name: row.name };
  }

  private async loadUserBrief(userId: string): Promise<MemberActorRef | null> {
    const rows = await this.db.query<{
      id: string;
      email: string;
      first_name: string | null;
      last_name: string | null;
    }>(
      `SELECT id, email, first_name, last_name FROM users WHERE id = $1 LIMIT 1`,
      [userId],
    );
    const row = rows[0];
    if (!row) {
      return null;
    }
    return {
      userId: row.id,
      email: row.email,
      firstName: row.first_name,
      lastName: row.last_name,
    };
  }

  private async loadActiveMembers(workspaceId: string): Promise<WorkspaceMemberRecord[]> {
    const rows = await this.db.query<{
      user_id: string;
      email: string;
      first_name: string | null;
      last_name: string | null;
      public_key: string;
      public_pq_key: string | null;
      role_id: string | null;
      role_builtin_key: string | null;
      role_name: string | null;
      joined_at: string | Date | null;
      invited_at: string | Date | null;
      role_changed_at: string | Date | null;
      invited_by_user_id: string | null;
      invited_by_email: string | null;
      invited_by_first_name: string | null;
      invited_by_last_name: string | null;
      role_changed_by_user_id: string | null;
      role_changed_by_email: string | null;
      role_changed_by_first_name: string | null;
      role_changed_by_last_name: string | null;
      last_login_at: string | Date | null;
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
          r.builtin_key AS role_builtin_key,
          r.name AS role_name,
          COALESCE(wm.created_at, w.created_at) AS joined_at,
          wm.invited_at,
          wm.role_changed_at,
          wm.invited_by_user_id,
          ib.email AS invited_by_email,
          ib.first_name AS invited_by_first_name,
          ib.last_name AS invited_by_last_name,
          wm.role_changed_by_user_id,
          rb.email AS role_changed_by_email,
          rb.first_name AS role_changed_by_first_name,
          rb.last_name AS role_changed_by_last_name,
          (
            SELECT MAX(d.last_seen_at)
            FROM devices d
            WHERE d.user_id = u.id
          ) AS last_login_at
        FROM (
          SELECT
            wm.workspace_id,
            wm.user_id,
            wm.role_id,
            wm.created_at,
            wm.invited_by_user_id,
            wm.invited_at,
            wm.role_changed_by_user_id,
            wm.role_changed_at
          FROM workspace_members wm
          WHERE wm.workspace_id = $1
          UNION ALL
          SELECT
            w.id AS workspace_id,
            w.owner_id AS user_id,
            owner_role.id AS role_id,
            w.created_at,
            NULL::bigint AS invited_by_user_id,
            NULL::timestamptz AS invited_at,
            NULL::bigint AS role_changed_by_user_id,
            NULL::timestamptz AS role_changed_at
          FROM workspaces w
          LEFT JOIN roles owner_role
            ON owner_role.workspace_id = w.id
           AND owner_role.builtin_key = 'owner'
          WHERE w.id = $1
            AND NOT EXISTS (
              SELECT 1 FROM workspace_members wm2
              WHERE wm2.workspace_id = w.id AND wm2.user_id = w.owner_id
            )
        ) wm
        JOIN workspaces w ON w.id = wm.workspace_id
        JOIN users u ON u.id = wm.user_id
        LEFT JOIN roles r ON r.id = wm.role_id
        LEFT JOIN users ib ON ib.id = wm.invited_by_user_id
        LEFT JOIN users rb ON rb.id = wm.role_changed_by_user_id
        ORDER BY
          CASE WHEN r.builtin_key = 'owner' OR u.id = w.owner_id THEN 0 ELSE 1 END,
          lower(u.email) ASC
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
        roleName: row.role_name,
        status: "active",
        invitationId: null,
        invitedAt: toIso(row.invited_at),
        invitedBy: actorFromRow({
          user_id: row.invited_by_user_id,
          email: row.invited_by_email,
          first_name: row.invited_by_first_name,
          last_name: row.invited_by_last_name,
        }),
        roleChangedAt: toIso(row.role_changed_at),
        roleChangedBy: actorFromRow({
          user_id: row.role_changed_by_user_id,
          email: row.role_changed_by_email,
          first_name: row.role_changed_by_first_name,
          last_name: row.role_changed_by_last_name,
        }),
        joinedAt: toIso(row.joined_at),
        lastLoginAt: toIso(row.last_login_at),
      });
    }
    return members;
  }

  private async loadPendingInvitations(workspaceId: string): Promise<WorkspaceMemberRecord[]> {
    const rows = await this.db.query<{
      invitation_id: string;
      email: string;
      role_id: string;
      role_builtin_key: string | null;
      role_name: string | null;
      invited_at: string | Date;
      invited_by_user_id: string;
      invited_by_email: string;
      invited_by_first_name: string | null;
      invited_by_last_name: string | null;
    }>(
      `
        SELECT
          wi.id AS invitation_id,
          wi.email,
          wi.role_id,
          r.builtin_key AS role_builtin_key,
          r.name AS role_name,
          wi.created_at AS invited_at,
          wi.invited_by_user_id,
          u.email AS invited_by_email,
          u.first_name AS invited_by_first_name,
          u.last_name AS invited_by_last_name
        FROM workspace_invitations wi
        JOIN roles r ON r.id = wi.role_id
        JOIN users u ON u.id = wi.invited_by_user_id
        WHERE wi.workspace_id = $1
          AND wi.status = 'pending'
          AND wi.expires_at > now()
        ORDER BY wi.created_at DESC
      `,
      [workspaceId],
    );

    return rows.map((row) => ({
      userId: null,
      email: row.email,
      firstName: null,
      lastName: null,
      publicKey: "",
      publicPqKey: null,
      roleId: row.role_id,
      roleBuiltinKey: row.role_builtin_key,
      roleName: row.role_name,
      status: "pending" as const,
      invitationId: row.invitation_id,
      invitedAt: toIso(row.invited_at),
      invitedBy: {
        userId: row.invited_by_user_id,
        email: row.invited_by_email,
        firstName: row.invited_by_first_name,
        lastName: row.invited_by_last_name,
      },
      roleChangedAt: null,
      roleChangedBy: null,
      joinedAt: null,
      lastLoginAt: null,
    }));
  }
}

function displayName(user: MemberActorRef): string {
  const parts = [user.firstName, user.lastName].filter(Boolean);
  if (parts.length > 0) {
    return parts.join(" ");
  }
  return user.email;
}
