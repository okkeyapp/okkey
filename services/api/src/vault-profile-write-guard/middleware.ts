import type { IncomingMessage } from "node:http";

import {
  decodePathSegment,
  json,
  readJsonBody,
  type Middleware,
  type RequestContext,
} from "../http.ts";
import { findInvalidEntityIdPathParam, invalidEntityIdErrorCode } from "../http-params.ts";

import {
  PROFILE_PERMISSION_DENIED,
  VaultProfileWriteGuardError,
  type VaultProfileWriteGuardService,
} from "./service.ts";

type SyncedBody = {
  eventType?: string;
  referencedItemId?: string;
  itemSoftDeleted?: boolean;
};

type MatchedWrite =
  | { kind: "sync"; vaultId: string }
  | {
      kind: "attachment";
      vaultId: string;
      itemId: string;
      method: "GET" | "POST" | "DELETE";
    };

function matchWriteRequest(ctx: RequestContext): MatchedWrite | null {
  const method = (ctx.req.method ?? "GET").toUpperCase();
  const pathname = new URL(ctx.req.url ?? "/", "http://localhost").pathname;
  const parts = pathname.split("/").filter(Boolean);

  // POST /vaults/:vaultId/events
  if (
    method === "POST" &&
    parts.length === 3 &&
    parts[0] === "vaults" &&
    parts[2] === "events"
  ) {
    return { kind: "sync", vaultId: decodePathSegment(parts[1]!) };
  }

  // POST /vaults/:vaultId/items/:itemId/attachments
  // GET|DELETE /vaults/:vaultId/items/:itemId/attachments/:attachmentId
  if (
    parts.length >= 5 &&
    parts[0] === "vaults" &&
    parts[2] === "items" &&
    parts[4] === "attachments"
  ) {
    const vaultId = decodePathSegment(parts[1]!);
    const itemId = decodePathSegment(parts[3]!);
    if (method === "POST" && parts.length === 5) {
      return { kind: "attachment", vaultId, itemId, method: "POST" };
    }
    if ((method === "GET" || method === "DELETE") && parts.length === 6) {
      return { kind: "attachment", vaultId, itemId, method };
    }
  }

  return null;
}

/**
 * Reject path ids before any profile lookup. Core validates the same ids later
 * in the route chain; this guard runs first and must not send them to Postgres.
 * Response matches Core: 400 `INVALID_<PARAM>_ID`.
 */
function rejectInvalidEntityIds(ctx: RequestContext, fields: Array<[string, string]>): boolean {
  for (const [name, raw] of fields) {
    const invalid = findInvalidEntityIdPathParam({ [name]: raw });
    if (invalid) {
      json(ctx.res, 400, {
        error: invalidEntityIdErrorCode(name),
        message: `${name} must be a snowflake entity id`,
        requestId: ctx.requestId,
      });
      return true;
    }
  }
  return false;
}

function deny(ctx: RequestContext, error: VaultProfileWriteGuardError): void {
  json(ctx.res, error.statusCode, {
    error: error.code,
    message: error.message,
    requestId: ctx.requestId,
  });
}

/**
 * HTTP guard for shared-vault writes.
 * Runs before Core sync/attachment handlers; personal vaults pass through.
 */
export function createVaultProfileWriteGuardMiddleware(
  service: VaultProfileWriteGuardService,
  resolveUserId: (req: IncomingMessage) => Promise<string | null>,
): Middleware {
  return async (ctx, next) => {
    const matched = matchWriteRequest(ctx);
    if (!matched) {
      await next();
      return;
    }

    const ids: Array<[string, string]> =
      matched.kind === "attachment"
        ? [
            ["vaultId", matched.vaultId],
            ["itemId", matched.itemId],
          ]
        : [["vaultId", matched.vaultId]];
    if (rejectInvalidEntityIds(ctx, ids)) {
      return;
    }

    const userId = await resolveUserId(ctx.req);
    if (!userId) {
      // Core route returns AUTH_REQUIRED.
      await next();
      return;
    }

    try {
      if (matched.kind === "sync") {
        let body: SyncedBody;
        try {
          body = await readJsonBody<SyncedBody>(ctx.req);
        } catch {
          // Invalid JSON: let Core return SYNC_BAD_REQUEST.
          await next();
          return;
        }
        (ctx.req as IncomingMessage & { body?: unknown }).body = body;

        if (!body.eventType || typeof body.eventType !== "string") {
          await next();
          return;
        }

        await service.assertSyncAppendAllowed({
          vaultId: matched.vaultId,
          userId,
          eventType: body.eventType,
          referencedItemId: body.referencedItemId,
          itemSoftDeleted: body.itemSoftDeleted,
        });
      } else {
        await service.assertAttachmentAllowed({
          vaultId: matched.vaultId,
          userId,
          itemId: matched.itemId,
          method: matched.method,
        });
      }
    } catch (error) {
      if (error instanceof VaultProfileWriteGuardError) {
        deny(ctx, error);
        return;
      }
      throw error;
    }

    await next();
  };
}
