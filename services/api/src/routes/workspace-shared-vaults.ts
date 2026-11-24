import type { IncomingMessage } from "node:http";
import { json, readJsonBody, type RouteHandler } from "../http.ts";
import { asVaultSharingServiceError } from "../workspace-shared-vaults/vault-sharing-error.ts";
import {
  VaultSharingService,
  VaultSharingServiceError,
} from "../vault-sharing/service.ts";
import {
  WorkspaceSharedVaultsService,
  WorkspaceSharedVaultsServiceError,
} from "../workspace-shared-vaults/service.ts";

export function createWorkspaceVaultCreateRoute(
  vaultService: WorkspaceSharedVaultsService,
  resolveUserId: (req: IncomingMessage) => Promise<string | null>,
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
      const membersRaw = Array.isArray(body.members) ? body.members : null;
      if (!membersRaw) {
        json(ctx.res, 400, errorPayload("BAD_REQUEST", "members is required", ctx.requestId));
        return;
      }
      const vault = await vaultService.createSharedVault(workspaceId, userId, {
        name: String(body.name ?? ""),
        description: typeof body.description === "string" ? body.description : undefined,
        icon: typeof body.icon === "string" ? body.icon : undefined,
        encryptedPayload: body.encryptedPayload,
        signature: body.signature,
        baseVersion: typeof body.baseVersion === "number" ? body.baseVersion : 0,
        idempotencyKey: typeof body.idempotencyKey === "string" ? body.idempotencyKey : undefined,
        clientCreatedAt: typeof body.clientCreatedAt === "string" ? body.clientCreatedAt : undefined,
        members: membersRaw.map((entry) => {
          const row = (entry ?? {}) as Record<string, unknown>;
          return {
            userId: String(row.userId ?? ""),
            profileId: String(row.profileId ?? ""),
            encryptedVaultKey: row.encryptedVaultKey,
            role: typeof row.role === "string" ? row.role : undefined,
          };
        }),
      });
      json(ctx.res, 201, vault);
    } catch (error) {
      handleVaultError(ctx.requestId, ctx.res, error);
    }
  };
}

export function createVaultDeleteRoute(
  vaultService: WorkspaceSharedVaultsService,
  resolveUserId: (req: IncomingMessage) => Promise<string | null>,
): RouteHandler {
  return async (ctx) => {
    const vaultId = ctx.params.vaultId;
    if (!vaultId) {
      json(ctx.res, 400, errorPayload("BAD_REQUEST", "vaultId is required", ctx.requestId));
      return;
    }

    try {
      const userId = await resolveUserId(ctx.req);
      if (!userId) {
        json(ctx.res, 401, errorPayload("AUTH_REQUIRED", "auth required", ctx.requestId));
        return;
      }
      await vaultService.deleteVault(vaultId, userId);
      json(ctx.res, 200, { deleted: true });
    } catch (error) {
      handleVaultError(ctx.requestId, ctx.res, error);
    }
  };
}

export function createVaultAccessGetRoute(
  vaultService: WorkspaceSharedVaultsService,
  resolveUserId: (req: IncomingMessage) => Promise<string | null>,
): RouteHandler {
  return async (ctx) => {
    const vaultId = ctx.params.vaultId;
    if (!vaultId) {
      json(ctx.res, 400, errorPayload("BAD_REQUEST", "vaultId is required", ctx.requestId));
      return;
    }

    try {
      const userId = await resolveUserId(ctx.req);
      if (!userId) {
        json(ctx.res, 401, errorPayload("AUTH_REQUIRED", "auth required", ctx.requestId));
        return;
      }
      const access = await vaultService.getVaultAccess(vaultId, userId);
      json(ctx.res, 200, {
        vaultId,
        members: access.members,
        invitations: access.invitations,
        latestVersion: access.latestVersion,
      });
    } catch (error) {
      handleVaultError(ctx.requestId, ctx.res, error);
    }
  };
}

