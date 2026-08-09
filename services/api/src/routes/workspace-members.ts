import type { IncomingMessage } from "node:http";

import { json, readJsonBody, type RouteHandler } from "../http.ts";
import {
  WorkspaceMembersService,
  WorkspaceMembersServiceError,
} from "../workspace-members/service.ts";

type ResolveUserId = (req: IncomingMessage) => Promise<string | null>;

function errorPayload(code: string, message: string, requestId: string) {
  return { error: code, message, requestId };
}

function handleMembersError(
  requestId: string,
  res: Parameters<typeof json>[0],
  error: unknown,
): void {
  if (error instanceof WorkspaceMembersServiceError) {
    json(res, error.statusCode, errorPayload(error.code, error.message, requestId));
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

export function createWorkspaceInvitationsCreateRoute(
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
      const body = await readJsonBody<Record<string, unknown>>(ctx.req);
      const raw = Array.isArray(body.invitations) ? body.invitations : [];
      const invitations = raw.map((entry) => {
        const row = (entry ?? {}) as Record<string, unknown>;
        return {
          email: String(row.email ?? ""),
          roleId: String(row.roleId ?? ""),
        };
      });
      const created = await membersService.createInvitations(workspaceId, userId, invitations);
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
      await membersService.removeMember(workspaceId, userId, targetUserId);
      json(ctx.res, 200, { deleted: true });
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
