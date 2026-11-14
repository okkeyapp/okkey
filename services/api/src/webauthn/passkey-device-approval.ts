import { randomBytes } from "node:crypto";
import { generateEntityId } from "../entity-id.ts";
import type { ApiConfig } from "../config.ts";
import type { Logger } from "../logger.ts";
import {
  assertSplitKeyShareB,
  SPLIT_KEY_SHARE_B_MAX_LEN,
} from "../registration/split-key-transport-policy.ts";
import type { DevicesRepository } from "../storage/repositories.ts";
import {
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
  type AuthenticationResponseJSON,
  type AuthenticatorTransportFuture,
  type PublicKeyCredentialRequestOptionsJSON,
} from "@simplewebauthn/server";
import type { WebAuthnCredentialRecord, WebAuthnCredentialsRepository } from "./repository.ts";

/** Must match `PASSKEY_SHARE_WRAP_OVERHEAD` / max length in `@okkey/crypto`. */
const PASSKEY_SHARE_WRAP_OVERHEAD = 41;
const PASSKEY_SHARE_WRAP_MAX_LEN = PASSKEY_SHARE_WRAP_OVERHEAD + SPLIT_KEY_SHARE_B_MAX_LEN;
const PASSKEY_SHARE_WRAP_VERSION = 1;
const PASSKEY_SHARE_WRAP_SALT_LEN = 32;

const OPTIONS_PER_IP = 10;
const OPTIONS_PER_USER = 10;
const VERIFY_PER_IP = 30;
const VERIFY_PER_USER = 10;
const MAX_FAILURES = 5;

export class PasskeyDeviceApprovalError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, statusCode: number, message: string) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
  }
}

type Redis = {
  setWithTtl(key: string, value: string, ttlSeconds: number): Promise<void>;
  get(key: string): Promise<string | null>;
  del(key: string): Promise<number>;
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<boolean>;
  setIfNotExistsWithTtl(key: string, value: string, ttlSeconds: number): Promise<boolean>;
};

type WrapChallenge = {
  kind: "share_wrap";
  challenge: string;
  userId: string;
  credentialRowId: string;
  credentialId: string;
  saltB64: string;
};

type ApprovalChallenge = {
  kind: "passkey_approval";
  challenge: string;
  userId: string;
  deviceId: string;
};

type StoredChallenge = WrapChallenge | ApprovalChallenge;

export interface PasskeyShareWrapCredential {
  credentialId: string;
  shareWrapB64: string;
  shareWrapSaltB64: string;
  shareWrapVersion: number;
}

export interface PasskeyDeviceApprovalDeps {
  redis: Redis;
  credentials: Pick<
    WebAuthnCredentialsRepository,
    "findByIdForUser" | "findByCredentialId" | "listByUserId" | "updateSignCount" | "saveShareWrap" | "clearShareWrap"
  >;
  devices: Pick<DevicesRepository, "approvePendingWithClientShare">;
  config: Pick<
    ApiConfig,
    | "webauthnRpId"
    | "webauthnOrigins"
    | "webauthnChallengeTtlSeconds"
    | "authRateLimitWindowSeconds"
    | "deviceApprovalTtlSeconds"
  >;
  log?: Pick<Logger, "info" | "warn">;
  now?: () => Date;
  generateId?: () => string;
}

function challengeKey(id: string): string {
  return `passkey-approval:challenge:${id}`;
}

function usedKey(id: string): string {
  return `passkey-approval:used:${id}`;
}

function decodeBase64(value: string): Uint8Array | null {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(trimmed)) {
    return null;
  }
  const bytes = Uint8Array.from(Buffer.from(trimmed, "base64"));
  return bytes.length > 0 ? bytes : null;
}

function encodeBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < left.length; i += 1) {
    diff |= left[i]! ^ right[i]!;
  }
  return diff === 0;
}

function isWrapped(record: WebAuthnCredentialRecord): boolean {
  return Boolean(
    record.shareWrap &&
      record.shareWrap.length >= PASSKEY_SHARE_WRAP_OVERHEAD &&
      record.shareWrap.length <= PASSKEY_SHARE_WRAP_MAX_LEN &&
      record.shareWrap[0] === PASSKEY_SHARE_WRAP_VERSION &&
      record.shareWrapSalt &&
      record.shareWrapSalt.length === PASSKEY_SHARE_WRAP_SALT_LEN &&
      record.shareWrapVersion === PASSKEY_SHARE_WRAP_VERSION,
  );
}

