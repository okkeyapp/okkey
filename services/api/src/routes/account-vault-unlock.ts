import { createPublicKey, verify as verifyEd25519 } from "node:crypto";
import type { IncomingMessage } from "node:http";
import {
  clearUnlockFailures,
  createMemoryVaultUnlockAttemptStore,
  createVaultUnlockAttemptStore,
  recordUnlockRejection,
  unlockLockRemainingMs,
  type VaultUnlockAttemptRedis,
  type VaultUnlockAttemptStore,
} from "../account/vault-unlock-attempts.ts";
import { json, readJsonBody, type RouteHandler } from "../http.ts";

type VaultUnlockUsers = {
  recordVaultUnlock(userId: string): Promise<boolean>;
  findById(id: string): Promise<{ publicKey: string } | null>;
};

/** Must match `VAULT_UNLOCK_ATTESTATION_PURPOSE` in `@okkey/crypto`. */
const VAULT_UNLOCK_ATTESTATION_PURPOSE = "account.vault_unlock" as const;
/** Must match `VAULT_UNLOCK_ATTESTATION_MAX_AGE_MS` in `@okkey/crypto`. */
const VAULT_UNLOCK_ATTESTATION_MAX_AGE_MS = 60_000;

/** SPKI DER prefix for a raw 32-byte Ed25519 public key. */
const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

function errorPayload(code: string, message: string, requestId: string) {
  return { error: code, message, requestId };
}

const defaultMemoryStore = createMemoryVaultUnlockAttemptStore();

/** Test helper — clears the default in-memory reject counters between cases. */
export function resetVaultUnlockAttemptLimiterForTests(): void {
  defaultMemoryStore.resetForTests();
}

function isFailureReportBody(body: unknown): boolean {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return false;
  }
  const record = body as Record<string, unknown>;
  const keys = Object.keys(record);
  return keys.length === 1 && record.failure === true;
}

function parseAttestation(body: unknown): {
  userId: string;
  recordedAt: string;
  signature: string;
} | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return null;
  }
  const root = body as Record<string, unknown>;
  const attestation = root.attestation;
  if (!attestation || typeof attestation !== "object" || Array.isArray(attestation)) {
    return null;
  }
  const a = attestation as Record<string, unknown>;
  if (a.purpose !== VAULT_UNLOCK_ATTESTATION_PURPOSE) {
    return null;
  }
  if (typeof a.user_id !== "string" || !a.user_id.trim()) {
    return null;
  }
  if (typeof a.recorded_at !== "string" || Number.isNaN(Date.parse(a.recorded_at))) {
    return null;
  }
  if (typeof a.signature !== "string" || !a.signature.trim()) {
    return null;
  }
  const rootKeys = Object.keys(root);
  if (rootKeys.length !== 1 || rootKeys[0] !== "attestation") {
    return null;
  }
  return {
    userId: a.user_id.trim(),
    recordedAt: a.recorded_at,
    signature: a.signature.trim(),
  };
}

/** Canonical bytes signed by the user's Ed25519 identity key (must match client). */
export function vaultUnlockAttestationMessageBytes(input: {
  userId: string;
  recordedAt: string;
}): Uint8Array {
  return new TextEncoder().encode(
    JSON.stringify({
      purpose: VAULT_UNLOCK_ATTESTATION_PURPOSE,
      recorded_at: input.recordedAt,
      user_id: input.userId,
    }),
  );
}

export function verifyVaultUnlockAttestation(input: {
  userId: string;
  publicKeyBase64: string;
  attestation: { userId: string; recordedAt: string; signature: string };
  now: number;
}): boolean {
  if (input.attestation.userId !== input.userId) {
    return false;
  }
  const recordedMs = Date.parse(input.attestation.recordedAt);
  if (Number.isNaN(recordedMs)) {
    return false;
  }
  if (Math.abs(input.now - recordedMs) > VAULT_UNLOCK_ATTESTATION_MAX_AGE_MS) {
    return false;
  }
  try {
    const publicKeyRaw = Buffer.from(input.publicKeyBase64, "base64");
    if (publicKeyRaw.length !== 32) {
      return false;
    }
    const signature = Buffer.from(input.attestation.signature, "base64");
    if (signature.length !== 64) {
      return false;
    }
    const message = Buffer.from(
      vaultUnlockAttestationMessageBytes({
        userId: input.attestation.userId,
        recordedAt: input.attestation.recordedAt,
      }),
    );
    const keyObject = createPublicKey({
      key: Buffer.concat([ED25519_SPKI_PREFIX, publicKeyRaw]),
      format: "der",
      type: "spki",
    });
    return verifyEd25519(null, message, keyObject, signature);
  } catch {
    return false;
  }
}

