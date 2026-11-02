import type { IncomingMessage } from "node:http";
import type {
  AccountRecoveryKeyEnrollRequestDto,
  AccountRecoverySettingsUpdateRequestDto,
  TrustedContactInviteRequestDto,
} from "@okkey/types";

import { randomBytes } from "node:crypto";
import {
  AccountRecoveryError,
  AccountRecoveryService,
  extractTrustedContactInviteEmails,
} from "../account-recovery/service.ts";
import {
  verifyRecoveryPossessionAttestation,
  type RecoveryPossessionAttestationInput,
} from "../account-recovery/possession-proof.ts";
import { getHeader, json, readJsonBody, type RouteHandler } from "../http.ts";
import type { ResolveAuthenticatedSession } from "./auth-context.ts";
import {
  bearerTokenFromRequest,
  SESSION_SCOPE_REGISTRATION_RECOVERY,
} from "./auth-context.ts";
import type { SessionService } from "../session/service.ts";

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

export type RecoveryStatusAccess = {
  userId: string;
  /** Contact emails and invite directory. False for an unproved untrusted session. */
  includeDirectory: boolean;
};

export function createAccountRecoveryStatusRoute(
  service: AccountRecoveryService,
  resolveAccess: (req: IncomingMessage) => Promise<RecoveryStatusAccess | null>,
): RouteHandler {
  return async (ctx) => {
    try {
      const access = await resolveAccess(ctx.req);
      if (!access) {
        json(ctx.res, 401, errorPayload("AUTH_REQUIRED", "auth required", ctx.requestId));
        return;
      }
      const status = await service.getStatus(access.userId);
      if (!access.includeDirectory) {
        status.contacts = [];
        status.pendingInvites = [];
        status.servingAsContact = [];
      }
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
      const currentFingerprint =
        getHeader(ctx.req, "x-device-fingerprint") ?? undefined;
      const status = await service.updateSettings(
        userId,
        {
          keyEnabled: body.keyEnabled,
          devicesEnabled: body.devicesEnabled,
          contactsEnabled: body.contactsEnabled,
        },
        { currentFingerprint },
      );
      json(ctx.res, 200, status);
    } catch (error) {
      handleRecoveryError(ctx.requestId, ctx.res, error);
    }
  };
}

export function createAccountRecoveryKeyEnrollRoute(
  service: AccountRecoveryService,
  resolveUserId: (req: IncomingMessage) => Promise<string | null>,
  resolveSession?: ResolveAuthenticatedSession,
): RouteHandler {
  return async (ctx) => {
    try {
      const session = resolveSession ? await resolveSession(ctx.req) : null;
      let userId: string | null = session?.userId ?? null;
      if (!userId) {
        userId = await requireUserId(resolveUserId, ctx.req, ctx.requestId, ctx.res);
      }
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
      const forbidRotate = session?.scope === SESSION_SCOPE_REGISTRATION_RECOVERY;
      const result = await service.enrollKey(userId, encryptedBlob, {
        rotate: false,
        forbidRotate,
        possessionVerifier: readPossessionVerifier(body),
      });
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
      const result = await service.enrollKey(userId, encryptedBlob, {
        rotate: true,
        possessionVerifier: readPossessionVerifier(body),
      });
      json(ctx.res, 200, result);
    } catch (error) {
      handleRecoveryError(ctx.requestId, ctx.res, error);
    }
  };
}