/**
 * Passkey device approval. The server checks a fresh user-verified assertion
 * and stores the share the client unwrapped. It never copies another device row.
 */
export class PasskeyDeviceApprovalService {
  private readonly redis: Redis;
  private readonly credentials: PasskeyDeviceApprovalDeps["credentials"];
  private readonly devices: PasskeyDeviceApprovalDeps["devices"];
  private readonly config: PasskeyDeviceApprovalDeps["config"];
  private readonly log?: PasskeyDeviceApprovalDeps["log"];
  private readonly now: () => Date;
  private readonly generateId: () => string;

  constructor(deps: PasskeyDeviceApprovalDeps) {
    this.redis = deps.redis;
    this.credentials = deps.credentials;
    this.devices = deps.devices;
    this.config = deps.config;
    this.log = deps.log;
    this.now = deps.now ?? (() => new Date());
    this.generateId = deps.generateId ?? (() => generateEntityId());
  }

  async shareWrapOptions(input: {
    userId: string;
    credentialRowId: string;
    requestIp: string;
  }): Promise<{
    challengeId: string;
    options: PublicKeyCredentialRequestOptionsJSON;
    prfSaltB64: string;
    credentialId: string;
  }> {
    await this.consumeRateLimit(
      `passkey-approval:rl:wrap-options:ip:${input.requestIp}`,
      OPTIONS_PER_IP,
      input,
    );
    await this.consumeRateLimit(
      `passkey-approval:rl:wrap-options:user:${input.userId}`,
      OPTIONS_PER_USER,
      input,
    );
    const credential = await this.credentials.findByIdForUser(input.userId, input.credentialRowId);
    if (!credential || credential.userId !== input.userId) {
      throw new PasskeyDeviceApprovalError("WEBAUTHN_CREDENTIAL_NOT_FOUND", 404, "credential not found");
    }
    const salt = new Uint8Array(randomBytes(PASSKEY_SHARE_WRAP_SALT_LEN));
    const options = await this.authenticationOptions([credential]);
    const challengeId = this.generateId();
    const payload: WrapChallenge = {
      kind: "share_wrap",
      challenge: options.challenge,
      userId: input.userId,
      credentialRowId: credential.id,
      credentialId: credential.credentialId,
      saltB64: encodeBase64(salt),
    };
    await this.redis.setWithTtl(
      challengeKey(challengeId),
      JSON.stringify(payload),
      this.config.webauthnChallengeTtlSeconds,
    );
    return {
      challengeId,
      options,
      prfSaltB64: payload.saltB64,
      credentialId: credential.credentialId,
    };
  }

