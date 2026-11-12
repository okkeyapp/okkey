import { createHash, randomBytes } from "node:crypto";

import { DEFAULT_PERSONAL_VAULT_NAME } from "@okkey/types";

import { DEFAULT_NEW_VAULT_CRYPTO_VERSION } from "../crypto/downgrade.ts";
import { generateEntityId, isEntityId } from "../entity-id.ts";
import {
  workspaceGetPlanQuotaLimits,
  workspaceHasPlanFeature,
  type PlanEntitlementRuntimeConfig,
  type WorkspacePlanEntitlementSource,
} from "../plan-entitlements.ts";
import type { QueryExecutor } from "../storage/postgres.ts";
import type { WorkspacesRepository } from "../storage/repositories.ts";
import type { VaultAccessUpdateInput, WorkspaceSharedVaultsService } from "../workspace-shared-vaults/service.ts";
import type { EmailTemplateService } from "../email/service.ts";
import { resolveLinkBaseUrl, type PublicAppUrlResolver } from "../mail-settings/public-url.ts";
import {
  assertWorkspacePermission,
  assertWorkspacePermissionOnObject,
  type WorkspacePermissionsMatrix,
  type WorkspaceResourcePermission,
  WorkspacePermissionError,
} from "../workspace-roles/permissions.ts";
import { ensureDefaultWorkspaceRoles } from "../workspace-roles/seed.ts";
import { countOccupiedAdditionalMemberSeats } from "./additional-member-seats.ts";
import { recipientPublicKeysAreValid } from "./recipientPublicKeys.ts";
import { WorkspaceKeyServiceError } from "../workspace-key/service.ts";

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

export type InvitationPreviewStatus = "pending" | "expired" | "revoked" | "accepted";

export type InvitationPreview = {
  status: InvitationPreviewStatus;
  email: string;
  workspaceName: string;
  inviterDisplayName: string;
  expiresAt: string;
};

export type PendingVaultWrap = {
  userId: string;
  vaultId: string;
  profileId: string;
  publicKey: string;
  publicPqKey: string | null;
};

/** Staged grant omitted from wraps because the recipient public key is invalid. */
export type PendingVaultWrapSkipped = {
  userId: string;
  vaultId: string;
  profileId: string;
};

export type ListPendingVaultWrapsResult = {
  wraps: PendingVaultWrap[];
  skippedInvalidKeyRecipients: PendingVaultWrapSkipped[];
};

export interface WorkspaceKeyRotationRequest {
  wraps: Array<{ userId: string; encryptedWorkspaceKey: import("../crypto/encrypted-blob.ts").EncryptedBlob }>;
}

export interface WorkspaceMembersServiceDeps {
  db: QueryExecutor & {
    transaction?: <T>(fn: (tx: QueryExecutor) => Promise<T>) => Promise<T>;
  };
  workspaces: Pick<WorkspacesRepository, "findById" | "hasAccess">;
  vaultService?: Pick<WorkspaceSharedVaultsService, "updateVaultAccess" | "getVaultAccess">;
  emailTemplates?: Pick<EmailTemplateService, "sendWorkspaceInvite">;
  publicAppBaseUrl?: string;
  /** Effective public origin at send time (database, otherwise env). */
  resolvePublicAppBaseUrl?: PublicAppUrlResolver;
  config?: PlanEntitlementRuntimeConfig;
  workspaceKeys?: {
    rotateOnRemoval(
      workspaceId: string,
      removedUserId: string,
      wraps: WorkspaceKeyRotationRequest["wraps"] | null,
    ): Promise<{ nextVersion: number } | null>;
    /** Drop the member's wraps and queue a later rotation. Does not publish a new version. */
    dropWrapAndEnqueue(workspaceId: string, removedUserId: string): Promise<void>;
    listPendingRecipients(workspaceId: string, actorId: string): Promise<string[]>;
    listPendingRotations(workspaceId: string, actorId: string): Promise<string[]>;
    applyDeferredRotation(
      workspaceId: string,
      actorId: string,
      wraps: WorkspaceKeyRotationRequest["wraps"],
    ): Promise<{ nextVersion: number } | null>;
  };
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
  private readonly db: WorkspaceMembersServiceDeps["db"];
  private readonly workspaces: Pick<WorkspacesRepository, "findById" | "hasAccess">;
  private readonly vaultService?: Pick<WorkspaceSharedVaultsService, "updateVaultAccess" | "getVaultAccess">;
  private readonly emailTemplates?: Pick<EmailTemplateService, "sendWorkspaceInvite">;
  private readonly publicAppBaseUrl: string;
  private readonly resolvePublicAppBaseUrl?: PublicAppUrlResolver;
  private readonly config?: PlanEntitlementRuntimeConfig;
  private readonly workspaceKeys: WorkspaceMembersServiceDeps["workspaceKeys"];

