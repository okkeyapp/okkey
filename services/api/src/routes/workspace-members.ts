import type { IncomingMessage } from "node:http";

import { isEntityId } from "../entity-id.ts";
import { json, readJsonBody, type RouteHandler } from "../http.ts";
import {
  enforceInvitePreviewRateLimit,
  type InvitePreviewRateLimit,
} from "../workspace-members/invite-preview-rate-limit.ts";
import { asVaultSharingServiceError } from "../workspace-shared-vaults/vault-sharing-error.ts";
import { parseWorkspaceKeyWrap, WorkspaceKeyRotationError } from "../workspace-key/removal.ts";
import { WorkspaceKeyServiceError } from "../workspace-key/service.ts";
import {
  WorkspaceMembersService,
  WorkspaceMembersServiceError,
} from "../workspace-members/service.ts";

type ResolveUserId = (req: IncomingMessage) => Promise<string | null>;

function errorPayload(
  code: string,
  message: string,
  requestId: string,
  details?: Record<string, unknown>,
) {
  return {
    error: code,
    message,
    requestId,
    ...(details ? { details } : {}),
  };
}

function handleMembersError(
  requestId: string,
  res: Parameters<typeof json>[0],
  error: unknown,
): void {
  if (
    error instanceof WorkspaceMembersServiceError ||
    error instanceof WorkspaceKeyServiceError ||
    error instanceof WorkspaceKeyRotationError
  ) {
    json(res, error.statusCode, errorPayload(error.code, error.message, requestId));
    return;
  }
  const sharing = asVaultSharingServiceError(error);
  if (sharing) {
    json(
      res,
      sharing.statusCode,
      errorPayload(sharing.code, sharing.message, requestId, sharing.details),
    );
    return;
  }
  console.error("[workspace-members] unexpected error", requestId, error);
  json(res, 500, errorPayload("INTERNAL_SERVER_ERROR", "internal server error", requestId));
}

export function createWorkspaceMembersListRoute(
  membersService: WorkspaceMembersService,
  resolveUserId: ResolveUserId,
): RouteHandler {
  return async (ctx) => {
    const workspaceId = ctx.params.workspaceId;
    if (!workspaceId) {
      json(ctx.res, 400, errorPayload("BAD_REQUEST", "workspaceId is required", ctx.requestId));
      return;
    }
    try {
      const userId = await resolveUserId(ctx.req);
      if (!userId) {
        json(ctx.res, 401, errorPayload("AUTH_REQUIRED", "auth required", ctx.requestId));
        return;
      }
      const result = await membersService.listMembers(workspaceId, userId);
      json(ctx.res, 200, {
        workspaceId,
        members: result.members,
        actorPermissions: result.actorPermissions,
      });
    } catch (error) {
      handleMembersError(ctx.requestId, ctx.res, error);
    }
  };
}

export function createWorkspaceMemberDirectoryRoute(
  membersService: WorkspaceMembersService,
  resolveUserId: ResolveUserId,
): RouteHandler {
  return async (ctx) => {
    const workspaceId = ctx.params.workspaceId;
    if (!workspaceId) {
      json(ctx.res, 400, errorPayload("BAD_REQUEST", "workspaceId is required", ctx.requestId));
      return;
    }
    try {
      const userId = await resolveUserId(ctx.req);
      if (!userId) {
        json(ctx.res, 401, errorPayload("AUTH_REQUIRED", "auth required", ctx.requestId));
        return;
      }
      const members = await membersService.listMemberDirectory(workspaceId, userId);
      json(ctx.res, 200, { workspaceId, members });
    } catch (error) {
      handleMembersError(ctx.requestId, ctx.res, error);
    }
  };
}

