import { createHash, randomBytes } from "node:crypto";
import type { SessionService } from "../session/service.ts";

export class ExtensionAuthError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, statusCode: number, message: string) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
  }
}

export const EXTENSION_AUTH_CLIENT_ID = "okkey_extension";

/** Short-lived authorization codes for extension PKCE (seconds). */
const AUTH_CODE_TTL_SECONDS = 120;

export type ExtensionAuthRedis = {
  setWithTtl(key: string, value: string, ttlSeconds: number): Promise<void>;
  get(key: string): Promise<string | null>;
  del(key: string): Promise<number>;
};

export interface ExtensionAuthServiceDeps {
  redis: ExtensionAuthRedis;
  sessionService: Pick<SessionService, "createSession">;
  now?: () => Date;
  generateCode?: () => string;
}

type StoredAuthCode = {
  userId: string;
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: "S256";
  createdAt: string;
};

function authCodeRedisKey(code: string): string {
  return `auth:extension:code:${code}`;
}

function normalizeRedirectUri(uri: string): string {
  return uri.trim();
}

/**
 * Allow extension callback URLs only:
 * - chrome-extension://… / moz-extension://…
 * - https://*.chromiumapp.org/… (chrome.identity)
 */
export function isAllowedExtensionRedirectUri(uri: string): boolean {
  const trimmed = normalizeRedirectUri(uri);
  if (!trimmed) {
    return false;
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === "chrome-extension:" || parsed.protocol === "moz-extension:") {
      // Unpacked Chromium ids change per install path — allow any real id.
      // Reject Chrome's sentinel host used when web_accessible_resources blocks navigation.
      const host = parsed.hostname.trim().toLowerCase();
      if (!host || host === "invalid") {
        return false;
      }
      return /(?:^|\/)auth-callback\.html$/u.test(parsed.pathname);
    }
    if (parsed.protocol === "https:" && parsed.hostname.endsWith(".chromiumapp.org")) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

function isValidCodeChallenge(value: string): boolean {
  // base64url S256 challenge: 43 chars typically, allow 43–128
  return /^[A-Za-z0-9_-]{43,128}$/.test(value.trim());
}

function sha256Base64Url(input: string): string {
  const digest = createHash("sha256").update(input, "utf8").digest();
  return digest
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/u, "");
}

