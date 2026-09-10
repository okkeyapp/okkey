import type { IncomingMessage } from "node:http";
import { json, readJsonBody, type RouteHandler } from "../http.ts";
import type { UsersRepository } from "../storage/repositories.ts";

function errorPayload(code: string, message: string, requestId: string) {
  return { error: code, message, requestId };
}

type AccountProfilePatchBody = {
  first_name?: unknown;
  last_name?: unknown;
  locale?: unknown;
  billing_region?: unknown;
  vault_idle_lock_seconds?: unknown;
};

const MIN_IDLE_SECONDS = 60;
const MAX_IDLE_SECONDS = 86_400;

function profilePayload(row: {
  email: string;
  firstName: string | null;
  lastName: string | null;
  locale: string | null;
  billingRegion: string | null;
  vaultIdleLockSeconds: number;
  masterPasswordChangedAt: string;
}) {
  return {
    email: row.email,
    first_name: row.firstName,
    last_name: row.lastName,
    locale: row.locale,
    billing_region: row.billingRegion,
    vault_idle_lock_seconds: row.vaultIdleLockSeconds,
    master_password_changed_at: row.masterPasswordChangedAt,
  };
}

function parseOptionalProfileName(value: unknown): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed.length > 80 || /[\u0000-\u001f\u007f]/u.test(trimmed)) {
    return undefined;
  }
  return trimmed;
}

function parseLocale(value: unknown): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  if (value === "en" || value === "ru") {
    return value;
  }
  return undefined;
}

function parseBillingRegion(value: unknown): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  if (typeof value !== "string") {
    return undefined;
  }
  const region = value.trim().toUpperCase();
  return /^[A-Z]{2}$/u.test(region) ? region : undefined;
}

function parseVaultIdleLockSeconds(value: unknown): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isInteger(n) || n < MIN_IDLE_SECONDS || n > MAX_IDLE_SECONDS) {
    return undefined;
  }
  return n;
}

export function createAccountProfileRoute(
  users: Pick<UsersRepository, "loadAccountProfile" | "updateAccountProfile">,
  resolveUserId: (req: IncomingMessage) => Promise<string | null>,
): RouteHandler {
  return async (ctx) => {
    const userId = await resolveUserId(ctx.req);
    if (!userId) {
      json(ctx.res, 401, errorPayload("AUTH_REQUIRED", "auth required", ctx.requestId));
      return;
    }
    const row = await users.loadAccountProfile(userId);
    if (!row) {
      json(ctx.res, 404, errorPayload("USER_NOT_FOUND", "user not found", ctx.requestId));
      return;
    }
    if (ctx.req.method === "PATCH") {
      const body = await readJsonBody<AccountProfilePatchBody>(ctx.req);
      const firstName = parseOptionalProfileName(body.first_name);
      const lastName = parseOptionalProfileName(body.last_name);
      const locale = parseLocale(body.locale);
      const billingRegion = parseBillingRegion(body.billing_region);
      const vaultIdleLockSeconds = parseVaultIdleLockSeconds(body.vault_idle_lock_seconds);

      const invalidFirstName = body.first_name !== undefined && firstName === undefined;
      const invalidLastName = body.last_name !== undefined && lastName === undefined;
      const invalidLocale = body.locale !== undefined && locale === undefined;
      const invalidRegion = body.billing_region !== undefined && billingRegion === undefined;
      const invalidIdle =
        body.vault_idle_lock_seconds !== undefined && vaultIdleLockSeconds === undefined;
      if (invalidFirstName || invalidLastName || invalidLocale || invalidRegion || invalidIdle) {
        json(ctx.res, 400, errorPayload("INVALID_PROFILE_PATCH", "profile patch is invalid", ctx.requestId));
        return;
      }

      const updated = await users.updateAccountProfile(userId, {
        ...(firstName !== undefined ? { firstName } : {}),
        ...(lastName !== undefined ? { lastName } : {}),
        ...(locale !== undefined ? { locale } : {}),
        ...(billingRegion !== undefined ? { billingRegion } : {}),
        ...(vaultIdleLockSeconds !== undefined ? { vaultIdleLockSeconds } : {}),
      });
      if (!updated) {
        json(ctx.res, 404, errorPayload("USER_NOT_FOUND", "user not found", ctx.requestId));
        return;
      }
      json(ctx.res, 200, profilePayload(updated));
      return;
    }

    json(ctx.res, 200, profilePayload(row));
  };
}