  constructor(deps: WorkspaceMembersServiceDeps) {
    this.db = deps.db;
    this.workspaces = deps.workspaces;
    this.vaultService = deps.vaultService;
    this.emailTemplates = deps.emailTemplates;
    this.publicAppBaseUrl = (deps.publicAppBaseUrl ?? "").replace(/\/$/, "");
    this.resolvePublicAppBaseUrl = deps.resolvePublicAppBaseUrl;
    this.config = deps.config;
    this.workspaceKeys = deps.workspaceKeys;
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
    let members = [...active, ...pending];
    if (matrix.members.get === 2) {
      members = members.filter(
        (member) => member.invitedBy?.userId === actorId || member.userId === actorId,
      );
    }
    return {
      members,
      actorPermissions: { members: matrix.members },
    };
  }

  /**
   * Lightweight directory for activity / audit labels and the capsule recipients picker.
   * Available to any workspace member (not gated by members.get or plan quotas).
   */
  async listMemberDirectory(
    workspaceId: string,
    actorId: string,
  ): Promise<Array<{ userId: string; email: string; firstName: string | null; lastName: string | null }>> {
    await this.requireAccessibleWorkspace(workspaceId, actorId);
    const active = await this.loadActiveMembers(workspaceId);
    return active.flatMap((member) => {
      if (!member.userId) {
        return [];
      }
      return [
        {
          userId: member.userId,
          email: member.email,
          firstName: member.firstName,
          lastName: member.lastName,
        },
      ];
    });
  }

  /**
   * Authorize before body validation so foreign workspaces cannot be probed via 400s
   * (same pattern as Core item-category-preferences / the item-category route).
   */
  async ensureWorkspaceAccess(workspaceId: string, userId: string): Promise<void> {
    if (!isEntityId(workspaceId)) {
      throw new WorkspaceMembersServiceError(
        "INVALID_WORKSPACE_ID",
        400,
        "workspaceId must be a snowflake entity id",
      );
    }
    await this.requireAccessibleWorkspace(workspaceId, userId);
  }

