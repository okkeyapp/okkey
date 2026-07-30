import type { IncomingMessage } from "node:http";
import { json, readJsonBody, type RouteHandler } from "../http.ts";
import { VaultService, VaultServiceError } from "../vault/service.ts";

export function createWorkspaceVaultsListRoute(
  vaultService: VaultService,
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
      const vaults = await vaultService.listWorkspaceVaults(workspaceId, userId);
      json(ctx.res, 200, vaults);
    } catch (error) {
      handleVaultError(ctx.requestId, ctx.res, error);
    }
  };
}

export function createWorkspaceVaultCreateRoute(
  vaultService: VaultService,
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

export function createVaultGetRoute(
  vaultService: VaultService,
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
      const vault = await vaultService.getVault(vaultId, userId);
      json(ctx.res, 200, vault);
    } catch (error) {
      handleVaultError(ctx.requestId, ctx.res, error);
    }
  };
}

export function createVaultUpdateRoute(
  vaultService: VaultService,
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
      const vault = await vaultService.updateVault(vaultId, userId, {
        name: typeof body.name === "string" ? body.name : undefined,
        description: typeof body.description === "string" ? body.description : undefined,
        icon: typeof body.icon === "string" ? body.icon : undefined,
      });
      json(ctx.res, 200, vault);
    } catch (error) {
      handleVaultError(ctx.requestId, ctx.res, error);
    }
  };
}

export function createVaultDeleteRoute(
  vaultService: VaultService,
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
  vaultService: VaultService,
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
      const members = await vaultService.getVaultAccess(vaultId, userId);
      json(ctx.res, 200, { vaultId, members });
    } catch (error) {
      handleVaultError(ctx.requestId, ctx.res, error);
    }
  };
}

export function createVaultAccessUpdateRoute(
  vaultService: VaultService,
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
  if (error instanceof VaultServiceError) {
    json(res, error.statusCode, errorPayload(error.code, error.message, requestId));
    return;
  }

  console.error("[vault] unexpected error", requestId, error);
  json(res, 500, errorPayload("INTERNAL_SERVER_ERROR", "internal server error", requestId));
}

function errorPayload(code: string, message: string, requestId: string) {
  return {
    error: code,
    message,
    requestId,
  };
}