export function createAccountRecoveryKeyAckExportRoute(
  service: AccountRecoveryService,
  resolveUserId: (req: IncomingMessage) => Promise<string | null>,
  options?: {
    resolveSession?: ResolveAuthenticatedSession;
    sessionService?: Pick<SessionService, "revokeAccessToken">;
  },
): RouteHandler {
  return async (ctx) => {
    try {
      const session = options?.resolveSession
        ? await options.resolveSession(ctx.req)
        : null;
      let userId: string | null = session?.userId ?? null;
      if (!userId) {
        userId = await requireUserId(resolveUserId, ctx.req, ctx.requestId, ctx.res);
      }
      if (!userId) {
        return;
      }
      const status = await service.ackKeyExport(userId);
      // One-shot bootstrap: revoke registration_recovery token after successful ack.
      if (
        session?.scope === SESSION_SCOPE_REGISTRATION_RECOVERY &&
        options?.sessionService
      ) {
        const token = bearerTokenFromRequest(ctx.req);
        if (token) {
          await options.sessionService.revokeAccessToken(token);
        }
      }
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

function readPossessionVerifier(body: {
  possessionVerifier?: string;
  possession_verifier?: string;
}): string | null {
  const raw = body.possessionVerifier ?? body.possession_verifier;
  return typeof raw === "string" ? raw : null;
}

type ProveBody = {
  possessionVerifier?: string;
  possession_verifier?: string;
  attestation?: {
    purpose?: string;
    user_id?: string;
    userId?: string;
    recorded_at?: string;
    recordedAt?: string;
    challenge?: string;
    signature?: string;
  };
};

function readAttestation(body: ProveBody): RecoveryPossessionAttestationInput | null {
  const attestation = body.attestation;
  if (!attestation || typeof attestation !== "object") {
    return null;
  }
  const userId = attestation.user_id ?? attestation.userId;
  const recordedAt = attestation.recorded_at ?? attestation.recordedAt;
  if (
    typeof userId !== "string" ||
    typeof recordedAt !== "string" ||
    typeof attestation.challenge !== "string" ||
    typeof attestation.signature !== "string"
  ) {
    return null;
  }
  return {
    purpose: attestation.purpose,
    userId,
    recordedAt,
    challenge: attestation.challenge,
    signature: attestation.signature,
  };
}

/**
 * `POST /account/recovery/key/prove` — a full session, including a pending device.
 * A stored possession tag must match before any wrap is returned.
 * A wrap enrolled before tags existed returns ciphertext only in this response,
 * and the session is not granted until an identity attestation verifies.
 */
export function createAccountRecoveryKeyProveRoute(
  service: AccountRecoveryService,
  resolveUserId: (req: IncomingMessage) => Promise<string | null>,
  options: {
    resolveSession: (req: IncomingMessage) => Promise<{
      userId: string;
      recoveryChallenge?: string | null;
    } | null>;
    users: { findById(id: string): Promise<{ publicKey: string } | null> };
    sessionService: {
      markRecoveryProved(accessToken: string, userId: string): Promise<boolean>;
      setRecoveryChallenge(accessToken: string, userId: string, challenge: string): Promise<boolean>;
    };
    now?: () => number;
  },
): RouteHandler {
  const now = options.now ?? Date.now;
  return async (ctx) => {
    try {
      const userId = await requireUserId(resolveUserId, ctx.req, ctx.requestId, ctx.res);
      if (!userId) {
        return;
      }
      let body: ProveBody;
      try {
        body = await readJsonBody<ProveBody>(ctx.req);
      } catch {
        json(ctx.res, 400, errorPayload("RECOVERY_BAD_REQUEST", "invalid json", ctx.requestId));
        return;
      }
      const possessionVerifier = readPossessionVerifier(body);
      if (!possessionVerifier) {
        json(
          ctx.res,
          400,
          errorPayload("RECOVERY_BAD_REQUEST", "possessionVerifier is required", ctx.requestId),
        );
        return;
      }
      const attestation = readAttestation(body);
      const session = await options.resolveSession(ctx.req);
      const accessToken = bearerTokenFromRequest(ctx.req);

      if (attestation) {
        const expectedChallenge = session?.recoveryChallenge ?? null;
        if (!expectedChallenge || !accessToken) {
          json(
            ctx.res,
            400,
            errorPayload("RECOVERY_BAD_REQUEST", "recovery challenge is missing", ctx.requestId),
          );
          return;
        }
        const user = await options.users.findById(userId);
        if (!user) {
          json(ctx.res, 404, errorPayload("USER_NOT_FOUND", "user not found", ctx.requestId));
          return;
        }
        const ok = verifyRecoveryPossessionAttestation({
          userId,
          publicKeyBase64: user.publicKey,
          expectedChallenge,
          attestation,
          now: now(),
        });
        if (!ok) {
          json(
            ctx.res,
            403,
            errorPayload("RECOVERY_PROOF_INVALID", "recovery key proof is invalid", ctx.requestId),
          );
          return;
        }
        await service.storePossessionVerifierIfAbsent(userId, possessionVerifier);
        const marked = await options.sessionService.markRecoveryProved(accessToken, userId);
        if (!marked) {
          json(ctx.res, 401, errorPayload("AUTH_REQUIRED", "auth required", ctx.requestId));
          return;
        }
        json(ctx.res, 200, { proved: true });
        return;
      }

      const check = await service.checkRecoveryPossession(userId, possessionVerifier);
      if (check.kind === "unavailable") {
        json(
          ctx.res,
          404,
          errorPayload("RECOVERY_KEY_NOT_AVAILABLE", "recovery key is not available for this account", ctx.requestId),
        );
        return;
      }
      if (check.kind === "mismatch") {
        json(
          ctx.res,
          403,
          errorPayload("RECOVERY_PROOF_INVALID", "recovery key proof is invalid", ctx.requestId),
        );
        return;
      }
      if (check.kind === "match") {
        if (!accessToken) {
          json(ctx.res, 200, { proved: true });
          return;
        }
        const marked = await options.sessionService.markRecoveryProved(accessToken, userId);
        if (!marked) {
          json(ctx.res, 401, errorPayload("AUTH_REQUIRED", "auth required", ctx.requestId));
          return;
        }
        json(ctx.res, 200, { proved: true });
        return;
      }

      if (!accessToken) {
        json(ctx.res, 401, errorPayload("AUTH_REQUIRED", "auth required", ctx.requestId));
        return;
      }
      const challenge = randomBytes(32).toString("base64");
      const stored = await options.sessionService.setRecoveryChallenge(
        accessToken,
        userId,
        challenge,
      );
      if (!stored) {
        json(ctx.res, 401, errorPayload("AUTH_REQUIRED", "auth required", ctx.requestId));
        return;
      }
      json(ctx.res, 200, {
        proved: false,
        status: "attestation_required",
        challenge,
        encryptedBlob: check.encryptedBlob,
        encryptedPrivateKey: check.encryptedPrivateKey,
      });
    } catch (error) {
      handleRecoveryError(ctx.requestId, ctx.res, error);
    }
  };
}

/** Unused helper kept for typed header access parity with sibling routes. */
export function recoveryRequestIdHeader(req: IncomingMessage): string | undefined {
  return getHeader(req, "x-request-id") ?? undefined;
}
