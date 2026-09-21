import type { IncomingMessage } from "node:http";
import type {
  AccountRecoveryKeyEnrollRequestDto,
  AccountRecoverySettingsUpdateRequestDto,
  TrustedContactInviteRequestDto,
} from "@okkey/types";

import {
  AccountRecoveryError,
  AccountRecoveryService,
  extractTrustedContactInviteEmails,
} from "../account-recovery/service.ts";
import { getHeader, json, readJsonBody, type RouteHandler } from "../http.ts";

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

function handleRecoveryError(
  requestId: string,
  res: Parameters<typeof json>[0],
  error: unknown,
): void {
  if (error instanceof AccountRecoveryError) {
    json(
      res,
      error.statusCode,
      errorPayload(error.code, error.message, requestId, error.details),
    );
    return;
  }
  json(res, 500, errorPayload("INTERNAL_SERVER_ERROR", "internal server error", requestId));
}

async function requireUserId(
  resolveUserId: (req: IncomingMessage) => Promise<string | null>,
  req: IncomingMessage,
  requestId: string,
  res: Parameters<typeof json>[0],
): Promise<string | null> {
  const userId = await resolveUserId(req);
  if (!userId) {
    json(res, 401, errorPayload("AUTH_REQUIRED", "auth required", requestId));
    return null;
  }
  return userId;
}

export function createAccountRecoveryStatusRoute(
  service: AccountRecoveryService,
  resolveUserId: (req: IncomingMessage) => Promise<string | null>,
): RouteHandler {
  return async (ctx) => {
    try {
      const userId = await requireUserId(resolveUserId, ctx.req, ctx.requestId, ctx.res);
      if (!userId) {
        return;
      }
      const status = await service.getStatus(userId);
      json(ctx.res, 200, status);
    } catch (error) {
      handleRecoveryError(ctx.requestId, ctx.res, error);
    }
  };
}

export function createAccountRecoverySettingsPatchRoute(
  service: AccountRecoveryService,
  resolveUserId: (req: IncomingMessage) => Promise<string | null>,
): RouteHandler {
  return async (ctx) => {
    try {
      const userId = await requireUserId(resolveUserId, ctx.req, ctx.requestId, ctx.res);
      if (!userId) {
        return;
      }
      let body: AccountRecoverySettingsUpdateRequestDto;
      try {
        body = await readJsonBody<AccountRecoverySettingsUpdateRequestDto>(ctx.req);
      } catch {
        json(ctx.res, 400, errorPayload("RECOVERY_BAD_REQUEST", "invalid json", ctx.requestId));
        return;
      }
      const status = await service.updateSettings(userId, {
        keyEnabled: body.keyEnabled,
        devicesEnabled: body.devicesEnabled,
        contactsEnabled: body.contactsEnabled,
      });
      json(ctx.res, 200, status);
    } catch (error) {
      handleRecoveryError(ctx.requestId, ctx.res, error);
    }
  };
}

export function createAccountRecoveryKeyEnrollRoute(
  service: AccountRecoveryService,
  resolveUserId: (req: IncomingMessage) => Promise<string | null>,
): RouteHandler {
  return async (ctx) => {
    try {
      const userId = await requireUserId(resolveUserId, ctx.req, ctx.requestId, ctx.res);
      if (!userId) {
        return;
      }
      let body: AccountRecoveryKeyEnrollRequestDto & {
        encrypted_blob?: AccountRecoveryKeyEnrollRequestDto["encryptedBlob"];
      };
      try {
        body = await readJsonBody(ctx.req);
      } catch {
        json(ctx.res, 400, errorPayload("RECOVERY_BAD_REQUEST", "invalid json", ctx.requestId));
        return;
      }
      const encryptedBlob = body.encryptedBlob ?? body.encrypted_blob;
      if (!encryptedBlob) {
        json(
          ctx.res,
          400,
          errorPayload("RECOVERY_BAD_REQUEST", "encryptedBlob is required", ctx.requestId),
        );
        return;
      }
      const result = await service.enrollKey(userId, encryptedBlob, { rotate: false });
      json(ctx.res, 200, result);
    } catch (error) {
      handleRecoveryError(ctx.requestId, ctx.res, error);
    }
  };
}