export function createWorkspaceInvitationsCreateRoute(
  membersService: WorkspaceMembersService,
  resolveUserId: ResolveUserId,
): RouteHandler {
  return async (ctx) => {
    const workspaceId = ctx.params.workspaceId?.trim() ?? "";
    if (!workspaceId) {
      json(ctx.res, 400, errorPayload("BAD_REQUEST", "workspaceId is required", ctx.requestId));
      return;
    }
    // Same gate as Core HttpApp entity-id path validation (okkey#197 / isEntityId).
    if (!isEntityId(workspaceId)) {
      json(
        ctx.res,
        400,
        errorPayload("INVALID_WORKSPACE_ID", "workspaceId must be a snowflake entity id", ctx.requestId),
      );
      return;
    }
    try {
      const userId = await resolveUserId(ctx.req);
      if (!userId) {
        json(ctx.res, 401, errorPayload("AUTH_REQUIRED", "auth required", ctx.requestId));
        return;
      }
      // Authorize before body validation so foreign workspaces cannot be probed via 400s.
      await membersService.ensureWorkspaceAccess(workspaceId, userId);

      let body: unknown;
      try {
        body = await readJsonBody<unknown>(ctx.req);
      } catch {
        json(ctx.res, 400, errorPayload("BAD_REQUEST", "invalid JSON body", ctx.requestId));
        return;
      }
      if (!body || typeof body !== "object" || Array.isArray(body)) {
        json(ctx.res, 400, errorPayload("BAD_REQUEST", "body must be an object", ctx.requestId));
        return;
      }
      const record = body as Record<string, unknown>;
      const raw = Array.isArray(record.invitations) ? record.invitations : [];
      const invitations = raw.map((entry) => {
        const row = (entry ?? {}) as Record<string, unknown>;
        return {
          email: String(row.email ?? ""),
          roleId: String(row.roleId ?? ""),
        };
      });
      const created = await membersService.createInvitations(workspaceId, userId, invitations, {
        acceptLanguage: typeof ctx.req.headers["accept-language"] === "string"
          ? ctx.req.headers["accept-language"]
          : undefined,
      });
      json(ctx.res, 200, { workspaceId, created });
    } catch (error) {
      handleMembersError(ctx.requestId, ctx.res, error);
    }
  };
}

export function createWorkspaceInvitationDeleteRoute(
  membersService: WorkspaceMembersService,
  resolveUserId: ResolveUserId,
): RouteHandler {
  return async (ctx) => {
    const workspaceId = ctx.params.workspaceId;
    const invitationId = ctx.params.invitationId;
    if (!workspaceId || !invitationId) {
      json(ctx.res, 400, errorPayload("BAD_REQUEST", "workspaceId and invitationId are required", ctx.requestId));
      return;
    }
    try {
      const userId = await resolveUserId(ctx.req);
      if (!userId) {
        json(ctx.res, 401, errorPayload("AUTH_REQUIRED", "auth required", ctx.requestId));
        return;
      }
      await membersService.revokeInvitation(workspaceId, userId, invitationId);
      json(ctx.res, 200, { revoked: true });
    } catch (error) {
      handleMembersError(ctx.requestId, ctx.res, error);
    }
  };
}

export function createWorkspaceInvitationPatchRoute(
  membersService: WorkspaceMembersService,
  resolveUserId: ResolveUserId,
): RouteHandler {
  return async (ctx) => {
    const workspaceId = ctx.params.workspaceId;
    const invitationId = ctx.params.invitationId;
    if (!workspaceId || !invitationId) {
      json(ctx.res, 400, errorPayload("BAD_REQUEST", "workspaceId and invitationId are required", ctx.requestId));
      return;
    }
    try {
      const userId = await resolveUserId(ctx.req);
      if (!userId) {
        json(ctx.res, 401, errorPayload("AUTH_REQUIRED", "auth required", ctx.requestId));
        return;
      }
      const body = await readJsonBody<Record<string, unknown>>(ctx.req);
      const roleId = typeof body.roleId === "string" ? body.roleId : "";
      await membersService.updateInvitationRole(workspaceId, userId, invitationId, roleId);
      json(ctx.res, 200, { updated: true });
    } catch (error) {
      handleMembersError(ctx.requestId, ctx.res, error);
    }
  };
}

export function createInvitationVaultAccessGetRoute(
  membersService: WorkspaceMembersService,
  resolveUserId: ResolveUserId,
): RouteHandler {
  return async (ctx) => {
    const workspaceId = ctx.params.workspaceId;
    const invitationId = ctx.params.invitationId;
    if (!workspaceId || !invitationId) {
      json(ctx.res, 400, errorPayload("BAD_REQUEST", "workspaceId and invitationId are required", ctx.requestId));
      return;
    }
    try {
      const userId = await resolveUserId(ctx.req);
      if (!userId) {
        json(ctx.res, 401, errorPayload("AUTH_REQUIRED", "auth required", ctx.requestId));
        return;
      }
      const vaults = await membersService.getInvitationVaultAccess(workspaceId, userId, invitationId);
      json(ctx.res, 200, { workspaceId, invitationId, vaults });
    } catch (error) {
      handleMembersError(ctx.requestId, ctx.res, error);
    }
  };
}