  async createInvitations(
    workspaceId: string,
    actorId: string,
    invitations: Array<{ email: string; roleId: string }>,
    localeHints: { acceptLanguage?: string | null } = {},
  ): Promise<Array<{ invitationId: string; email: string; roleId: string }>> {
    // Align with Core HttpApp entity-id path checks (okkey#197): never hit Postgres with
    // a non-snowflake workspace id (would surface as HTTP 500 from bigint cast).
    if (!isEntityId(workspaceId)) {
      throw new WorkspaceMembersServiceError(
        "INVALID_WORKSPACE_ID",
        400,
        "workspaceId must be a snowflake entity id",
      );
    }

    // Access before payload validation — empty / oversized / missing invitations must not
    // leak workspace existence to callers without access (403 before 400).
    const workspace = await this.requireAccessibleWorkspace(workspaceId, actorId);

    if (!Array.isArray(invitations) || invitations.length === 0) {
      throw new WorkspaceMembersServiceError("BAD_REQUEST", 400, "invitations required");
    }
    if (invitations.length > 50) {
      throw new WorkspaceMembersServiceError("BAD_REQUEST", 400, "too many invitations");
    }

    this.assertAdditionalMembersConfigurable(workspace);
    await this.assertAdditionalMembersQuota(workspaceId, workspace, invitations.length);
    await this.assertMembers(workspaceId, actorId, "post");
    await ensureDefaultWorkspaceRoles(this.db, workspaceId, workspace.ownerId);

    const inviter = await this.loadUserBrief(actorId);
    if (!inviter) {
      throw new WorkspaceMembersServiceError("ACCESS_DENIED", 403, "access denied");
    }
    const publicAppBaseUrl = await resolveLinkBaseUrl(
      this.publicAppBaseUrl,
      this.resolvePublicAppBaseUrl,
    );
    if (!this.emailTemplates || !publicAppBaseUrl) {
      throw new WorkspaceMembersServiceError(
        "EMAIL_NOT_CONFIGURED",
        503,
        "PUBLIC_APP_URL and email transport are required to send invitations",
      );
    }

    const created: Array<{ invitationId: string; email: string; roleId: string }> = [];

    for (const item of invitations) {
      const email = normalizeEmail(item.email ?? "");
      if (!email || !email.includes("@") || email.length > 254) {
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
      this.assertAssignableWorkspaceRole(workspace, role);

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

      const inviteUrl = `${publicAppBaseUrl}/invite/${rawToken}`;
      // Recipient profile locale wins; inviter Accept-Language is only a fallback
      // for unknown recipients / null profile locale (see resolveEmailLocaleForRecipient).
      const recipientLocale = await this.loadUserLocaleByEmail(email);
      try {
        await this.emailTemplates.sendWorkspaceInvite({
          to: email,
          localeHints: {
            userLocale: recipientLocale,
            acceptLanguage: localeHints.acceptLanguage,
          },
          variables: {
            inviterDisplayName: displayName(inviter),
            inviterEmail: inviter.email,
            workspaceName: workspace.name,
            roleBuiltinKey:
              role.builtinKey === "owner" ||
              role.builtinKey === "admin" ||
              role.builtinKey === "user"
                ? role.builtinKey
                : null,
            roleName: role.name,
            expiresAtIso: expiresAt,
            inviteUrl,
          },
        });
      } catch (error) {
        await this.db.query(`DELETE FROM workspace_invitations WHERE id = $1`, [invitationId]);
        if (error instanceof WorkspaceMembersServiceError) {
          throw error;
        }
        throw new WorkspaceMembersServiceError(
          "EMAIL_SEND_FAILED",
          503,
          "failed to send invitation email",
        );
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
    if (!isEntityId(invitationId)) {
      throw new WorkspaceMembersServiceError("BAD_REQUEST", 400, "invalid invitationId");
    }

    const rows = await this.db.query<{ id: string; status: string; invited_by_user_id: string }>(
      `
        SELECT id, status, invited_by_user_id FROM workspace_invitations
        WHERE id = $1 AND workspace_id = $2
        LIMIT 1
      `,
      [invitationId, workspaceId],
    );
    const row = rows[0];
    if (!row) {
      throw new WorkspaceMembersServiceError("NOT_FOUND", 404, "invitation not found");
    }
    await this.assertMembersOnObject(
      workspaceId,
      actorId,
      "delete",
      row.invited_by_user_id === actorId,
    );
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
    const workspace = await this.requireAccessibleWorkspace(workspaceId, actorId);
    this.assertAdditionalMembersConfigurable(workspace);
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
    this.assertAssignableWorkspaceRole(workspace, role);

    const rows = await this.db.query<{
      id: string;
      status: string;
      role_id: string;
      invited_by_user_id: string;
    }>(
      `
        SELECT id, status, role_id, invited_by_user_id FROM workspace_invitations
        WHERE id = $1 AND workspace_id = $2
        LIMIT 1
      `,
      [invitationId, workspaceId],
    );
    const row = rows[0];
    if (!row) {
      throw new WorkspaceMembersServiceError("NOT_FOUND", 404, "invitation not found");
    }
    await this.assertMembersOnObject(
      workspaceId,
      actorId,
      "put",
      row.invited_by_user_id === actorId,
    );
    if (row.status !== "pending") {
      throw new WorkspaceMembersServiceError("BAD_REQUEST", 400, "invitation is not pending");
    }
    if (row.role_id === roleId) {
      return;
    }

    await this.db.query(
      `
        UPDATE workspace_invitations
        SET role_id = $3,
            role_changed_by_user_id = $4,
            role_changed_at = now()
        WHERE id = $1 AND workspace_id = $2 AND status = 'pending'
      `,
      [invitationId, workspaceId, roleId, actorId],
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
    const workspace = await this.requireAccessibleWorkspace(workspaceId, actorId);
    this.assertAdditionalMembersConfigurable(workspace);
    const invitation = await this.requirePendingInvitation(workspaceId, invitationId);
    await this.assertMembersOnObject(
      workspaceId,
      actorId,
      "put",
      invitation.invitedByUserId === actorId,
    );
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
      await this.assertAssignableWorkspaceProfile(workspace, workspaceId, change.profileId);

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
    this.assertAdditionalMembersConfigurable(workspace);
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
    this.assertAssignableWorkspaceRole(workspace, role);

    const memberRows = await this.db.query<{
      id: string;
      role_id: string | null;
      invited_by_user_id: string | null;
    }>(
      `
        SELECT id, role_id, invited_by_user_id FROM workspace_members
        WHERE workspace_id = $1 AND user_id = $2
        LIMIT 1
      `,
      [workspaceId, targetUserId],
    );
    if (!memberRows[0]) {
      throw new WorkspaceMembersServiceError("NOT_FOUND", 404, "member not found");
    }
    await this.assertMembersOnObject(
      workspaceId,
      actorId,
      "put",
      memberRows[0].invited_by_user_id === actorId || targetUserId === actorId,
    );
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

  /** Not plan-gated: after downgrade, existing additional members must remain removable. */
  async removeMember(
    workspaceId: string,
    actorId: string,
    targetUserId: string,
    rotation: WorkspaceKeyRotationRequest | null = null,
  ): Promise<void> {
    await this.assertMemberCanBeRemoved(workspaceId, actorId, targetUserId);

    if (this.workspaceKeys) {
      try {
        await this.workspaceKeys.rotateOnRemoval(workspaceId, targetUserId, rotation?.wraps ?? null);
      } catch (error) {
        throw this.asMembersKeyError(error);
      }
    }

    await this.deleteMemberRecords(workspaceId, targetUserId);
  }

  /**
   * Remove a member when the caller cannot wrap a new workspace key.
   * Directory sync and seat reduction call this. The member's wraps are deleted,
   * the removal is queued, and no new key version is published.
   */
  async removeMemberWithoutKeyHolder(
    workspaceId: string,
    actorId: string,
    targetUserId: string,
  ): Promise<void> {
    await this.assertMemberCanBeRemoved(workspaceId, actorId, targetUserId);
    if (this.workspaceKeys) {
      try {
        await this.workspaceKeys.dropWrapAndEnqueue(workspaceId, targetUserId);
      } catch (error) {
        throw this.asMembersKeyError(error);
      }
    }
    await this.deleteMemberRecords(workspaceId, targetUserId);
  }

  async listPendingWorkspaceKeyRecipients(workspaceId: string, actorId: string): Promise<string[]> {
    await this.requireAccessibleWorkspace(workspaceId, actorId);
    await this.assertMembers(workspaceId, actorId, "get");
    if (!this.workspaceKeys) {
      return [];
    }
    try {
      return await this.workspaceKeys.listPendingRecipients(workspaceId, actorId);
    } catch (error) {
      throw this.asMembersKeyError(error);
    }
  }

  async listPendingWorkspaceKeyRotations(workspaceId: string, actorId: string): Promise<string[]> {
    await this.requireAccessibleWorkspace(workspaceId, actorId);
    await this.assertMembers(workspaceId, actorId, "get");
    if (!this.workspaceKeys) {
      return [];
    }
    try {
      return await this.workspaceKeys.listPendingRotations(workspaceId, actorId);
    } catch (error) {
      throw this.asMembersKeyError(error);
    }
  }

  async applyDeferredWorkspaceKeyRotation(
    workspaceId: string,
    actorId: string,
    wraps: WorkspaceKeyRotationRequest["wraps"],
  ): Promise<{ nextVersion: number } | null> {
    await this.requireAccessibleWorkspace(workspaceId, actorId);
    await this.assertMembers(workspaceId, actorId, "get");
    if (!this.workspaceKeys) {
      return null;
    }
    try {
      return await this.workspaceKeys.applyDeferredRotation(workspaceId, actorId, wraps);
    } catch (error) {
      throw this.asMembersKeyError(error);
    }
  }

  private asMembersKeyError(error: unknown): unknown {
    if (error instanceof WorkspaceKeyServiceError) {
      return new WorkspaceMembersServiceError(error.code, error.statusCode, error.message);
    }
    return error;
  }

  private async assertMemberCanBeRemoved(
    workspaceId: string,
    actorId: string,
    targetUserId: string,
  ): Promise<void> {
    const workspace = await this.requireAccessibleWorkspace(workspaceId, actorId);
    if (!isEntityId(targetUserId)) {
      throw new WorkspaceMembersServiceError("BAD_REQUEST", 400, "invalid userId");
    }
    if (targetUserId === workspace.ownerId) {
      throw new WorkspaceMembersServiceError("BAD_REQUEST", 400, "cannot remove owner");
    }
    if (targetUserId === actorId) {
      throw new WorkspaceMembersServiceError("BAD_REQUEST", 400, "cannot remove yourself");
    }

    const memberRows = await this.db.query<{ id: string; invited_by_user_id: string | null }>(
      `
        SELECT id, invited_by_user_id FROM workspace_members
        WHERE workspace_id = $1 AND user_id = $2
        LIMIT 1
      `,
      [workspaceId, targetUserId],
    );
    if (!memberRows[0]) {
      throw new WorkspaceMembersServiceError("NOT_FOUND", 404, "member not found");
    }
    await this.assertMembersOnObject(
      workspaceId,
      actorId,
      "delete",
      memberRows[0].invited_by_user_id === actorId,
    );
  }

  private async deleteMemberRecords(workspaceId: string, targetUserId: string): Promise<void> {
    // Drop shared vault memberships/keys/profiles. Workspace-key rotation, when a key exists,
    // already installed the next version for the remaining members and deleted this member's wraps.
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
    // Drop staged invitation vault wraps for this accepted user (keep invitation row).
    await this.db.query(
      `
        DELETE FROM workspace_invitation_vault_access
        WHERE invitation_id IN (
          SELECT id FROM workspace_invitations
          WHERE workspace_id = $1 AND accepted_user_id = $2
        )
      `,
      [workspaceId, targetUserId],
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
    const workspace = await this.requireAccessibleWorkspace(workspaceId, actorId);
    this.assertAdditionalMembersConfigurable(workspace);
    if (!isEntityId(targetUserId)) {
      throw new WorkspaceMembersServiceError("BAD_REQUEST", 400, "invalid userId");
    }
    const member = await this.requireActiveMember(workspaceId, targetUserId);
    await this.assertMembersOnObject(
      workspaceId,
      actorId,
      "put",
      member.invitedByUserId === actorId || targetUserId === actorId,
    );
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
        await this.requireVaultAccessService().updateVaultAccess(change.vaultId, actorId, input);
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
        await this.assertRecipientPublicKeysValid(targetUserId);
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
        await this.assertAssignableWorkspaceProfile(workspace, workspaceId, nextProfileId);
        await this.requireVaultAccessService().updateVaultAccess(change.vaultId, actorId, input);
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
      await this.assertAssignableWorkspaceProfile(workspace, workspaceId, nextProfileId);
      await this.requireVaultAccessService().updateVaultAccess(change.vaultId, actorId, input);
    }
  }

  private requireVaultAccessService(): NonNullable<WorkspaceMembersService["vaultService"]> {
    if (!this.vaultService) {
      throw new WorkspaceMembersServiceError(
        "INTERNAL_SERVER_ERROR",
        500,
        "vault access is not configured",
      );
    }
    return this.vaultService;
  }

  async previewInvitation(rawToken: string): Promise<InvitationPreview> {
    const token = rawToken.trim();
    if (!token) {
      throw new WorkspaceMembersServiceError("NOT_FOUND", 404, "invitation not found");
    }
    const rows = await this.db.query<{
      email: string;
      status: string;
      expires_at: string | Date;
      workspace_name: string;
      inviter_email: string | null;
      inviter_first_name: string | null;
      inviter_last_name: string | null;
    }>(
      `
        SELECT
          wi.email,
          wi.status,
          wi.expires_at,
          w.name AS workspace_name,
          u.email AS inviter_email,
          u.first_name AS inviter_first_name,
          u.last_name AS inviter_last_name
        FROM workspace_invitations wi
        JOIN workspaces w ON w.id = wi.workspace_id
        LEFT JOIN users u ON u.id = wi.invited_by_user_id
        WHERE wi.token_hash = $1
        LIMIT 1
      `,
      [hashInviteToken(token)],
    );
    const row = rows[0];
    if (!row) {
      throw new WorkspaceMembersServiceError("NOT_FOUND", 404, "invitation not found");
    }
    const expiresAt = toIso(row.expires_at) ?? new Date(0).toISOString();
    let status = row.status as InvitationPreviewStatus;
    if (status === "pending" && Date.parse(expiresAt) <= Date.now()) {
      status = "expired";
    }
    const inviter = {
      userId: "0",
      email: row.inviter_email ?? "",
      firstName: row.inviter_first_name,
      lastName: row.inviter_last_name,
    };
    return {
      status,
      email: row.email,
      workspaceName: row.workspace_name,
      inviterDisplayName: row.inviter_email ? displayName(inviter) : "",
      expiresAt,
    };
  }

  async acceptInvitation(
    rawToken: string,
    actorId: string,
  ): Promise<{ workspaceId: string; vaultId: string }> {
    const token = rawToken.trim();
    if (!token) {
      throw new WorkspaceMembersServiceError("NOT_FOUND", 404, "invitation not found");
    }
    const tokenHash = hashInviteToken(token);
    const run = async (tx: QueryExecutor) => {
      const invitationRows = await tx.query<{
        id: string;
        workspace_id: string;
        email: string;
        role_id: string;
        invited_by_user_id: string;
        status: string;
        expires_at: string | Date;
        accepted_user_id: string | null;
      }>(
        `
          SELECT id, workspace_id, email, role_id, invited_by_user_id, status, expires_at, accepted_user_id
          FROM workspace_invitations
          WHERE token_hash = $1
          LIMIT 1
          FOR UPDATE
        `,
        [tokenHash],
      );
      const invitation = invitationRows[0];
      if (!invitation) {
        throw new WorkspaceMembersServiceError("NOT_FOUND", 404, "invitation not found");
      }

      const actorRows = await tx.query<{ email: string }>(
        `SELECT email FROM users WHERE id = $1 LIMIT 1`,
        [actorId],
      );
      const actorEmail = actorRows[0]?.email;
      if (!actorEmail) {
        throw new WorkspaceMembersServiceError("ACCESS_DENIED", 403, "access denied");
      }
      if (normalizeEmail(actorEmail) !== normalizeEmail(invitation.email)) {
        throw new WorkspaceMembersServiceError(
          "INVITE_EMAIL_MISMATCH",
          403,
          "signed-in email does not match this invitation",
        );
      }

      if (invitation.status === "revoked") {
        throw new WorkspaceMembersServiceError("INVITE_REVOKED", 410, "invitation revoked");
      }
      const expiresAtMs = Date.parse(toIso(invitation.expires_at) ?? "");
      if (invitation.status === "expired" || (invitation.status === "pending" && expiresAtMs <= Date.now())) {
        if (invitation.status === "pending") {
          await tx.query(
            `UPDATE workspace_invitations SET status = 'expired' WHERE id = $1 AND status = 'pending'`,
            [invitation.id],
          );
        }
        throw new WorkspaceMembersServiceError("INVITE_EXPIRED", 410, "invitation expired");
      }
      if (invitation.status === "accepted") {
        if (invitation.accepted_user_id !== actorId) {
          throw new WorkspaceMembersServiceError("CONFLICT", 409, "invitation already accepted");
        }
        const vaultId = await this.ensurePersonalVault(tx, invitation.workspace_id, actorId);
        return { workspaceId: invitation.workspace_id, vaultId };
      }
      if (invitation.status !== "pending") {
        throw new WorkspaceMembersServiceError("BAD_REQUEST", 400, "invitation is not pending");
      }

      const alreadyMember = await tx.query<{ ok: boolean }>(
        `
          SELECT EXISTS (
            SELECT 1 FROM (
              SELECT 1 AS x FROM workspaces w
              WHERE w.id = $1 AND w.owner_id = $2
              UNION ALL
              SELECT 1 AS x FROM workspace_members wm
              WHERE wm.workspace_id = $1 AND wm.user_id = $2
            ) rows
          ) AS ok
        `,
        [invitation.workspace_id, actorId],
      );
      if (alreadyMember[0]?.ok) {
        throw new WorkspaceMembersServiceError("CONFLICT", 409, "user already a member");
      }

      // The pending invitation already occupies a seat. Reject only when occupied
      // seats are already over the cap (downgrade or a raced extra invite).
      const workspace = await this.requireWorkspace(invitation.workspace_id);
      await this.assertAdditionalMembersQuota(invitation.workspace_id, workspace, 0, tx);

      const memberId = generateEntityId();
      const nowIso = new Date().toISOString();
      await tx.query(
        `
          INSERT INTO workspace_members (
            id, workspace_id, user_id, role_id, invited_by_user_id, invited_at
          ) VALUES ($1, $2, $3, $4, $5, $6::timestamptz)
        `,
        [
          memberId,
          invitation.workspace_id,
          actorId,
          invitation.role_id,
          invitation.invited_by_user_id,
          nowIso,
        ],
      );

      const vaultId = await this.ensurePersonalVault(tx, invitation.workspace_id, actorId);

      await tx.query(
        `
          UPDATE workspace_invitations
          SET status = 'accepted', accepted_at = $2::timestamptz, accepted_user_id = $3
          WHERE id = $1 AND status = 'pending'
        `,
        [invitation.id, nowIso, actorId],
      );

      return { workspaceId: invitation.workspace_id, vaultId };
    };

    if (this.db.transaction) {
      return this.db.transaction(run);
    }
    return run(this.db);
  }

  async listPendingVaultWraps(
    workspaceId: string,
    actorId: string,
  ): Promise<ListPendingVaultWrapsResult> {
    await this.requireAccessibleWorkspace(workspaceId, actorId);
    await this.assertMembers(workspaceId, actorId, "get");
    const rows = await this.db.query<{
      user_id: string;
      vault_id: string;
      profile_id: string;
      public_key: string;
      public_pq_key: string | null;
    }>(
      `
        SELECT
          wi.accepted_user_id AS user_id,
          iva.vault_id,
          iva.profile_id,
          u.public_key,
          u.public_pq_key
        FROM workspace_invitation_vault_access iva
        JOIN workspace_invitations wi ON wi.id = iva.invitation_id
        JOIN users u ON u.id = wi.accepted_user_id
        JOIN workspace_members wm
          ON wm.workspace_id = wi.workspace_id
         AND wm.user_id = wi.accepted_user_id
        WHERE wi.workspace_id = $1
          AND wi.status = 'accepted'
          AND iva.profile_id IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM vault_keys vk
            WHERE vk.vault_id = iva.vault_id
              AND vk.user_id = wi.accepted_user_id
          )
        ORDER BY wi.accepted_at ASC, iva.vault_id ASC
      `,
      [workspaceId],
    );
    const wraps: PendingVaultWrap[] = [];
    const skippedInvalidKeyRecipients: PendingVaultWrapSkipped[] = [];
    for (const row of rows) {
      if (recipientPublicKeysAreValid(row.public_key, row.public_pq_key)) {
        wraps.push({
          userId: row.user_id,
          vaultId: row.vault_id,
          profileId: row.profile_id,
          publicKey: row.public_key,
          publicPqKey: row.public_pq_key,
        });
      } else {
        skippedInvalidKeyRecipients.push({
          userId: row.user_id,
          vaultId: row.vault_id,
          profileId: row.profile_id,
        });
      }
    }
    return { wraps, skippedInvalidKeyRecipients };
  }

  private async ensurePersonalVault(
    tx: QueryExecutor,
    workspaceId: string,
    userId: string,
  ): Promise<string> {
    const existing = await tx.query<{ id: string }>(
      `
        SELECT id FROM vaults
        WHERE workspace_id = $1 AND is_personal = true AND owner_id = $2
        LIMIT 1
      `,
      [workspaceId, userId],
    );
    if (existing[0]) {
      return existing[0].id;
    }
    const vaultId = generateEntityId();
    await tx.query(
      `
        INSERT INTO vaults (id, workspace_id, name, description, icon, is_personal, owner_id, crypto_version)
        VALUES ($1, $2, $3, $4, $5, true, $6, $7)
      `,
      [vaultId, workspaceId, DEFAULT_PERSONAL_VAULT_NAME, "", "", userId, DEFAULT_NEW_VAULT_CRYPTO_VERSION],
    );
    return vaultId;
  }

  /**
   * Invite create and member/invitation role + vault-access configuration.
   * Not used for revoke/remove: after downgrade those must stay allowed.
   */
  private assertAdditionalMembersConfigurable(workspace: WorkspacePlanEntitlementSource): void {
    if (!this.config) {
      throw new WorkspaceMembersServiceError(
        "PLAN_FEATURE_REQUIRED",
        403,
        "additional workspace members are not available on the current plan",
      );
    }
    if (workspaceHasPlanFeature(this.config, workspace, "additionalWorkspaceMembers")) {
      return;
    }
    throw new WorkspaceMembersServiceError(
      "PLAN_FEATURE_REQUIRED",
      403,
      "additional workspace members are not available on the current plan",
    );
  }

  /**
   * `maxAdditionalMembers` is seats beyond the owner, on every plan.
   * Occupied seats come from {@link countOccupiedAdditionalMemberSeats}.
   * `incomingSeats` is a batch not stored yet (invite create). Accept passes 0:
   * that pending invitation is already in the occupied count, and accepting it
   * swaps the invitation for a member.
   */

  /**
   * Built-in admin and user are assignable whenever additional members are enabled.
   * A custom row (builtin_key IS NULL) needs customWorkspaceRoles.
   * Owner is rejected by the caller before this check.
   */
  private assertAssignableWorkspaceRole(
    workspace: WorkspacePlanEntitlementSource,
    role: { builtinKey: string | null },
  ): void {
    if (role.builtinKey === "admin" || role.builtinKey === "user") {
      return;
    }
    if (
      role.builtinKey == null &&
      this.config &&
      workspaceHasPlanFeature(this.config, workspace, "customWorkspaceRoles")
    ) {
      return;
    }
    throw new WorkspaceMembersServiceError(
      "PLAN_FEATURE_REQUIRED",
      403,
      "custom workspace roles require a plan that includes them",
    );
  }

  /**
   * Built-in extended and simple are assignable whenever shared vault access is configurable.
   * A custom profile needs customWorkspaceProfiles.
   */
  private async assertAssignableWorkspaceProfile(
    workspace: WorkspacePlanEntitlementSource,
    workspaceId: string,
    profileId: string,
  ): Promise<void> {
    const rows = await this.db.query<{ id: string; builtin_key: string | null }>(
      `
        SELECT id, builtin_key FROM profiles
        WHERE id = $1 AND workspace_id = $2
        LIMIT 1
      `,
      [profileId, workspaceId],
    );
    const row = rows[0];
    if (!row) {
      throw new WorkspaceMembersServiceError("BAD_REQUEST", 400, "profile not found");
    }
    if (row.builtin_key === "extended" || row.builtin_key === "simple") {
      return;
    }
    if (
      this.config &&
      workspaceHasPlanFeature(this.config, workspace, "customWorkspaceProfiles")
    ) {
      return;
    }
    throw new WorkspaceMembersServiceError(
      "PLAN_FEATURE_REQUIRED",
      403,
      "custom workspace profiles require a plan that includes them",
    );
  }

  private async assertAdditionalMembersQuota(
    workspaceId: string,
    workspace: WorkspacePlanEntitlementSource,
    incomingSeats: number,
    db: QueryExecutor = this.db,
  ): Promise<void> {
    if (!this.config) {
      throw new WorkspaceMembersServiceError(
        "PLAN_FEATURE_REQUIRED",
        403,
        "additional workspace members are not available on the current plan",
      );
    }
    const { maxAdditionalMembers } = workspaceGetPlanQuotaLimits(this.config, workspace);
    if (maxAdditionalMembers === null) {
      return;
    }
    const used = await countOccupiedAdditionalMemberSeats(db, workspaceId);
    if (used + incomingSeats > maxAdditionalMembers) {
      throw new WorkspaceMembersServiceError(
        "PLAN_QUOTA_EXCEEDED",
        403,
        "additional workspace member quota exceeded",
      );
    }
  }

  private async assertRecipientPublicKeysValid(userId: string): Promise<void> {
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
      throw new WorkspaceMembersServiceError(
        "CRYPTO_PAYLOAD_INVALID",
        400,
        "recipient public key is invalid",
      );
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

  private async assertMembersOnObject(
    workspaceId: string,
    actorId: string,
    action: "get" | "put" | "delete",
    isOwn: boolean,
  ): Promise<WorkspacePermissionsMatrix> {
    try {
      return await assertWorkspacePermissionOnObject(
        this.db,
        workspaceId,
        actorId,
        "members",
        action,
        isOwn,
      );
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

  private async requireActiveMember(
    workspaceId: string,
    userId: string,
  ): Promise<{ invitedByUserId: string | null }> {
    const workspace = await this.requireWorkspace(workspaceId);
    if (workspace.ownerId === userId) {
      return { invitedByUserId: null };
    }
    const rows = await this.db.query<{ id: string; invited_by_user_id: string | null }>(
      `
        SELECT id, invited_by_user_id FROM workspace_members
        WHERE workspace_id = $1 AND user_id = $2
        LIMIT 1
      `,
      [workspaceId, userId],
    );
    if (!rows[0]) {
      throw new WorkspaceMembersServiceError("NOT_FOUND", 404, "member not found");
    }
    return { invitedByUserId: rows[0].invited_by_user_id };
  }

  private async requirePendingInvitation(
    workspaceId: string,
    invitationId: string,
  ): Promise<{ invitedByUserId: string }> {
    if (!isEntityId(invitationId)) {
      throw new WorkspaceMembersServiceError("BAD_REQUEST", 400, "invalid invitationId");
    }
    const rows = await this.db.query<{ id: string; status: string; invited_by_user_id: string }>(
      `
        SELECT id, status, invited_by_user_id FROM workspace_invitations
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
    return { invitedByUserId: row.invited_by_user_id };
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

  /** Saved `users.locale` for an existing account, or null when unknown / unset. */
  private async loadUserLocaleByEmail(email: string): Promise<string | null> {
    const rows = await this.db.query<{ locale: string | null }>(
      `SELECT locale FROM users WHERE lower(email) = $1 LIMIT 1`,
      [email],
    );
    const locale = rows[0]?.locale;
    if (typeof locale !== "string" || !locale.trim()) {
      return null;
    }
    return locale;
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
          u.last_vault_unlocked_at AS last_login_at
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
      role_changed_at: string | Date | null;
      role_changed_by_user_id: string | null;
      role_changed_by_email: string | null;
      role_changed_by_first_name: string | null;
      role_changed_by_last_name: string | null;
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
          u.last_name AS invited_by_last_name,
          wi.role_changed_at,
          wi.role_changed_by_user_id,
          rb.email AS role_changed_by_email,
          rb.first_name AS role_changed_by_first_name,
          rb.last_name AS role_changed_by_last_name
        FROM workspace_invitations wi
        JOIN roles r ON r.id = wi.role_id
        JOIN users u ON u.id = wi.invited_by_user_id
        LEFT JOIN users rb ON rb.id = wi.role_changed_by_user_id
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
      roleChangedAt: toIso(row.role_changed_at),
      roleChangedBy: actorFromRow({
        user_id: row.role_changed_by_user_id,
        email: row.role_changed_by_email,
        first_name: row.role_changed_by_first_name,
        last_name: row.role_changed_by_last_name,
      }),
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