  async shareWrapVerify(input: {
    userId: string;
    credentialRowId: string;
    challengeId: string;
    response: AuthenticationResponseJSON;
    shareWrapB64: string;
    requestIp: string;
  }): Promise<void> {
    const failKey = `passkey-approval:fail:wrap:${input.userId}:${input.credentialRowId}`;
    await this.assertFailureBudget(failKey, input);
    await this.consumeRateLimit(
      `passkey-approval:rl:wrap-verify:ip:${input.requestIp}`,
      VERIFY_PER_IP,
      input,
    );
    await this.consumeRateLimit(
      `passkey-approval:rl:wrap-verify:user:${input.userId}`,
      VERIFY_PER_USER,
      input,
    );
    const wrap = decodeBase64(input.shareWrapB64);
    if (
      !wrap ||
      wrap.length < PASSKEY_SHARE_WRAP_OVERHEAD ||
      wrap.length > PASSKEY_SHARE_WRAP_MAX_LEN ||
      wrap[0] !== PASSKEY_SHARE_WRAP_VERSION
    ) {
      this.audit("wrap_rejected", input);
      throw new PasskeyDeviceApprovalError(
        "PASSKEY_SHARE_WRAP_REJECTED",
        400,
        "share wrap is malformed",
      );
    }
    const challenge = await this.consumeChallenge(input.challengeId, input);
    if (challenge.kind !== "share_wrap") {
      this.audit("replay", input);
      throw new PasskeyDeviceApprovalError("PASSKEY_APPROVAL_REPLAY", 400, "challenge already used");
    }
    if (challenge.userId !== input.userId || challenge.credentialRowId !== input.credentialRowId) {
      await this.noteFailure(failKey, input);
      throw new PasskeyDeviceApprovalError(
        "PASSKEY_APPROVAL_VERIFICATION_FAILED",
        400,
        "passkey verification failed",
      );
    }
    const credential = await this.credentials.findByIdForUser(input.userId, input.credentialRowId);
    if (!credential || credential.credentialId !== challenge.credentialId) {
      await this.noteFailure(failKey, input);
      throw new PasskeyDeviceApprovalError("WEBAUTHN_CREDENTIAL_NOT_FOUND", 404, "credential not found");
    }
    if (input.response.id !== credential.credentialId) {
      await this.noteFailure(failKey, input);
      throw new PasskeyDeviceApprovalError(
        "PASSKEY_APPROVAL_VERIFICATION_FAILED",
        400,
        "passkey verification failed",
      );
    }
    const verified = await this.verifyAssertion(credential, challenge.challenge, input.response);
    if (!verified.ok) {
      await this.noteFailure(failKey, input);
      throw new PasskeyDeviceApprovalError(
        "PASSKEY_APPROVAL_VERIFICATION_FAILED",
        400,
        "passkey verification failed",
      );
    }
    const salt = decodeBase64(challenge.saltB64);
    if (!salt || salt.length !== PASSKEY_SHARE_WRAP_SALT_LEN) {
      throw new PasskeyDeviceApprovalError("PASSKEY_SHARE_WRAP_REJECTED", 400, "share wrap is malformed");
    }
    const saved = await this.credentials.saveShareWrap({
      userId: input.userId,
      credentialRowId: credential.id,
      shareWrap: wrap,
      shareWrapSalt: salt,
    });
    if (!saved) {
      throw new PasskeyDeviceApprovalError("WEBAUTHN_CREDENTIAL_NOT_FOUND", 404, "credential not found");
    }
    await this.credentials.updateSignCount(credential.id, verified.newCounter);
    await this.redis.del(failKey);
    this.audit("wrap_saved", { ...input, credentialRowId: credential.id });
  }

  async clearShareWrap(input: {
    userId: string;
    credentialRowId: string;
    requestIp: string;
  }): Promise<void> {
    const credential = await this.credentials.findByIdForUser(input.userId, input.credentialRowId);
    if (!credential || credential.userId !== input.userId) {
      throw new PasskeyDeviceApprovalError("WEBAUTHN_CREDENTIAL_NOT_FOUND", 404, "credential not found");
    }
    const cleared = await this.credentials.clearShareWrap(input.userId, input.credentialRowId);
    if (!cleared) {
      throw new PasskeyDeviceApprovalError(
        "PASSKEY_SHARE_WRAP_MISSING",
        404,
        "no passkey has a share wrap",
      );
    }
    this.audit("wrap_cleared", { ...input, credentialRowId: credential.id });
  }

  async approvalOptions(input: {
    userId: string;
    deviceId: string;
    requestIp: string;
  }): Promise<{
    challengeId: string;
    options: PublicKeyCredentialRequestOptionsJSON;
    prfSaltB64: string;
    credentials: PasskeyShareWrapCredential[];
  }> {
    const failKey = `passkey-approval:fail:${input.userId}:${input.deviceId}`;
    await this.assertFailureBudget(failKey, input);
    await this.consumeRateLimit(
      `passkey-approval:rl:options:ip:${input.requestIp}`,
      OPTIONS_PER_IP,
      input,
    );
    await this.consumeRateLimit(
      `passkey-approval:rl:options:user:${input.userId}`,
      OPTIONS_PER_USER,
      input,
    );
    const records = await this.credentials.listByUserId(input.userId);
    const wrapped = records.filter(isWrapped);
    if (wrapped.length === 0) {
      this.audit("wrap_missing", input);
      throw new PasskeyDeviceApprovalError(
        "PASSKEY_SHARE_WRAP_MISSING",
        404,
        "no passkey has a share wrap",
      );
    }
    const salt = wrapped[wrapped.length - 1]!.shareWrapSalt!;
    const group = wrapped.filter((record) => sameBytes(record.shareWrapSalt!, salt));
    const options = await this.authenticationOptions(group);
    const challengeId = this.generateId();
    const payload: ApprovalChallenge = {
      kind: "passkey_approval",
      challenge: options.challenge,
      userId: input.userId,
      deviceId: input.deviceId,
    };
    await this.redis.setWithTtl(
      challengeKey(challengeId),
      JSON.stringify(payload),
      this.config.webauthnChallengeTtlSeconds,
    );
    return {
      challengeId,
      options,
      prfSaltB64: encodeBase64(salt),
      credentials: group.map((record) => ({
        credentialId: record.credentialId,
        shareWrapB64: encodeBase64(record.shareWrap!),
        shareWrapSaltB64: encodeBase64(record.shareWrapSalt!),
        shareWrapVersion: PASSKEY_SHARE_WRAP_VERSION,
      })),
    };
  }