async function respondLimited(
  ctx: { res: Parameters<RouteHandler>[0]["res"]; requestId: string },
  remainingMs: number,
): Promise<void> {
  json(ctx.res, 429, {
    ...errorPayload("VAULT_UNLOCK_RATE_LIMITED", "rate limited", ctx.requestId),
    remaining_ms: remainingMs,
  });
}

/**
 * `GET /account/vault-unlock/status` — server-authoritative unlock attempt lockout.
 */
export function createAccountVaultUnlockStatusRoute(
  resolveUserId: (req: IncomingMessage) => Promise<string | null>,
  options?: {
    now?: () => number;
    attemptStore?: VaultUnlockAttemptStore;
  },
): RouteHandler {
  const nowFn = options?.now ?? Date.now;
  const store = options?.attemptStore ?? defaultMemoryStore;
  return async (ctx) => {
    const userId = await resolveUserId(ctx.req);
    if (!userId) {
      json(ctx.res, 401, errorPayload("AUTH_REQUIRED", "auth required", ctx.requestId));
      return;
    }
    const remainingMs = await unlockLockRemainingMs(store, userId, nowFn());
    json(ctx.res, 200, {
      locked: remainingMs > 0,
      remaining_ms: remainingMs,
    });
  };
}

/**
 * `POST /account/vault-unlock` — record a proven unlock, or report a failed unlock attempt.
 *
 * Successful stamp requires a signed attestation (identity key). Empty bodies and
 * secret-bearing payloads are rejected and counted toward the per-user limit.
 * A valid attestation clears the limit even if previously locked.
 */
export function createAccountVaultUnlockRoute(
  users: VaultUnlockUsers,
  resolveUserId: (req: IncomingMessage) => Promise<string | null>,
  options?: {
    now?: () => number;
    attemptStore?: VaultUnlockAttemptStore;
    redis?: VaultUnlockAttemptRedis;
    verifyAttestation?: typeof verifyVaultUnlockAttestation;
  },
): RouteHandler {
  const nowFn = options?.now ?? Date.now;
  const store =
    options?.attemptStore ??
    (options?.redis ? createVaultUnlockAttemptStore(options.redis) : defaultMemoryStore);
  const verify = options?.verifyAttestation ?? verifyVaultUnlockAttestation;

  return async (ctx) => {
    const userId = await resolveUserId(ctx.req);
    if (!userId) {
      json(ctx.res, 401, errorPayload("AUTH_REQUIRED", "auth required", ctx.requestId));
      return;
    }

    const now = nowFn();

    let body: unknown = {};
    try {
      body = await readJsonBody<unknown>(ctx.req);
    } catch {
      const limited = await recordUnlockRejection(store, userId, now);
      if (limited.limited) {
        await respondLimited(ctx, limited.remainingMs);
        return;
      }
      json(
        ctx.res,
        400,
        errorPayload("INVALID_VAULT_UNLOCK", "invalid vault unlock payload", ctx.requestId),
      );
      return;
    }

    if (isFailureReportBody(body)) {
      const limited = await recordUnlockRejection(store, userId, now);
      if (limited.limited) {
        await respondLimited(ctx, limited.remainingMs);
        return;
      }
      json(ctx.res, 200, { recorded: false, locked: false, remaining_ms: 0 });
      return;
    }

    const attestation = parseAttestation(body);
    if (attestation) {
      const user = await users.findById(userId);
      if (!user?.publicKey) {
        const limited = await recordUnlockRejection(store, userId, now);
        if (limited.limited) {
          await respondLimited(ctx, limited.remainingMs);
          return;
        }
        json(
          ctx.res,
          400,
          errorPayload("INVALID_VAULT_UNLOCK", "invalid vault unlock payload", ctx.requestId),
        );
        return;
      }
      const ok = verify({
        userId,
        publicKeyBase64: user.publicKey,
        attestation,
        now,
      });
      if (!ok) {
        const limited = await recordUnlockRejection(store, userId, now);
        if (limited.limited) {
          await respondLimited(ctx, limited.remainingMs);
          return;
        }
        json(
          ctx.res,
          400,
          errorPayload("INVALID_VAULT_UNLOCK", "invalid vault unlock payload", ctx.requestId),
        );
        return;
      }

      const updated = await users.recordVaultUnlock(userId);
      if (!updated) {
        json(ctx.res, 404, errorPayload("USER_NOT_FOUND", "user not found", ctx.requestId));
        return;
      }
      await clearUnlockFailures(store, userId);
      json(ctx.res, 200, { recorded: true });
      return;
    }

    // Empty body, secrets, or other invalid payloads never stamp unlock.
    const limited = await recordUnlockRejection(store, userId, now);
    if (limited.limited) {
      await respondLimited(ctx, limited.remainingMs);
      return;
    }
    json(
      ctx.res,
      400,
      errorPayload("INVALID_VAULT_UNLOCK", "invalid vault unlock payload", ctx.requestId),
    );
  };
}