function mintAuthCode(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * Issues a one-time auth code bound to PKCE challenge after the user has a
 * Bearer session on web. Does **not** unlock vault — session handoff only.
 */
export class ExtensionAuthService {
  private readonly redis: ExtensionAuthRedis;
  private readonly sessionService: Pick<SessionService, "createSession">;
  private readonly now: () => Date;
  private readonly generateCode: () => string;

  constructor(deps: ExtensionAuthServiceDeps) {
    this.redis = deps.redis;
    this.sessionService = deps.sessionService;
    this.now = deps.now ?? (() => new Date());
    this.generateCode = deps.generateCode ?? mintAuthCode;
  }

  async issueAuthCode(input: {
    userId: string;
    clientId: string;
    redirectUri: string;
    codeChallenge: string;
    codeChallengeMethod?: string;
  }): Promise<{ code: string; expiresAt: string; expiresIn: number }> {
    const clientId = input.clientId.trim();
    if (clientId !== EXTENSION_AUTH_CLIENT_ID) {
      throw new ExtensionAuthError("EXTENSION_AUTH_INVALID_CLIENT", 400, "invalid client_id");
    }
    const redirectUri = normalizeRedirectUri(input.redirectUri);
    if (!isAllowedExtensionRedirectUri(redirectUri)) {
      throw new ExtensionAuthError(
        "EXTENSION_AUTH_INVALID_REDIRECT",
        400,
        "redirect_uri is not allowed",
      );
    }
    const method = (input.codeChallengeMethod ?? "S256").trim().toUpperCase();
    if (method !== "S256") {
      throw new ExtensionAuthError(
        "EXTENSION_AUTH_INVALID_CHALLENGE",
        400,
        "code_challenge_method must be S256",
      );
    }
    const codeChallenge = input.codeChallenge.trim();
    if (!isValidCodeChallenge(codeChallenge)) {
      throw new ExtensionAuthError(
        "EXTENSION_AUTH_INVALID_CHALLENGE",
        400,
        "invalid code_challenge",
      );
    }
    const userId = input.userId.trim();
    if (!userId) {
      throw new ExtensionAuthError("EXTENSION_AUTH_UNAUTHORIZED", 401, "authentication required");
    }

    const code = this.generateCode();
    const createdAt = this.now().toISOString();
    const expiresAt = new Date(this.now().getTime() + AUTH_CODE_TTL_SECONDS * 1000).toISOString();
    const payload: StoredAuthCode = {
      userId,
      clientId,
      redirectUri,
      codeChallenge,
      codeChallengeMethod: "S256",
      createdAt,
    };
    await this.redis.setWithTtl(
      authCodeRedisKey(code),
      JSON.stringify(payload),
      AUTH_CODE_TTL_SECONDS,
    );
    return { code, expiresAt, expiresIn: AUTH_CODE_TTL_SECONDS };
  }

  async exchangeAuthCode(input: {
    clientId: string;
    redirectUri: string;
    code: string;
    codeVerifier: string;
  }): Promise<{
    accessToken: string;
    expiresAt: string;
    userId: string;
    tokenType: "Bearer";
  }> {
    const clientId = input.clientId.trim();
    if (clientId !== EXTENSION_AUTH_CLIENT_ID) {
      throw new ExtensionAuthError("EXTENSION_AUTH_INVALID_CLIENT", 400, "invalid client_id");
    }
    const redirectUri = normalizeRedirectUri(input.redirectUri);
    if (!isAllowedExtensionRedirectUri(redirectUri)) {
      throw new ExtensionAuthError(
        "EXTENSION_AUTH_INVALID_REDIRECT",
        400,
        "redirect_uri is not allowed",
      );
    }
    const code = input.code.trim();
    const codeVerifier = input.codeVerifier.trim();
    if (!code || !codeVerifier) {
      throw new ExtensionAuthError(
        "EXTENSION_AUTH_BAD_REQUEST",
        400,
        "code and code_verifier are required",
      );
    }
    if (codeVerifier.length < 43 || codeVerifier.length > 128) {
      throw new ExtensionAuthError(
        "EXTENSION_AUTH_INVALID_VERIFIER",
        400,
        "invalid code_verifier",
      );
    }

    const raw = await this.redis.get(authCodeRedisKey(code));
    if (!raw) {
      throw new ExtensionAuthError(
        "EXTENSION_AUTH_INVALID_CODE",
        400,
        "invalid or expired authorization code",
      );
    }
    // One-time use
    await this.redis.del(authCodeRedisKey(code));

    let stored: StoredAuthCode;
    try {
      stored = JSON.parse(raw) as StoredAuthCode;
    } catch {
      throw new ExtensionAuthError("EXTENSION_AUTH_INVALID_CODE", 400, "invalid authorization code");
    }

    if (stored.clientId !== clientId || stored.redirectUri !== redirectUri) {
      throw new ExtensionAuthError(
        "EXTENSION_AUTH_MISMATCH",
        400,
        "client_id or redirect_uri mismatch",
      );
    }

    const expectedChallenge = sha256Base64Url(codeVerifier);
    if (expectedChallenge !== stored.codeChallenge) {
      throw new ExtensionAuthError(
        "EXTENSION_AUTH_INVALID_VERIFIER",
        400,
        "PKCE verification failed",
      );
    }

    const session = await this.sessionService.createSession(stored.userId);
    return {
      accessToken: session.accessToken,
      expiresAt: session.expiresAt,
      userId: stored.userId,
      tokenType: "Bearer",
    };
  }
}