  async approvalVerify(input: {
    userId: string;
    deviceId: string;
    challengeId: string;
    response: AuthenticationResponseJSON;
    deviceShareB64: string;
    requestIp: string;
  }): Promise<{ deviceId: string; status: "trusted" }> {
    const failKey = `passkey-approval:fail:${input.userId}:${input.deviceId}`;
    await this.assertFailureBudget(failKey, input);
    await this.consumeRateLimit(
      `passkey-approval:rl:verify:ip:${input.requestIp}`,
      VERIFY_PER_IP,
      input,
    );
    await this.consumeRateLimit(
      `passkey-approval:rl:verify:user:${input.userId}`,
      VERIFY_PER_USER,
      input,
    );
    let deviceShare: Uint8Array;
    try {
      const decoded = decodeBase64(input.deviceShareB64);
      if (!decoded) {
        throw new Error("invalid device_share");
      }
      assertSplitKeyShareB(decoded);
      deviceShare = decoded;
    } catch {
      this.audit("share_rejected", input);
      throw new PasskeyDeviceApprovalError("DEVICE_BAD_REQUEST", 400, "invalid device_share");
    }
    const challenge = await this.consumeChallenge(input.challengeId, input);
    if (challenge.kind !== "passkey_approval" || challenge.userId !== input.userId) {
      this.audit("replay", input);
      throw new PasskeyDeviceApprovalError("PASSKEY_APPROVAL_REPLAY", 400, "challenge already used");
    }
    if (challenge.deviceId !== input.deviceId) {
      await this.noteFailure(failKey, input);
      throw new PasskeyDeviceApprovalError(
        "PASSKEY_APPROVAL_VERIFICATION_FAILED",
        400,
        "passkey verification failed",
      );
    }
    const credential = await this.credentials.findByCredentialId(input.response.id);
    if (!credential || credential.userId !== input.userId || !isWrapped(credential)) {
      await this.noteFailure(failKey, input);
      throw new PasskeyDeviceApprovalError(
        "PASSKEY_APPROVAL_VERIFICATION_FAILED",
        400,
        "passkey verification failed",
      );
    }
    const verified = await this.verifyAssertion(credential, challenge.challenge, input.response);
    if (!verified.ok) {
      await this.noteFailure(failKey, input);
      throw new PasskeyDeviceApprovalError(
        "PASSKEY_APPROVAL_VERIFICATION_FAILED",
        400,
        "passkey verification failed",
      );
    }
    const now = this.now();
    const written = await this.devices.approvePendingWithClientShare({
      userId: input.userId,
      deviceId: input.deviceId,
      deviceShare,
      now: now.toISOString(),
      pendingCreatedBefore: new Date(
        now.getTime() - this.config.deviceApprovalTtlSeconds * 1000,
      ).toISOString(),
    });
    if (written === "approved") {
      await this.credentials.updateSignCount(credential.id, verified.newCounter);
      await this.redis.del(failKey);
      this.audit("approved", { ...input, credentialRowId: credential.id });
      return { deviceId: input.deviceId, status: "trusted" };
    }
    if (written === "expired") {
      this.audit("expired", input);
      throw new PasskeyDeviceApprovalError("PASSKEY_APPROVAL_EXPIRED", 410, "device approval expired");
    }
    if (written === "not_pending") {
      this.audit("already_resolved", input);
      throw new PasskeyDeviceApprovalError(
        "PASSKEY_APPROVAL_ALREADY_RESOLVED",
        409,
        "device approval already resolved",
      );
    }
    this.audit("not_found", input);
    throw new PasskeyDeviceApprovalError("DEVICE_APPROVAL_NOT_FOUND", 404, "pending device not found");
  }

  private async authenticationOptions(
    credentials: WebAuthnCredentialRecord[],
  ): Promise<PublicKeyCredentialRequestOptionsJSON> {
    return generateAuthenticationOptions({
      rpID: this.config.webauthnRpId,
      allowCredentials: credentials.map((credential) => ({
        id: credential.credentialId,
        transports: credential.transports as AuthenticatorTransportFuture[],
      })),
      userVerification: "required",
    });
  }

