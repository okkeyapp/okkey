import type { IncomingMessage } from "node:http";
import { json, readJsonBody, type RouteHandler } from "../http.ts";
import type { UsersRepository } from "../storage/repositories.ts";

function errorPayload(code: string, message: string, requestId: string) {
  return { error: code, message, requestId };
}

/** Max rejected unlock posts per user before 429. Matches client PIN budget. */
const MAX_REJECTED_ATTEMPTS = 5;
const REJECT_WINDOW_MS = 5 * 60 * 1000;

type AttemptState = {
  failures: number[];
  lockedUntil: number | null;
};

const attemptStateByUser = new Map<string, AttemptState>();

const SECRET_BODY_KEYS = new Set([
  "password",
  "master_password",
  "masterPassword",
  "pin",
  "secret",
  "token",
]);

function readAttemptState(userId: string): AttemptState {
  return attemptStateByUser.get(userId) ?? { failures: [], lockedUntil: null };
}

function writeAttemptState(userId: string, state: AttemptState): void {
  attemptStateByUser.set(userId, state);
}

function clearUnlockFailures(userId: string): void {
  attemptStateByUser.delete(userId);
}

function unlockLockRemainingMs(userId: string, now: number): number {
  const state = readAttemptState(userId);
  if (!state.lockedUntil) {
    return 0;
  }
  return Math.max(0, state.lockedUntil - now);
}

function recordUnlockRejection(userId: string, now: number): { limited: boolean } {
  const state = readAttemptState(userId);
  if (state.lockedUntil && state.lockedUntil > now) {
    return { limited: true };
  }
  const recent = state.failures.filter((ts) => now - ts < REJECT_WINDOW_MS);
  recent.push(now);
  if (recent.length >= MAX_REJECTED_ATTEMPTS) {
    writeAttemptState(userId, { failures: [], lockedUntil: now + REJECT_WINDOW_MS });
    return { limited: true };
  }
  writeAttemptState(userId, { failures: recent, lockedUntil: null });
  return { limited: false };
}

/**
 * Successful stamp body must be empty. Any password/secret field is rejected and
 * never recorded — the API must not accept master-password material.
 */
function isRecordableUnlockBody(body: unknown): boolean {
  if (body == null) {
    return true;
  }
  if (typeof body !== "object" || Array.isArray(body)) {
    return false;
  }
  const keys = Object.keys(body as Record<string, unknown>);
  if (keys.length === 0) {
    return true;
  }
  return false;
}

function bodyContainsSecrets(body: unknown): boolean {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return false;
  }
  const record = body as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (SECRET_BODY_KEYS.has(key)) {
      return true;
    }
  }
  return false;
}

/** Test helper — clears in-memory reject counters between cases. */
export function resetVaultUnlockAttemptLimiterForTests(): void {
  attemptStateByUser.clear();
}

/**
 * `POST /account/vault-unlock` — client reports a successful master-password vault unlock.
 * Does not accept or store any secrets; only updates `users.last_vault_unlocked_at`.
 * Rejected payloads (including any password field) are rate-limited per user.
 */
export function createAccountVaultUnlockRoute(
  users: Pick<UsersRepository, "recordVaultUnlock">,
  resolveUserId: (req: IncomingMessage) => Promise<string | null>,
  options?: { now?: () => number },
): RouteHandler {
  const nowFn = options?.now ?? Date.now;
  return async (ctx) => {
    const userId = await resolveUserId(ctx.req);
    if (!userId) {
      json(ctx.res, 401, errorPayload("AUTH_REQUIRED", "auth required", ctx.requestId));
      return;
    }

    const now = nowFn();
    if (unlockLockRemainingMs(userId, now) > 0) {
      json(ctx.res, 429, errorPayload("VAULT_UNLOCK_RATE_LIMITED", "rate limited", ctx.requestId));
      return;
    }

    let body: unknown = {};
    try {
      body = await readJsonBody<unknown>(ctx.req);
    } catch {
      const limited = recordUnlockRejection(userId, now);
      json(
        ctx.res,
        limited.limited ? 429 : 400,
        errorPayload(
          limited.limited ? "VAULT_UNLOCK_RATE_LIMITED" : "INVALID_VAULT_UNLOCK",
          limited.limited ? "rate limited" : "invalid vault unlock payload",
          ctx.requestId,
        ),
      );
      return;
    }

    if (!isRecordableUnlockBody(body) || bodyContainsSecrets(body)) {
      const limited = recordUnlockRejection(userId, now);
      json(
        ctx.res,
        limited.limited ? 429 : 400,
        errorPayload(
          limited.limited ? "VAULT_UNLOCK_RATE_LIMITED" : "INVALID_VAULT_UNLOCK",
          limited.limited ? "rate limited" : "invalid vault unlock payload",
          ctx.requestId,
        ),
      );
      return;
    }

    const updated = await users.recordVaultUnlock(userId);
    if (!updated) {
      json(ctx.res, 404, errorPayload("USER_NOT_FOUND", "user not found", ctx.requestId));
      return;
    }
    clearUnlockFailures(userId);
    json(ctx.res, 200, { recorded: true });
  };
}