export function createInvitationVaultAccessPutRoute(
  membersService: WorkspaceMembersService,
  resolveUserId: ResolveUserId,
): RouteHandler {
  return async (ctx) => {
    const workspaceId = ctx.params.workspaceId;
    const invitationId = ctx.params.invitationId;
    if (!workspaceId || !invitationId) {
      json(ctx.res, 400, errorPayload("BAD_REQUEST", "workspaceId and invitationId are required", ctx.requestId));
      return;
    }
    try {
      const userId = await resolveUserId(ctx.req);
      if (!userId) {
        json(ctx.res, 401, errorPayload("AUTH_REQUIRED", "auth required", ctx.requestId));
        return;
      }
      const body = await readJsonBody<Record<string, unknown>>(ctx.req);
      const raw = Array.isArray(body.changes) ? body.changes : [];
      const changes = raw.map((entry) => {
        const row = (entry ?? {}) as Record<string, unknown>;
        return {
          vaultId: String(row.vaultId ?? ""),
          profileId: row.profileId == null ? null : String(row.profileId),
        };
      });
      await membersService.updateInvitationVaultAccess(workspaceId, userId, invitationId, changes);
      json(ctx.res, 200, { updated: true });
    } catch (error) {
      handleMembersError(ctx.requestId, ctx.res, error);
    }
  };
}

export function createWorkspaceMemberPatchRoute(
  membersService: WorkspaceMembersService,
  resolveUserId: ResolveUserId,
): RouteHandler {
  return async (ctx) => {
    const workspaceId = ctx.params.workspaceId;
    const targetUserId = ctx.params.userId;
    if (!workspaceId || !targetUserId) {
      json(ctx.res, 400, errorPayload("BAD_REQUEST", "workspaceId and userId are required", ctx.requestId));
      return;
    }
    try {
      const userId = await resolveUserId(ctx.req);
      if (!userId) {
        json(ctx.res, 401, errorPayload("AUTH_REQUIRED", "auth required", ctx.requestId));
        return;
      }
      const body = await readJsonBody<Record<string, unknown>>(ctx.req);
      const roleId = typeof body.roleId === "string" ? body.roleId : "";
      await membersService.updateMemberRole(workspaceId, userId, targetUserId, roleId);
      json(ctx.res, 200, { updated: true });
    } catch (error) {
      handleMembersError(ctx.requestId, ctx.res, error);
    }
  };
}

export function createWorkspaceMemberDeleteRoute(
  membersService: WorkspaceMembersService,
  resolveUserId: ResolveUserId,
): RouteHandler {
  return async (ctx) => {
    const workspaceId = ctx.params.workspaceId;
    const targetUserId = ctx.params.userId;
    if (!workspaceId || !targetUserId) {
      json(ctx.res, 400, errorPayload("BAD_REQUEST", "workspaceId and userId are required", ctx.requestId));
      return;
    }
    try {
      const userId = await resolveUserId(ctx.req);
      if (!userId) {
        json(ctx.res, 401, errorPayload("AUTH_REQUIRED", "auth required", ctx.requestId));
        return;
      }
      let body: { workspace_key_rotation?: { wraps?: unknown } };
      try {
        body = await readJsonBody<{ workspace_key_rotation?: { wraps?: unknown } }>(ctx.req);
      } catch {
        json(ctx.res, 400, errorPayload("BAD_REQUEST", "invalid json body", ctx.requestId));
        return;
      }
      const wraps = body.workspace_key_rotation?.wraps;
      const rotation = Array.isArray(wraps)
        ? { wraps: wraps.map((wrap) => parseWorkspaceKeyWrap(wrap)) }
        : null;
      await membersService.removeMember(workspaceId, userId, targetUserId, rotation);
      json(ctx.res, 200, { deleted: true });
    } catch (error) {
      handleMembersError(ctx.requestId, ctx.res, error);
    }
  };
}