  private async verifyAssertion(
    credential: WebAuthnCredentialRecord,
    expectedChallenge: string,
    response: AuthenticationResponseJSON,
  ): Promise<{ ok: true; newCounter: number } | { ok: false }> {
    try {
      const verification = await verifyAuthenticationResponse({
        response,
        expectedChallenge,
        expectedOrigin: this.config.webauthnOrigins,
        expectedRPID: this.config.webauthnRpId,
        credential: {
          id: credential.credentialId,
          publicKey: credential.publicKey,
          counter: credential.signCount,
          transports: credential.transports as AuthenticatorTransportFuture[],
        },
        requireUserVerification: true,
      });
      if (!verification.verified) {
        return { ok: false };
      }
      return { ok: true, newCounter: verification.authenticationInfo.newCounter };
    } catch {
      return { ok: false };
    }
  }

  private async consumeChallenge(
    challengeId: string,
    audit: { userId: string; requestIp: string; deviceId?: string; credentialRowId?: string },
  ): Promise<StoredChallenge> {
    const key = challengeKey(challengeId);
    const raw = await this.redis.get(key);
    if (!raw) {
      const used = await this.redis.get(usedKey(challengeId));
      this.audit(used ? "replay" : "challenge_expired", audit);
      throw new PasskeyDeviceApprovalError(
        used ? "PASSKEY_APPROVAL_REPLAY" : "PASSKEY_APPROVAL_CHALLENGE_EXPIRED",
        400,
        used ? "challenge already used" : "challenge expired",
      );
    }
    const claimed = await this.redis.setIfNotExistsWithTtl(
      usedKey(challengeId),
      "1",
      this.config.webauthnChallengeTtlSeconds,
    );
    if (!claimed) {
      await this.redis.del(key);
      this.audit("replay", audit);
      throw new PasskeyDeviceApprovalError("PASSKEY_APPROVAL_REPLAY", 400, "challenge already used");
    }
    await this.redis.del(key);
    try {
      const parsed = JSON.parse(raw) as StoredChallenge;
      if (parsed.kind !== "share_wrap" && parsed.kind !== "passkey_approval") {
        throw new Error("bad challenge");
      }
      return parsed;
    } catch (error) {
      if (error instanceof PasskeyDeviceApprovalError) {
        throw error;
      }
      this.audit("challenge_expired", audit);
      throw new PasskeyDeviceApprovalError(
        "PASSKEY_APPROVAL_CHALLENGE_EXPIRED",
        400,
        "challenge expired",
      );
    }
  }

  private async consumeRateLimit(
    key: string,
    limit: number,
    audit: { userId: string; requestIp: string; deviceId?: string; credentialRowId?: string },
  ): Promise<void> {
    const count = await this.redis.incr(key);
    if (count === 1) {
      await this.redis.expire(key, this.config.authRateLimitWindowSeconds);
    }
    if (count > limit) {
      this.audit("rate_limited", audit);
      throw new PasskeyDeviceApprovalError("PASSKEY_APPROVAL_RATE_LIMITED", 429, "rate limited");
    }
  }

  private async assertFailureBudget(
    key: string,
    audit: { userId: string; requestIp: string; deviceId?: string; credentialRowId?: string },
  ): Promise<void> {
    const raw = await this.redis.get(key);
    const count = raw ? Number(raw) : 0;
    if (Number.isFinite(count) && count >= MAX_FAILURES) {
      this.audit("rate_limited", audit);
      throw new PasskeyDeviceApprovalError("PASSKEY_APPROVAL_RATE_LIMITED", 429, "rate limited");
    }
  }

  private async noteFailure(
    key: string,
    audit: { userId: string; requestIp: string; deviceId?: string; credentialRowId?: string },
  ): Promise<void> {
    const count = await this.redis.incr(key);
    if (count === 1) {
      await this.redis.expire(key, this.config.authRateLimitWindowSeconds);
    }
    this.audit("verification_failed", audit);
  }

  private audit(
    outcome: string,
    fields: { userId: string; requestIp: string; deviceId?: string; credentialRowId?: string },
  ): void {
    this.log?.info("passkey_device_approval", {
      outcome,
      userId: fields.userId,
      requestIp: fields.requestIp,
      ...(fields.deviceId ? { deviceId: fields.deviceId } : {}),
      ...(fields.credentialRowId ? { credentialRowId: fields.credentialRowId } : {}),
    });
  }
}