export function createAccountRecoveryKeyRotateRoute(
  service: AccountRecoveryService,
  resolveUserId: (req: IncomingMessage) => Promise<string | null>,
): RouteHandler {
  return async (ctx) => {
    try {
      const userId = await requireUserId(resolveUserId, ctx.req, ctx.requestId, ctx.res);
      if (!userId) {
        return;
      }
      let body: AccountRecoveryKeyEnrollRequestDto & {
        encrypted_blob?: AccountRecoveryKeyEnrollRequestDto["encryptedBlob"];
      };
      try {
        body = await readJsonBody(ctx.req);
      } catch {
        json(ctx.res, 400, errorPayload("RECOVERY_BAD_REQUEST", "invalid json", ctx.requestId));
        return;
      }
      const encryptedBlob = body.encryptedBlob ?? body.encrypted_blob;
      if (!encryptedBlob) {
        json(
          ctx.res,
          400,
          errorPayload("RECOVERY_BAD_REQUEST", "encryptedBlob is required", ctx.requestId),
        );
        return;
      }
      const result = await service.enrollKey(userId, encryptedBlob, { rotate: true });
      json(ctx.res, 200, result);
    } catch (error) {
      handleRecoveryError(ctx.requestId, ctx.res, error);
    }
  };
}

export function createAccountRecoveryKeyAckExportRoute(
  service: AccountRecoveryService,
  resolveUserId: (req: IncomingMessage) => Promise<string | null>,
): RouteHandler {
  return async (ctx) => {
    try {
      const userId = await requireUserId(resolveUserId, ctx.req, ctx.requestId, ctx.res);
      if (!userId) {
        return;
      }
      const status = await service.ackKeyExport(userId);
      json(ctx.res, 200, status);
    } catch (error) {
      handleRecoveryError(ctx.requestId, ctx.res, error);
    }
  };
}

export function createAccountRecoveryKeyWrapRoute(
  service: AccountRecoveryService,
  resolveUserId: (req: IncomingMessage) => Promise<string | null>,
): RouteHandler {
  return async (ctx) => {
    try {
      const userId = await requireUserId(resolveUserId, ctx.req, ctx.requestId, ctx.res);
      if (!userId) {
        return;
      }
      const result = await service.getKeyWrap(userId);
      json(ctx.res, 200, result);
    } catch (error) {
      handleRecoveryError(ctx.requestId, ctx.res, error);
    }
  };
}

export function createAccountRecoveryIdentityEncryptedKeyRoute(
  service: AccountRecoveryService,
  resolveUserId: (req: IncomingMessage) => Promise<string | null>,
): RouteHandler {
  return async (ctx) => {
    try {
      const userId = await requireUserId(resolveUserId, ctx.req, ctx.requestId, ctx.res);
      if (!userId) {
        return;
      }
      const result = await service.getIdentityEncryptedKey(userId);
      json(ctx.res, 200, {
        encrypted_private_key: result.encryptedPrivateKey,
      });
    } catch (error) {
      handleRecoveryError(ctx.requestId, ctx.res, error);
    }
  };
}

export function createAccountRecoveryContactInviteRoute(
  service: AccountRecoveryService,
  resolveUserId: (req: IncomingMessage) => Promise<string | null>,
): RouteHandler {
  return async (ctx) => {
    try {
      const userId = await requireUserId(resolveUserId, ctx.req, ctx.requestId, ctx.res);
      if (!userId) {
        return;
      }
      let body: TrustedContactInviteRequestDto;
      try {
        body = await readJsonBody<TrustedContactInviteRequestDto>(ctx.req);
      } catch {
        json(ctx.res, 400, errorPayload("RECOVERY_BAD_REQUEST", "invalid json", ctx.requestId));
        return;
      }
      const emails = extractTrustedContactInviteEmails(body);
      const locale =
        typeof body.locale === "string" && body.locale.trim().length > 0
          ? body.locale.trim()
          : null;
      const contacts = await service.inviteContacts(userId, emails, {
        explicitLocale: locale,
        acceptLanguage: getHeader(ctx.req, "accept-language"),
      });
      json(ctx.res, 200, { contact: contacts[0], contacts });
    } catch (error) {
      handleRecoveryError(ctx.requestId, ctx.res, error);
    }
  };
}