export function createWorkspaceKeyPendingRecipientsRoute(
  membersService: WorkspaceMembersService,
  resolveUserId: ResolveUserId,
): RouteHandler {
  return async (ctx) => {
    const workspaceId = ctx.params.workspaceId;
    if (!workspaceId) {
      json(ctx.res, 400, errorPayload("BAD_REQUEST", "workspaceId is required", ctx.requestId));
      return;
    }
    try {
      const userId = await resolveUserId(ctx.req);
      if (!userId) {
        json(ctx.res, 401, errorPayload("AUTH_REQUIRED", "auth required", ctx.requestId));
        return;
      }
      const userIds = await membersService.listPendingWorkspaceKeyRecipients(workspaceId, userId);
      json(ctx.res, 200, { user_ids: userIds });
    } catch (error) {
      handleMembersError(ctx.requestId, ctx.res, error);
    }
  };
}

export function createWorkspaceKeyPendingRotationsRoute(
  membersService: WorkspaceMembersService,
  resolveUserId: ResolveUserId,
): RouteHandler {
  return async (ctx) => {
    const workspaceId = ctx.params.workspaceId;
    if (!workspaceId) {
      json(ctx.res, 400, errorPayload("BAD_REQUEST", "workspaceId is required", ctx.requestId));
      return;
    }
    try {
      const userId = await resolveUserId(ctx.req);
      if (!userId) {
        json(ctx.res, 401, errorPayload("AUTH_REQUIRED", "auth required", ctx.requestId));
        return;
      }
      const removedUserIds = await membersService.listPendingWorkspaceKeyRotations(workspaceId, userId);
      json(ctx.res, 200, { removed_user_ids: removedUserIds });
    } catch (error) {
      handleMembersError(ctx.requestId, ctx.res, error);
    }
  };
}

export function createWorkspaceKeyDeferredRotationRoute(
  membersService: WorkspaceMembersService,
  resolveUserId: ResolveUserId,
): RouteHandler {
  return async (ctx) => {
    const workspaceId = ctx.params.workspaceId;
    if (!workspaceId) {
      json(ctx.res, 400, errorPayload("BAD_REQUEST", "workspaceId is required", ctx.requestId));
      return;
    }
    try {
      const userId = await resolveUserId(ctx.req);
      if (!userId) {
        json(ctx.res, 401, errorPayload("AUTH_REQUIRED", "auth required", ctx.requestId));
        return;
      }
      const body = await readJsonBody<{ wraps?: unknown }>(ctx.req);
      if (!Array.isArray(body.wraps)) {
        json(ctx.res, 400, errorPayload("BAD_REQUEST", "wraps are required", ctx.requestId));
        return;
      }
      const wraps = body.wraps.map((wrap) => parseWorkspaceKeyWrap(wrap));
      const result = await membersService.applyDeferredWorkspaceKeyRotation(workspaceId, userId, wraps);
      json(ctx.res, 200, { current_version: result?.nextVersion ?? null });
    } catch (error) {
      handleMembersError(ctx.requestId, ctx.res, error);
    }
  };
}

export function createMemberVaultAccessGetRoute(
  membersService: WorkspaceMembersService,
  resolveUserId: ResolveUserId,
): RouteHandler {
  return async (ctx) => {
    const workspaceId = ctx.params.workspaceId;
    const targetUserId = ctx.params.userId;
    if (!workspaceId || !targetUserId) {
      json(ctx.res, 400, errorPayload("BAD_REQUEST", "workspaceId and userId are required", ctx.requestId));
      return;
    }
    try {
      const userId = await resolveUserId(ctx.req);
      if (!userId) {
        json(ctx.res, 401, errorPayload("AUTH_REQUIRED", "auth required", ctx.requestId));
        return;
      }
      const vaults = await membersService.getMemberVaultAccess(workspaceId, userId, targetUserId);
      json(ctx.res, 200, { workspaceId, userId: targetUserId, vaults });
    } catch (error) {
      handleMembersError(ctx.requestId, ctx.res, error);
    }
  };
}