export function createVaultAccessUpdateRoute(
  vaultService: WorkspaceSharedVaultsService,
  resolveUserId: (req: IncomingMessage) => Promise<string | null>,
): RouteHandler {
  return async (ctx) => {
    const vaultId = ctx.params.vaultId;
    if (!vaultId) {
      json(ctx.res, 400, errorPayload("BAD_REQUEST", "vaultId is required", ctx.requestId));
      return;
    }

    try {
      const userId = await resolveUserId(ctx.req);
      if (!userId) {
        json(ctx.res, 401, errorPayload("AUTH_REQUIRED", "auth required", ctx.requestId));
        return;
      }
      const body = await readJsonBody<Record<string, unknown>>(ctx.req);
      const grantsRaw = Array.isArray(body.grants) ? body.grants : [];
      const profileUpdatesRaw = Array.isArray(body.profileUpdates) ? body.profileUpdates : [];
      const revokesRaw = Array.isArray(body.revokes) ? body.revokes : [];
      const invitationUpdatesRaw = Array.isArray(body.invitationUpdates)
        ? body.invitationUpdates
        : [];
      const rotatedRaw = Array.isArray(body.rotatedVaultKeys) ? body.rotatedVaultKeys : undefined;

      await vaultService.updateVaultAccess(vaultId, userId, {
        grants: grantsRaw.map((entry) => {
          const row = (entry ?? {}) as Record<string, unknown>;
          return {
            userId: String(row.userId ?? ""),
            profileId: String(row.profileId ?? ""),
            encryptedVaultKey: row.encryptedVaultKey,
            role: typeof row.role === "string" ? row.role : undefined,
          };
        }),
        profileUpdates: profileUpdatesRaw.map((entry) => {
          const row = (entry ?? {}) as Record<string, unknown>;
          return {
            userId: String(row.userId ?? ""),
            profileId: String(row.profileId ?? ""),
          };
        }),
        revokes: revokesRaw.map((entry) => {
          const row = (entry ?? {}) as Record<string, unknown>;
          return { userId: String(row.userId ?? "") };
        }),
        invitationUpdates: invitationUpdatesRaw.map((entry) => {
          const row = (entry ?? {}) as Record<string, unknown>;
          return {
            invitationId: String(row.invitationId ?? ""),
            profileId: row.profileId == null ? null : String(row.profileId),
          };
        }),
        rotatedVaultKeys: rotatedRaw?.map((entry) => {
          const row = (entry ?? {}) as Record<string, unknown>;
          return {
            userId: String(row.userId ?? ""),
            encryptedVaultKey: row.encryptedVaultKey,
          };
        }),
        encryptedPayload: body.encryptedPayload,
        signature: body.signature,
        baseVersion: typeof body.baseVersion === "number" ? body.baseVersion : 0,
        idempotencyKey: typeof body.idempotencyKey === "string" ? body.idempotencyKey : undefined,
        clientCreatedAt: typeof body.clientCreatedAt === "string" ? body.clientCreatedAt : undefined,
      });
      json(ctx.res, 200, { updated: true });
    } catch (error) {
      handleVaultError(ctx.requestId, ctx.res, error);
    }
  };
}

