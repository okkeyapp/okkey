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
  RECOVERY_PROOF_CHALLENGE_TTL_MS,
  verifyRecoveryPossessionProof,
} from "../account-recovery/possession-proof.ts";
import {
  RECOVERY_PROOF_ACCOUNT_MAX_FAILURES,
  RECOVERY_PROOF_SESSION_MAX_FAILURES,
  accountAttemptKey,
  clearRecoveryProofFailures,
  createMemoryRecoveryProofAttemptStore,
  recordRecoveryProofFailure,
  recoveryProofLockRemainingMs,
  sessionAttemptKey,
  type RecoveryProofAttemptStore,
} from "../account-recovery/recovery-proof-attempts.ts";
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
  options?: { allowRotate?: (req: IncomingMessage) => Promise<boolean> },
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
      const allowRotate = options?.allowRotate ? await options.allowRotate(ctx.req) : true;
      const forbidRotate = session?.scope === SESSION_SCOPE_REGISTRATION_RECOVERY || !allowRotate;
      const result = await service.enrollKey(userId, encryptedBlob, {
        rotate: false,
        forbidRotate,
        possessionPublicKey: readPossessionPublicKey(body),
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
        possessionPublicKey: readPossessionPublicKey(body),
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

function readPossessionPublicKey(body: {
  possessionPublicKey?: string;
  possession_public_key?: string;
}): string | null {
  const raw = body.possessionPublicKey ?? body.possession_public_key;
  return typeof raw === "string" ? raw : null;
}

type ProveBody = {
  challenge?: unknown;
  signature?: unknown;
};

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

/**
 * `POST /account/recovery/key/prove`.
 * An empty object issues a single-use challenge bound to this session and device.
 * A signature over that challenge, made with the possession key, grants the session.
 * Ciphertext is never returned here. Legacy wraps (no public key) are refused.
 */
export function createAccountRecoveryKeyProveRoute(
  service: AccountRecoveryService,
  resolveUserId: (req: IncomingMessage) => Promise<string | null>,
  options: {
    resolveSession: (req: IncomingMessage) => Promise<{
      userId: string;
      deviceId?: string | null;
      tokenHash?: string;
      recoveryChallenge?: string | null;
      recoveryChallengeExpiresAt?: string | null;
    } | null>;
    sessionService: {
      markRecoveryProved(accessToken: string, userId: string): Promise<boolean>;
      setRecoveryChallenge(
        accessToken: string,
        userId: string,
        challenge: string,
        expiresAtIso: string,
      ): Promise<boolean>;
      consumeRecoveryChallenge(
        accessToken: string,
        userId: string,
        challenge: string,
      ): Promise<boolean>;
    };
    attemptStore?: RecoveryProofAttemptStore;
    now?: () => number;
  },
): RouteHandler {
  const now = options.now ?? (() => Date.now());
  const attemptStore = options.attemptStore ?? createMemoryRecoveryProofAttemptStore();
  return async (ctx) => {
    try {
      const userId = await requireUserId(resolveUserId, ctx.req, ctx.requestId, ctx.res);
      if (!userId) {
        return;
      }
      const session = await options.resolveSession(ctx.req);
      const accessToken = bearerTokenFromRequest(ctx.req);
      const tokenHash = session?.tokenHash ?? "";
      const clock = now();
      const accountKey = accountAttemptKey(userId);
      const sessionKey = tokenHash ? sessionAttemptKey(tokenHash) : "";
      const accountLock = await recoveryProofLockRemainingMs(attemptStore, accountKey, clock);
      const sessionLock = sessionKey
        ? await recoveryProofLockRemainingMs(attemptStore, sessionKey, clock)
        : 0;
      const lockMs = Math.max(accountLock, sessionLock);
      if (lockMs > 0) {
        json(ctx.res, 429, {
          ...errorPayload("RECOVERY_PROOF_LIMITED", "recovery proof is temporarily locked", ctx.requestId),
          remaining_ms: lockMs,
        });
        return;
      }

      let body: unknown;
      try {
        body = await readJsonBody<unknown>(ctx.req);
      } catch {
        json(ctx.res, 400, errorPayload("RECOVERY_BAD_REQUEST", "invalid json", ctx.requestId));
        return;
      }
      if (!isJsonObject(body)) {
        json(ctx.res, 400, errorPayload("RECOVERY_BAD_REQUEST", "invalid json", ctx.requestId));
        return;
      }
      const proveBody = body as ProveBody;
      const hasChallenge = Object.prototype.hasOwnProperty.call(body, "challenge");
      const hasSignature = Object.prototype.hasOwnProperty.call(body, "signature");
      if (!session?.deviceId) {
        json(
          ctx.res,
          403,
          errorPayload(
            "RECOVERY_PROOF_REQUIRES_DEVICE",
            "recovery proof requires a device bound to this session",
            ctx.requestId,
          ),
        );
        return;
      }
      if (!accessToken) {
        json(ctx.res, 401, errorPayload("AUTH_REQUIRED", "auth required", ctx.requestId));
        return;
      }

      if (!hasChallenge && !hasSignature) {
        const possession = await service.getRecoveryPossession(userId);
        if (possession.kind === "unavailable") {
          json(
            ctx.res,
            404,
            errorPayload(
              "RECOVERY_KEY_NOT_AVAILABLE",
              "recovery key is not available for this account",
              ctx.requestId,
            ),
          );
          return;
        }
        if (possession.kind === "legacy") {
          json(
            ctx.res,
            409,
            errorPayload(
              "RECOVERY_PROOF_UNAVAILABLE",
              "this recovery key cannot be verified from an untrusted device",
              ctx.requestId,
            ),
          );
          return;
        }
        const challenge = randomBytes(32).toString("base64");
        const expiresAt = new Date(clock + RECOVERY_PROOF_CHALLENGE_TTL_MS).toISOString();
        const stored = await options.sessionService.setRecoveryChallenge(
          accessToken,
          userId,
          challenge,
          expiresAt,
        );
        if (!stored) {
          json(ctx.res, 401, errorPayload("AUTH_REQUIRED", "auth required", ctx.requestId));
          return;
        }
        json(ctx.res, 200, {
          proved: false,
          challenge,
          deviceId: session.deviceId,
          expiresAt,
        });
        return;
      }

      if (typeof proveBody.challenge !== "string" || typeof proveBody.signature !== "string") {
        json(
          ctx.res,
          400,
          errorPayload("RECOVERY_BAD_REQUEST", "challenge and signature are required", ctx.requestId),
        );
        return;
      }
      const challenge = proveBody.challenge;
      const expiresAtMs = session.recoveryChallengeExpiresAt
        ? Date.parse(session.recoveryChallengeExpiresAt)
        : Number.NaN;
      const challengeMatches =
        session.recoveryChallenge === challenge &&
        !Number.isNaN(expiresAtMs) &&
        expiresAtMs > clock;
      if (!challengeMatches) {
        json(
          ctx.res,
          400,
          errorPayload("RECOVERY_BAD_REQUEST", "recovery challenge is missing or expired", ctx.requestId),
        );
        return;
      }
      const consumed = await options.sessionService.consumeRecoveryChallenge(
        accessToken,
        userId,
        challenge,
      );
      if (!consumed) {
        json(
          ctx.res,
          400,
          errorPayload("RECOVERY_BAD_REQUEST", "recovery challenge is missing or expired", ctx.requestId),
        );
        return;
      }
      const possession = await service.getRecoveryPossession(userId);
      const signatureOk =
        possession.kind === "ready" &&
        verifyRecoveryPossessionProof({
          userId,
          deviceId: session.deviceId,
          challenge,
          publicKeyBase64: possession.publicKey,
          signatureBase64: proveBody.signature,
        });
      if (!signatureOk) {
        await recordRecoveryProofFailure(
          attemptStore,
          accountKey,
          RECOVERY_PROOF_ACCOUNT_MAX_FAILURES,
          clock,
        );
        if (sessionKey) {
          await recordRecoveryProofFailure(
            attemptStore,
            sessionKey,
            RECOVERY_PROOF_SESSION_MAX_FAILURES,
            clock,
          );
        }
        json(
          ctx.res,
          403,
          errorPayload("RECOVERY_PROOF_INVALID", "recovery key proof is invalid", ctx.requestId),
        );
        return;
      }
      await clearRecoveryProofFailures(attemptStore, accountKey);
      if (sessionKey) {
        await clearRecoveryProofFailures(attemptStore, sessionKey);
      }
      const marked = await options.sessionService.markRecoveryProved(accessToken, userId);
      if (!marked) {
        json(ctx.res, 401, errorPayload("AUTH_REQUIRED", "auth required", ctx.requestId));
        return;
      }
      json(ctx.res, 200, { proved: true });
    } catch (error) {
      handleRecoveryError(ctx.requestId, ctx.res, error);
    }
  };
}

/** Unused helper kept for typed header access parity with sibling routes. */
export function recoveryRequestIdHeader(req: IncomingMessage): string | undefined {
  return getHeader(req, "x-request-id") ?? undefined;
}
