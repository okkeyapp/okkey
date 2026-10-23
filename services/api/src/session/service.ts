import { createHash, randomBytes } from "node:crypto";
import type { ApiConfig } from "../config.ts";
import type { SessionsRepository } from "../storage/repositories.ts";
import {
  isFullSessionScope,
  SESSION_SCOPE_FULL,
  type SessionScope,
} from "./scopes.ts";

export class SessionServiceError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, statusCode: number, message: string) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
  }
}

export interface CreateSessionOptions {
  /** Defaults to `config.sessionTtlSeconds`. */
  ttlSeconds?: number;
  /** Defaults to full session (`null`). */
  scope?: SessionScope;
  /** Bind session to a device when known (e.g. registration device). */
  deviceId?: string | null;
}

export interface ResolvedAccessToken {
  userId: string;
  deviceId: string | null;
  /** `null` = full session. */
  scope: string | null;
}

export interface SessionServiceDeps {
  sessions: SessionsRepository;
  config: Pick<ApiConfig, "sessionTtlSeconds">;
  now?: () => Date;
}

export class SessionService {
  private readonly sessions: SessionsRepository;
  private readonly config: Pick<ApiConfig, "sessionTtlSeconds">;
  private readonly now: () => Date;

  constructor(deps: SessionServiceDeps) {
    this.sessions = deps.sessions;
    this.config = deps.config;
    this.now = deps.now ?? (() => new Date());
  }

  hashAccessToken(token: string): string {
    return createHash("sha256").update(token, "utf8").digest("hex");
  }

  mintAccessToken(): string {
    return randomBytes(32).toString("hex");
  }

  async createSession(
    userId: string,
    options: CreateSessionOptions = {},
  ): Promise<{ accessToken: string; expiresAt: string; scope: SessionScope }> {
    const accessToken = this.mintAccessToken();
    const now = this.now();
    const ttlSeconds = options.ttlSeconds ?? this.config.sessionTtlSeconds;
    const scope = options.scope === undefined ? SESSION_SCOPE_FULL : options.scope;
    const expires = new Date(now.getTime() + ttlSeconds * 1000);
    const expiresAt = expires.toISOString();
    await this.sessions.createSession({
      userId,
      tokenHash: this.hashAccessToken(accessToken),
      expiresAtIso: expiresAt,
      deviceId: options.deviceId ?? null,
      scope,
    });
    return { accessToken, expiresAt, scope };
  }

  async resolveAccessToken(token: string): Promise<ResolvedAccessToken | null> {
    const trimmed = token.trim();
    if (!trimmed) {
      return null;
    }
    const nowIso = this.now().toISOString();
    const row = await this.sessions.findValidByTokenHash(
      this.hashAccessToken(trimmed),
      nowIso,
    );
    if (!row) {
      return null;
    }
    return {
      userId: row.userId,
      deviceId: row.deviceId,
      scope: isFullSessionScope(row.scope) ? null : row.scope,
    };
  }
}