function handleVaultError(
  requestId: string,
  res: Parameters<typeof json>[0],
  error: unknown,
): void {
  if (error instanceof WorkspaceSharedVaultsServiceError) {
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

  console.error("[vault] unexpected error", requestId, error);
  json(res, 500, errorPayload("INTERNAL_SERVER_ERROR", "internal server error", requestId));
}

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



interface ShareVaultBody {
  recipientUserId?: string;
  encryptedVaultKey?: unknown;
  encryptedPayload?: unknown;
  signature?: unknown;
  baseVersion?: number;
  idempotencyKey?: string;
  clientCreatedAt?: string;
  role?: string;
}

interface RevokeVaultBody {
  recipientUserId?: string;
  rotatedVaultKeys?: Array<{ userId?: string; encryptedVaultKey?: unknown }>;
  encryptedPayload?: unknown;
  signature?: unknown;
  baseVersion?: number;
  idempotencyKey?: string;
  clientCreatedAt?: string;
}

interface RotateVaultKeyBody {
  rotatedVaultKeys?: Array<{ userId?: string; encryptedVaultKey?: unknown }>;
  encryptedPayload?: unknown;
  signature?: unknown;
  baseVersion?: number;
  idempotencyKey?: string;
  clientCreatedAt?: string;
  reason?: string;
}

interface UpdateVaultMemberRoleBody {
  newRole?: string;
  rotatedVaultKeys?: Array<{ userId?: string; encryptedVaultKey?: unknown }>;
  encryptedPayload?: unknown;
  signature?: unknown;
  baseVersion?: number;
  idempotencyKey?: string;
  clientCreatedAt?: string;
}

export function createVaultSharesListRoute(
  sharingService: VaultSharingService,
  resolveUserId: (req: IncomingMessage) => Promise<string | null>,
): RouteHandler {
  return async (ctx) => {
    const vaultId = ctx.params.vaultId;
    if (!vaultId) {
      json(ctx.res, 400, errorPayload("BAD_REQUEST", "vaultId is required", ctx.requestId));
      return;
    }
    try {
      const userId = await resolveUserId(ctx.req);
      if (!userId) {
        json(ctx.res, 401, errorPayload("AUTH_REQUIRED", "auth required", ctx.requestId));
        return;
      }
      const payload = await sharingService.listVaultShares(vaultId, userId);
      json(ctx.res, 200, { vaultId, members: payload });
    } catch (error) {
      handleSharingError(ctx.requestId, ctx.res, error);
    }
  };
}

export function createVaultShareUpsertRoute(
  sharingService: VaultSharingService,
  resolveUserId: (req: IncomingMessage) => Promise<string | null>,
): RouteHandler {
  return async (ctx) => {
    const vaultId = ctx.params.vaultId;
    if (!vaultId) {
      json(ctx.res, 400, errorPayload("BAD_REQUEST", "vaultId is required", ctx.requestId));
      return;
    }

    let body: ShareVaultBody;
    try {
      body = await readJsonBody<ShareVaultBody>(ctx.req);
    } catch {
      json(ctx.res, 400, errorPayload("VAULT_SHARE_BAD_REQUEST", "invalid json", ctx.requestId));
      return;
    }
    if (
      !body.recipientUserId ||
      !body.encryptedVaultKey ||
      !body.encryptedPayload ||
      !body.signature ||
      body.baseVersion === undefined
    ) {
      json(
        ctx.res,
        400,
        errorPayload(
          "VAULT_SHARE_BAD_REQUEST",
          "recipientUserId, encryptedVaultKey, encryptedPayload, signature and baseVersion are required",
          ctx.requestId,
        ),
      );
      return;
    }

    try {
      const userId = await resolveUserId(ctx.req);
      if (!userId) {
        json(ctx.res, 401, errorPayload("AUTH_REQUIRED", "auth required", ctx.requestId));
        return;
      }
      await sharingService.shareVault(vaultId, userId, {
        recipientUserId: body.recipientUserId,
        encryptedVaultKey: body.encryptedVaultKey,
        encryptedPayload: body.encryptedPayload,
        signature: body.signature,
        baseVersion: body.baseVersion,
        idempotencyKey: body.idempotencyKey,
        clientCreatedAt: body.clientCreatedAt,
        role: body.role,
      });
      json(ctx.res, 201, { shared: true });
    } catch (error) {
      handleSharingError(ctx.requestId, ctx.res, error);
    }
  };
}

export function createVaultShareRevokeRoute(
  sharingService: VaultSharingService,
  resolveUserId: (req: IncomingMessage) => Promise<string | null>,
): RouteHandler {
  return async (ctx) => {
    const vaultId = ctx.params.vaultId;
    if (!vaultId) {
      json(ctx.res, 400, errorPayload("BAD_REQUEST", "vaultId is required", ctx.requestId));
      return;
    }

    let body: RevokeVaultBody;
    try {
      body = await readJsonBody<RevokeVaultBody>(ctx.req);
    } catch {
      json(ctx.res, 400, errorPayload("VAULT_SHARE_BAD_REQUEST", "invalid json", ctx.requestId));
      return;
    }

    if (!body.recipientUserId || !body.encryptedPayload || !body.signature || body.baseVersion === undefined) {
      json(
        ctx.res,
        400,
        errorPayload(
          "VAULT_SHARE_BAD_REQUEST",
          "recipientUserId, encryptedPayload, signature and baseVersion are required",
          ctx.requestId,
        ),
      );
      return;
    }
    if (!Array.isArray(body.rotatedVaultKeys) || body.rotatedVaultKeys.length === 0) {
      json(
        ctx.res,
        400,
        errorPayload(
          "VAULT_SHARE_BAD_REQUEST",
          "rotatedVaultKeys must be a non-empty array",
          ctx.requestId,
        ),
      );
      return;
    }
    const rotatedVaultKeys = body.rotatedVaultKeys
      .filter((entry) => Boolean(entry.userId) && entry.encryptedVaultKey !== undefined)
      .map((entry) => ({
        userId: entry.userId!,
        encryptedVaultKey: entry.encryptedVaultKey!,
      }));
    if (rotatedVaultKeys.length !== body.rotatedVaultKeys.length) {
      json(
        ctx.res,
        400,
        errorPayload(
          "VAULT_SHARE_BAD_REQUEST",
          "each rotatedVaultKeys item must include userId and encryptedVaultKey",
          ctx.requestId,
        ),
      );
      return;
    }

    try {
      const userId = await resolveUserId(ctx.req);
      if (!userId) {
        json(ctx.res, 401, errorPayload("AUTH_REQUIRED", "auth required", ctx.requestId));
        return;
      }
      await sharingService.revokeVaultAccess(vaultId, userId, {
        recipientUserId: body.recipientUserId,
        rotatedVaultKeys,
        encryptedPayload: body.encryptedPayload,
        signature: body.signature,
        baseVersion: body.baseVersion,
        idempotencyKey: body.idempotencyKey,
        clientCreatedAt: body.clientCreatedAt,
      });
      json(ctx.res, 200, { revoked: true });
    } catch (error) {
      handleSharingError(ctx.requestId, ctx.res, error);
    }
  };
}

export function createVaultKeyRotateRoute(
  sharingService: VaultSharingService,
  resolveUserId: (req: IncomingMessage) => Promise<string | null>,
): RouteHandler {
  return async (ctx) => {
    const vaultId = ctx.params.vaultId;
    if (!vaultId) {
      json(ctx.res, 400, errorPayload("BAD_REQUEST", "vaultId is required", ctx.requestId));
      return;
    }

    let body: RotateVaultKeyBody;
    try {
      body = await readJsonBody<RotateVaultKeyBody>(ctx.req);
    } catch {
      json(ctx.res, 400, errorPayload("VAULT_SHARE_BAD_REQUEST", "invalid json", ctx.requestId));
      return;
    }

    if (!body.encryptedPayload || !body.signature || body.baseVersion === undefined) {
      json(
        ctx.res,
        400,
        errorPayload(
          "VAULT_SHARE_BAD_REQUEST",
          "encryptedPayload, signature and baseVersion are required",
          ctx.requestId,
        ),
      );
      return;
    }
    if (!Array.isArray(body.rotatedVaultKeys) || body.rotatedVaultKeys.length === 0) {
      json(
        ctx.res,
        400,
        errorPayload(
          "VAULT_SHARE_BAD_REQUEST",
          "rotatedVaultKeys must be a non-empty array",
          ctx.requestId,
        ),
      );
      return;
    }
    const rotatedVaultKeys = body.rotatedVaultKeys
      .filter((entry) => Boolean(entry.userId) && entry.encryptedVaultKey !== undefined)
      .map((entry) => ({
        userId: entry.userId!,
        encryptedVaultKey: entry.encryptedVaultKey!,
      }));
    if (rotatedVaultKeys.length !== body.rotatedVaultKeys.length) {
      json(
        ctx.res,
        400,
        errorPayload(
          "VAULT_SHARE_BAD_REQUEST",
          "each rotatedVaultKeys item must include userId and encryptedVaultKey",
          ctx.requestId,
        ),
      );
      return;
    }

    const reason = body.reason === "security_incident" || body.reason === "manual"
      ? body.reason
      : undefined;

    try {
      const userId = await resolveUserId(ctx.req);
      if (!userId) {
        json(ctx.res, 401, errorPayload("AUTH_REQUIRED", "auth required", ctx.requestId));
        return;
      }
      await sharingService.rotateVaultKey(vaultId, userId, {
        rotatedVaultKeys,
        encryptedPayload: body.encryptedPayload,
        signature: body.signature,
        baseVersion: body.baseVersion,
        idempotencyKey: body.idempotencyKey,
        clientCreatedAt: body.clientCreatedAt,
        reason,
      });
      json(ctx.res, 200, { rotated: true });
    } catch (error) {
      handleSharingError(ctx.requestId, ctx.res, error);
    }
  };
}

export function createVaultMemberRoleUpdateRoute(
  sharingService: VaultSharingService,
  resolveUserId: (req: IncomingMessage) => Promise<string | null>,
): RouteHandler {
  return async (ctx) => {
    const vaultId = ctx.params.vaultId;
    const memberId = ctx.params.userId;
    if (!vaultId || !memberId) {
      json(ctx.res, 400, errorPayload("BAD_REQUEST", "vaultId and userId are required", ctx.requestId));
      return;
    }

    let body: UpdateVaultMemberRoleBody;
    try {
      body = await readJsonBody<UpdateVaultMemberRoleBody>(ctx.req);
    } catch {
      json(ctx.res, 400, errorPayload("VAULT_SHARE_BAD_REQUEST", "invalid json", ctx.requestId));
      return;
    }

    if (!body.newRole || !body.encryptedPayload || !body.signature || body.baseVersion === undefined) {
      json(
        ctx.res,
        400,
        errorPayload(
          "VAULT_SHARE_BAD_REQUEST",
          "newRole, encryptedPayload, signature and baseVersion are required",
          ctx.requestId,
        ),
      );
      return;
    }
    if (!Array.isArray(body.rotatedVaultKeys) || body.rotatedVaultKeys.length === 0) {
      json(
        ctx.res,
        400,
        errorPayload(
          "VAULT_SHARE_BAD_REQUEST",
          "rotatedVaultKeys must be a non-empty array",
          ctx.requestId,
        ),
      );
      return;
    }
    const rotatedVaultKeys = body.rotatedVaultKeys
      .filter((entry) => Boolean(entry.userId) && entry.encryptedVaultKey !== undefined)
      .map((entry) => ({
        userId: entry.userId!,
        encryptedVaultKey: entry.encryptedVaultKey!,
      }));
    if (rotatedVaultKeys.length !== body.rotatedVaultKeys.length) {
      json(
        ctx.res,
        400,
        errorPayload(
          "VAULT_SHARE_BAD_REQUEST",
          "each rotatedVaultKeys item must include userId and encryptedVaultKey",
          ctx.requestId,
        ),
      );
      return;
    }

    try {
      const userId = await resolveUserId(ctx.req);
      if (!userId) {
        json(ctx.res, 401, errorPayload("AUTH_REQUIRED", "auth required", ctx.requestId));
        return;
      }
      await sharingService.updateVaultMemberRole(vaultId, userId, {
        memberId,
        newRole: body.newRole,
        rotatedVaultKeys,
        encryptedPayload: body.encryptedPayload,
        signature: body.signature,
        baseVersion: body.baseVersion,
        idempotencyKey: body.idempotencyKey,
        clientCreatedAt: body.clientCreatedAt,
      });
      json(ctx.res, 200, { updated: true });
    } catch (error) {
      handleSharingError(ctx.requestId, ctx.res, error);
    }
  };
}

function handleSharingError(
  requestId: string,
  res: Parameters<typeof json>[0],
  error: unknown,
): void {
  if (error instanceof VaultSharingServiceError) {
    json(res, error.statusCode, {
      error: error.code,
      message: error.message,
      requestId,
      ...(error.details ? { details: error.details } : {}),
    });
    return;
  }
  json(res, 500, errorPayload("INTERNAL_SERVER_ERROR", "internal server error", requestId));
}

