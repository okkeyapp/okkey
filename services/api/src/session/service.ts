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

  async createSession(userId: string): Promise<{ accessToken: string; expiresAt: string }> {
    const accessToken = this.mintAccessToken();
    const now = this.now();
    const expires = new Date(now.getTime() + this.config.sessionTtlSeconds * 1000);
    const expiresAt = expires.toISOString();
    await this.sessions.createSession({
      userId,
      tokenHash: this.hashAccessToken(accessToken),
      expiresAtIso: expiresAt,
    });
    return { accessToken, expiresAt };
  }

  async resolveAccessToken(token: string): Promise<{ userId: string } | null> {
    const trimmed = token.trim();
    if (!trimmed) {
      return null;
    }
    const nowIso = this.now().toISOString();
    const row = await this.sessions.findValidByTokenHash(
      this.hashAccessToken(trimmed),
      nowIso,
    );
    return row ? { userId: row.userId } : null;
  }
}