export function createMemberVaultAccessPutRoute(
  membersService: WorkspaceMembersService,
  resolveUserId: ResolveUserId,
): RouteHandler {
  return async (ctx) => {
    const workspaceId = ctx.params.workspaceId;
    const targetUserId = ctx.params.userId;
    if (!workspaceId || !targetUserId) {
      json(ctx.res, 400, errorPayload("BAD_REQUEST", "workspaceId and userId are required", ctx.requestId));
      return;
    }
    try {
      const userId = await resolveUserId(ctx.req);
      if (!userId) {
        json(ctx.res, 401, errorPayload("AUTH_REQUIRED", "auth required", ctx.requestId));
        return;
      }
      const body = await readJsonBody<Record<string, unknown>>(ctx.req);
      const raw = Array.isArray(body.changes) ? body.changes : [];
      const changes = raw.map((entry) => {
        const row = (entry ?? {}) as Record<string, unknown>;
        const rotatedRaw = Array.isArray(row.rotatedVaultKeys) ? row.rotatedVaultKeys : undefined;
        return {
          vaultId: String(row.vaultId ?? ""),
          profileId: row.profileId == null ? null : String(row.profileId),
          encryptedVaultKey: row.encryptedVaultKey,
          rotatedVaultKeys: rotatedRaw?.map((item) => {
            const r = (item ?? {}) as Record<string, unknown>;
            return {
              userId: String(r.userId ?? ""),
              encryptedVaultKey: r.encryptedVaultKey,
            };
          }),
          encryptedPayload: row.encryptedPayload,
          signature: row.signature,
          baseVersion: typeof row.baseVersion === "number" ? row.baseVersion : undefined,
          idempotencyKey: typeof row.idempotencyKey === "string" ? row.idempotencyKey : undefined,
          clientCreatedAt: typeof row.clientCreatedAt === "string" ? row.clientCreatedAt : undefined,
        };
      });
      await membersService.updateMemberVaultAccess(workspaceId, userId, targetUserId, changes);
      json(ctx.res, 200, { updated: true });
    } catch (error) {
      handleMembersError(ctx.requestId, ctx.res, error);
    }
  };
}

export function createInvitationPreviewRoute(
  membersService: WorkspaceMembersService,
  rateLimit?: InvitePreviewRateLimit,
): RouteHandler {
  return async (ctx) => {
    const token = ctx.params.token;
    if (!token) {
      json(ctx.res, 400, errorPayload("BAD_REQUEST", "token is required", ctx.requestId));
      return;
    }
    try {
      if (rateLimit) {
        const result = await enforceInvitePreviewRateLimit(ctx.req, rateLimit);
        if (result.status === "limited") {
          json(
            ctx.res,
            429,
            errorPayload("AUTH_RATE_LIMITED", "rate limited", ctx.requestId, {
              retryAfterSeconds: result.retryAfterSeconds,
            }),
          );
          return;
        }
      }
      const preview = await membersService.previewInvitation(token);
      json(ctx.res, 200, preview);
    } catch (error) {
      handleMembersError(ctx.requestId, ctx.res, error);
    }
  };
}

export function createInvitationAcceptRoute(
  membersService: WorkspaceMembersService,
  resolveUserId: ResolveUserId,
): RouteHandler {
  return async (ctx) => {
    const token = ctx.params.token;
    if (!token) {
      json(ctx.res, 400, errorPayload("BAD_REQUEST", "token is required", ctx.requestId));
      return;
    }
    try {
      const userId = await resolveUserId(ctx.req);
      if (!userId) {
        json(ctx.res, 401, errorPayload("AUTH_REQUIRED", "auth required", ctx.requestId));
        return;
      }
      const accepted = await membersService.acceptInvitation(token, userId);
      json(ctx.res, 200, accepted);
    } catch (error) {
      handleMembersError(ctx.requestId, ctx.res, error);
    }
  };
}

export function createPendingVaultWrapsGetRoute(
  membersService: WorkspaceMembersService,
  resolveUserId: ResolveUserId,
): RouteHandler {
  return async (ctx) => {
    const workspaceId = ctx.params.workspaceId;
    if (!workspaceId) {
      json(ctx.res, 400, errorPayload("BAD_REQUEST", "workspaceId is required", ctx.requestId));
      return;
    }
    try {
      const userId = await resolveUserId(ctx.req);
      if (!userId) {
        json(ctx.res, 401, errorPayload("AUTH_REQUIRED", "auth required", ctx.requestId));
        return;
      }
      const { wraps, skippedInvalidKeyRecipients } = await membersService.listPendingVaultWraps(
        workspaceId,
        userId,
      );
      json(ctx.res, 200, { workspaceId, wraps, skippedInvalidKeyRecipients });
    } catch (error) {
      handleMembersError(ctx.requestId, ctx.res, error);
    }
  };
}
