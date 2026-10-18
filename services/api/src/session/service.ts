import { createHash, randomBytes } from "node:crypto";
import type { ApiConfig } from "../config.ts";
import type { SessionsRepository } from "../storage/repositories.ts";

export class SessionServiceError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, statusCode: number, message: string) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
  }
}

export interface SessionServiceDeps {
  sessions: Pick<
    SessionsRepository,
    | "createSession"
    | "findValidByTokenHash"
    | "bindDevice"
    | "deleteByDeviceId"
    | "deleteByTokenHash"
  >;
  config: Pick<ApiConfig, "sessionTtlSeconds">;
  now?: () => Date;
}

export class SessionService {
  private readonly sessions: SessionServiceDeps["sessions"];
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
    deviceId?: string | null,
  ): Promise<{ accessToken: string; expiresAt: string }> {
    const accessToken = this.mintAccessToken();
    const now = this.now();
    const expires = new Date(now.getTime() + this.config.sessionTtlSeconds * 1000);
    const expiresAt = expires.toISOString();
    await this.sessions.createSession({
      userId,
      tokenHash: this.hashAccessToken(accessToken),
      expiresAtIso: expiresAt,
      deviceId: deviceId ?? null,
    });
    return { accessToken, expiresAt };
  }

  async resolveAccessToken(
    token: string,
  ): Promise<{ userId: string; sessionId: string; deviceId: string | null } | null> {
    const trimmed = token.trim();
    if (!trimmed) {
      return null;
    }
    const nowIso = this.now().toISOString();
    const row = await this.sessions.findValidByTokenHash(
      this.hashAccessToken(trimmed),
      nowIso,
    );
    return row
      ? { userId: row.userId, sessionId: row.id, deviceId: row.deviceId }
      : null;
  }

  /** Attach a registered device to the caller's current access-token session. */
  async bindAccessTokenDevice(
    accessToken: string,
    userId: string,
    deviceId: string,
  ): Promise<void> {
    const trimmed = accessToken.trim();
    if (!trimmed || !deviceId) {
      return;
    }
    await this.sessions.bindDevice({
      tokenHash: this.hashAccessToken(trimmed),
      userId,
      deviceId,
    });
  }

  /** End all server sessions bound to a device (revoke / sign-out). */
  async revokeSessionsForDevice(userId: string, deviceId: string): Promise<void> {
    await this.sessions.deleteByDeviceId({ userId, deviceId });
  }

  /** End the session for a specific access token (sign-out when unbound). */
  async revokeAccessToken(accessToken: string): Promise<void> {
    const trimmed = accessToken.trim();
    if (!trimmed) {
      return;
    }
    await this.sessions.deleteByTokenHash(this.hashAccessToken(trimmed));
  }
}
