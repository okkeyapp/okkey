import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type AuthenticatorTransportFuture,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { generateEntityId } from "../entity-id.ts";
import type { ApiConfig } from "../config.ts";
import type { AuthService, AuthStatePayload } from "../auth/service.ts";
import type { UserRecord, UsersRepository } from "../storage/repositories.ts";
import {
  attachmentToPrimaryMethod,
  primaryMethodToAttachment,
  toPublicCredentialDto,
  type PrimaryLoginMethod,
  type WebAuthnAttachment,
  type WebAuthnCredentialPublicDto,
  type WebAuthnCredentialsRepository,
} from "./repository.ts";

export class WebAuthnError extends Error {
  readonly code: string;
  readonly statusCode: number;
  readonly details?: Record<string, unknown>;

  constructor(
    code: string,
    statusCode: number,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

type ChallengeKind = "registration" | "authentication";

interface ChallengePayload {
  kind: ChallengeKind;
  challenge: string;
  userId: string | null;
  email: string | null;
  attachment: WebAuthnAttachment | null;
  createdAt: string;
}

export interface LoginMethodsResponse {
  primary: PrimaryLoginMethod;
  email: string;
  passkeys: WebAuthnCredentialPublicDto[];
  hardwareKeys: WebAuthnCredentialPublicDto[];
}

export interface LoginDiscoverResponse {
  primary: PrimaryLoginMethod;
  methods: PrimaryLoginMethod[];
}

export interface WebAuthnLoginConfirmResult {
  authStateId: string;
  userExists: true;
  nextStep: "device_check" | "two_factor";
}

export interface WebAuthnServiceDeps {
  redis: {
    setWithTtl(key: string, value: string, ttlSeconds: number): Promise<void>;
    get(key: string): Promise<string | null>;
    del(key: string): Promise<number>;
  };
  credentials: WebAuthnCredentialsRepository;
  users: Pick<UsersRepository, "findByEmail" | "findById" | "isTwoFactorEnabled">;
  authService: Pick<AuthService, "removeAuthState"> & {
    createAuthStateForExistingUser(params: {
      email: string;
      userId: string;
      pendingTwoFactor: boolean;
    }): Promise<{ authStateId: string; nextStep: "device_check" | "two_factor" }>;
  };
  config: ApiConfig;
  now?: () => Date;
  generateId?: () => string;
}

function challengeKey(id: string): string {
  return `webauthn:challenge:${id}`;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function defaultCredentialName(attachment: WebAuthnAttachment): string {
  return attachment === "platform" ? "Passkey" : "Security key";
}

export class WebAuthnService {
  private readonly redis: WebAuthnServiceDeps["redis"];
  private readonly credentials: WebAuthnCredentialsRepository;
  private readonly users: WebAuthnServiceDeps["users"];
  private readonly authService: WebAuthnServiceDeps["authService"];
  private readonly config: ApiConfig;
  private readonly now: () => Date;
  private readonly generateId: () => string;

  constructor(deps: WebAuthnServiceDeps) {
    this.redis = deps.redis;
    this.credentials = deps.credentials;
    this.users = deps.users;
    this.authService = deps.authService;
    this.config = deps.config;
    this.now = deps.now ?? (() => new Date());
    this.generateId = deps.generateId ?? (() => generateEntityId());
  }

  async getLoginMethods(userId: string): Promise<LoginMethodsResponse> {
    const user = await this.users.findById(userId);
    if (!user) {
      throw new WebAuthnError("USER_NOT_FOUND", 404, "user not found");
    }
    const all = await this.credentials.listByUserId(userId);
    let primary = await this.credentials.getPrimaryLoginMethod(userId);
    primary = await this.normalizePrimary(userId, primary, all.map((c) => c.authenticatorAttachment));
    return {
      primary,
      email: user.email,
      passkeys: all
        .filter((c) => c.authenticatorAttachment === "platform")
        .map(toPublicCredentialDto),
      hardwareKeys: all
        .filter((c) => c.authenticatorAttachment === "cross-platform")
        .map(toPublicCredentialDto),
    };
  }

  async setPrimary(userId: string, primary: PrimaryLoginMethod): Promise<LoginMethodsResponse> {
    const methods = await this.getLoginMethods(userId);
    const available = this.availableMethods(methods);
    if (!available.includes(primary)) {
      throw new WebAuthnError(
        "WEBAUTHN_PRIMARY_INVALID",
        400,
        "primary method is not available",
      );
    }
    await this.credentials.setPrimaryLoginMethod(userId, primary);
    return this.getLoginMethods(userId);
  }

  async registrationOptions(
    userId: string,
    attachment: WebAuthnAttachment,
  ): Promise<{ challengeId: string; options: PublicKeyCredentialCreationOptionsJSON }> {
    const user = await this.users.findById(userId);
    if (!user) {
      throw new WebAuthnError("USER_NOT_FOUND", 404, "user not found");
    }
    const existing = await this.credentials.listByUserId(userId);
    const options = await generateRegistrationOptions({
      rpName: this.config.webauthnRpName,
      rpID: this.config.webauthnRpId,
      userName: user.email,
      userDisplayName: user.email,
      userID: new TextEncoder().encode(user.id),
      attestationType: "none",
      excludeCredentials: existing.map((cred) => ({
        id: cred.credentialId,
        transports: cred.transports as AuthenticatorTransportFuture[],
      })),
      authenticatorSelection: {
        authenticatorAttachment: attachment,
        residentKey: attachment === "platform" ? "preferred" : "discouraged",
        userVerification: "preferred",
      },
      preferredAuthenticatorType:
        attachment === "platform" ? "localDevice" : "securityKey",
    });

    const challengeId = this.generateId();
    await this.storeChallenge(challengeId, {
      kind: "registration",
      challenge: options.challenge,
      userId,
      email: user.email,
      attachment,
      createdAt: this.now().toISOString(),
    });

    return { challengeId, options };
  }

  async registrationVerify(
    userId: string,
    input: {
      challengeId: string;
      response: RegistrationResponseJSON;
      name?: string;
    },
  ): Promise<LoginMethodsResponse> {
    const challenge = await this.loadChallenge(input.challengeId);
    if (challenge.kind !== "registration" || challenge.userId !== userId || !challenge.attachment) {
      throw new WebAuthnError("WEBAUTHN_CHALLENGE_INVALID", 400, "invalid registration challenge");
    }

    let verification;
    try {
      verification = await verifyRegistrationResponse({
        response: input.response,
        expectedChallenge: challenge.challenge,
        expectedOrigin: this.config.webauthnOrigins,
        expectedRPID: this.config.webauthnRpId,
        requireUserVerification: false,
      });
    } catch {
      throw new WebAuthnError("WEBAUTHN_VERIFICATION_FAILED", 400, "registration verification failed");
    }

    if (!verification.verified || !verification.registrationInfo) {
      throw new WebAuthnError("WEBAUTHN_VERIFICATION_FAILED", 400, "registration verification failed");
    }

    const { credential, aaguid, credentialBackedUp } = verification.registrationInfo;
    const name =
      input.name?.trim() ||
      defaultCredentialName(challenge.attachment);

    try {
      await this.credentials.insert({
        userId,
        credentialId: credential.id,
        publicKey: credential.publicKey,
        signCount: credential.counter,
        transports: credential.transports ?? [],
        authenticatorAttachment: challenge.attachment,
        aaguid: aaguid || null,
        name,
        backedUp: credentialBackedUp,
      });
    } catch {
      throw new WebAuthnError("WEBAUTHN_CREDENTIAL_EXISTS", 409, "credential already registered");
    }

    await this.redis.del(challengeKey(input.challengeId));
    return this.getLoginMethods(userId);
  }

  async deleteCredential(userId: string, credentialRowId: string): Promise<LoginMethodsResponse> {
    const existing = await this.credentials.findByIdForUser(userId, credentialRowId);
    if (!existing) {
      throw new WebAuthnError("WEBAUTHN_CREDENTIAL_NOT_FOUND", 404, "credential not found");
    }
    await this.credentials.deleteByIdForUser(userId, credentialRowId);
    await this.ensurePrimaryStillValid(userId);
    return this.getLoginMethods(userId);
  }

  async deleteCredentialsByAttachment(
    userId: string,
    attachment: WebAuthnAttachment,
  ): Promise<LoginMethodsResponse> {
    await this.credentials.deleteByAttachment(userId, attachment);
    await this.ensurePrimaryStillValid(userId);
    return this.getLoginMethods(userId);
  }

  async discoverLoginMethods(emailRaw: string): Promise<LoginDiscoverResponse> {
    const email = normalizeEmail(emailRaw);
    if (!isValidEmail(email)) {
      throw new WebAuthnError("AUTH_EMAIL_INVALID", 400, "invalid email");
    }
    const user = await this.users.findByEmail(email);
    if (!user) {
      return { primary: "email", methods: ["email"] };
    }
    const all = await this.credentials.listByUserId(user.id);
    const methods = this.availableMethodsFromAttachments(
      all.map((c) => c.authenticatorAttachment),
    );
    let primary = await this.credentials.getPrimaryLoginMethod(user.id);
    if (!methods.includes(primary)) {
      primary = "email";
    }
    return { primary, methods };
  }

  async authenticationOptions(input: {
    email?: string;
    attachment?: WebAuthnAttachment;
  }): Promise<{ challengeId: string; options: PublicKeyCredentialRequestOptionsJSON }> {
    let user: UserRecord | null = null;
    let allowCredentials:
      | { id: string; transports?: AuthenticatorTransportFuture[] }[]
      | undefined;

    if (input.email?.trim()) {
      const email = normalizeEmail(input.email);
      if (!isValidEmail(email)) {
        throw new WebAuthnError("AUTH_EMAIL_INVALID", 400, "invalid email");
      }
      user = await this.users.findByEmail(email);
      if (!user) {
        throw new WebAuthnError("WEBAUTHN_NO_CREDENTIALS", 400, "no webauthn credentials");
      }
      const list = input.attachment
        ? await this.credentials.listByUserAndAttachment(user.id, input.attachment)
        : await this.credentials.listByUserId(user.id);
      if (list.length === 0) {
        throw new WebAuthnError("WEBAUTHN_NO_CREDENTIALS", 400, "no webauthn credentials");
      }
      allowCredentials = list.map((cred) => ({
        id: cred.credentialId,
        transports: cred.transports as AuthenticatorTransportFuture[],
      }));
    }

    const options = await generateAuthenticationOptions({
      rpID: this.config.webauthnRpId,
      allowCredentials,
      userVerification: "preferred",
    });

    const challengeId = this.generateId();
    await this.storeChallenge(challengeId, {
      kind: "authentication",
      challenge: options.challenge,
      userId: user?.id ?? null,
      email: user?.email ?? null,
      attachment: input.attachment ?? null,
      createdAt: this.now().toISOString(),
    });

    return { challengeId, options };
  }

  async authenticationVerify(input: {
    challengeId: string;
    response: AuthenticationResponseJSON;
  }): Promise<WebAuthnLoginConfirmResult> {
    const challenge = await this.loadChallenge(input.challengeId);
    if (challenge.kind !== "authentication") {
      throw new WebAuthnError("WEBAUTHN_CHALLENGE_INVALID", 400, "invalid authentication challenge");
    }

    const credential = await this.credentials.findByCredentialId(input.response.id);
    if (!credential) {
      throw new WebAuthnError("WEBAUTHN_CREDENTIAL_NOT_FOUND", 400, "unknown credential");
    }
    if (challenge.userId && challenge.userId !== credential.userId) {
      throw new WebAuthnError("WEBAUTHN_CHALLENGE_INVALID", 400, "credential does not match challenge");
    }
    if (
      challenge.attachment &&
      challenge.attachment !== credential.authenticatorAttachment
    ) {
      throw new WebAuthnError("WEBAUTHN_CHALLENGE_INVALID", 400, "credential attachment mismatch");
    }

    const user = await this.users.findById(credential.userId);
    if (!user) {
      throw new WebAuthnError("USER_NOT_FOUND", 404, "user not found");
    }

    let verification;
    try {
      verification = await verifyAuthenticationResponse({
        response: input.response,
        expectedChallenge: challenge.challenge,
        expectedOrigin: this.config.webauthnOrigins,
        expectedRPID: this.config.webauthnRpId,
        credential: {
          id: credential.credentialId,
          publicKey: credential.publicKey,
          counter: credential.signCount,
          transports: credential.transports as AuthenticatorTransportFuture[],
        },
        requireUserVerification: false,
      });
    } catch {
      throw new WebAuthnError("WEBAUTHN_VERIFICATION_FAILED", 400, "authentication verification failed");
    }

    if (!verification.verified) {
      throw new WebAuthnError("WEBAUTHN_VERIFICATION_FAILED", 400, "authentication verification failed");
    }

    await this.credentials.updateSignCount(
      credential.id,
      verification.authenticationInfo.newCounter,
    );
    await this.redis.del(challengeKey(input.challengeId));

    const pendingTwoFactor = await this.users.isTwoFactorEnabled(user.id);
    const authState = await this.authService.createAuthStateForExistingUser({
      email: user.email,
      userId: user.id,
      pendingTwoFactor,
    });

    return {
      authStateId: authState.authStateId,
      userExists: true,
      nextStep: authState.nextStep,
    };
  }

  private availableMethods(methods: LoginMethodsResponse): PrimaryLoginMethod[] {
    const result: PrimaryLoginMethod[] = ["email"];
    if (methods.passkeys.length > 0) {
      result.push("passkey");
    }
    if (methods.hardwareKeys.length > 0) {
      result.push("hardware_key");
    }
    return result;
  }

  private availableMethodsFromAttachments(
    attachments: WebAuthnAttachment[],
  ): PrimaryLoginMethod[] {
    const result: PrimaryLoginMethod[] = ["email"];
    if (attachments.includes("platform")) {
      result.push("passkey");
    }
    if (attachments.includes("cross-platform")) {
      result.push("hardware_key");
    }
    return result;
  }

  private async normalizePrimary(
    userId: string,
    primary: PrimaryLoginMethod,
    attachments: WebAuthnAttachment[],
  ): Promise<PrimaryLoginMethod> {
    const available = this.availableMethodsFromAttachments(attachments);
    if (available.includes(primary)) {
      return primary;
    }
    if (primary !== "email") {
      await this.credentials.setPrimaryLoginMethod(userId, "email");
    }
    return "email";
  }

  private async ensurePrimaryStillValid(userId: string): Promise<void> {
    const all = await this.credentials.listByUserId(userId);
    const primary = await this.credentials.getPrimaryLoginMethod(userId);
    await this.normalizePrimary(
      userId,
      primary,
      all.map((c) => c.authenticatorAttachment),
    );
  }

  private async storeChallenge(id: string, payload: ChallengePayload): Promise<void> {
    await this.redis.setWithTtl(
      challengeKey(id),
      JSON.stringify(payload),
      this.config.webauthnChallengeTtlSeconds,
    );
  }

  private async loadChallenge(challengeId: string): Promise<ChallengePayload> {
    const raw = await this.redis.get(challengeKey(challengeId));
    if (!raw) {
      throw new WebAuthnError("WEBAUTHN_CHALLENGE_EXPIRED", 400, "webauthn challenge expired");
    }
    try {
      return JSON.parse(raw) as ChallengePayload;
    } catch {
      throw new WebAuthnError("WEBAUTHN_CHALLENGE_INVALID", 400, "invalid webauthn challenge");
    }
  }
}

export { attachmentToPrimaryMethod, primaryMethodToAttachment };
export type { AuthStatePayload };