export function createAccountRecoveryContactDeleteRoute(
  service: AccountRecoveryService,
  resolveUserId: (req: IncomingMessage) => Promise<string | null>,
): RouteHandler {
  return async (ctx) => {
    try {
      const userId = await requireUserId(resolveUserId, ctx.req, ctx.requestId, ctx.res);
      if (!userId) {
        return;
      }
      const contactId = ctx.params.contactId?.trim();
      if (!contactId) {
        json(ctx.res, 400, errorPayload("RECOVERY_BAD_REQUEST", "contactId required", ctx.requestId));
        return;
      }
      const status = await service.removeContact(userId, contactId);
      json(ctx.res, 200, status);
    } catch (error) {
      handleRecoveryError(ctx.requestId, ctx.res, error);
    }
  };
}

export function createAccountRecoveryInviteAcceptRoute(
  service: AccountRecoveryService,
  resolveUserId: (req: IncomingMessage) => Promise<string | null>,
): RouteHandler {
  return async (ctx) => {
    try {
      const userId = await requireUserId(resolveUserId, ctx.req, ctx.requestId, ctx.res);
      if (!userId) {
        return;
      }
      const inviteId = ctx.params.inviteId?.trim();
      if (!inviteId) {
        json(ctx.res, 400, errorPayload("RECOVERY_BAD_REQUEST", "inviteId required", ctx.requestId));
        return;
      }
      const status = await service.acceptInvite(userId, inviteId);
      json(ctx.res, 200, status);
    } catch (error) {
      handleRecoveryError(ctx.requestId, ctx.res, error);
    }
  };
}

export function createAccountRecoveryInviteRejectRoute(
  service: AccountRecoveryService,
  resolveUserId: (req: IncomingMessage) => Promise<string | null>,
): RouteHandler {
  return async (ctx) => {
    try {
      const userId = await requireUserId(resolveUserId, ctx.req, ctx.requestId, ctx.res);
      if (!userId) {
        return;
      }
      const inviteId = ctx.params.inviteId?.trim();
      if (!inviteId) {
        json(ctx.res, 400, errorPayload("RECOVERY_BAD_REQUEST", "inviteId required", ctx.requestId));
        return;
      }
      const status = await service.rejectInvite(userId, inviteId);
      json(ctx.res, 200, status);
    } catch (error) {
      handleRecoveryError(ctx.requestId, ctx.res, error);
    }
  };
}

/** Contact leaves an owner's trusted-contact list (`DELETE …/memberships/:contactId`). */
export function createAccountRecoveryMembershipLeaveRoute(
  service: AccountRecoveryService,
  resolveUserId: (req: IncomingMessage) => Promise<string | null>,
): RouteHandler {
  return async (ctx) => {
    try {
      const userId = await requireUserId(resolveUserId, ctx.req, ctx.requestId, ctx.res);
      if (!userId) {
        return;
      }
      const contactId = ctx.params.contactId?.trim();
      if (!contactId) {
        json(ctx.res, 400, errorPayload("RECOVERY_BAD_REQUEST", "contactId required", ctx.requestId));
        return;
      }
      const status = await service.leaveAsContact(userId, contactId);
      json(ctx.res, 200, status);
    } catch (error) {
      handleRecoveryError(ctx.requestId, ctx.res, error);
    }
  };
}

/** Unused helper kept for typed header access parity with sibling routes. */
export function recoveryRequestIdHeader(req: IncomingMessage): string | undefined {
  return getHeader(req, "x-request-id") ?? undefined;
}
