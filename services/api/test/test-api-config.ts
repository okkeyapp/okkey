import type { ApiConfig } from "../src/config.ts";
import type { SessionService } from "../src/session/service.ts";

/** Deterministic session minting for `RegistrationService` unit tests. */
export function createMockSessionService(): Pick<SessionService, "createSession"> {
  let seq = 0;
  return {
    async createSession(userId: string) {
      seq += 1;
      return {
        accessToken: `mock-access-token-${userId}-${seq}`,
        expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
      };
    },
  };
}

/** Full `ApiConfig` for route/service unit tests (no missing keys after env changes). */
export function createTestApiConfig(overrides: Partial<ApiConfig> = {}): ApiConfig {
  return {
    nodeEnv: "test",
    deployEnv: "dev",
    deploymentMode: "self_hosted",
    defaultWorkspacePlanTier: "FREE",
    enterpriseModulesEnabled: false,
    enterpriseModulesPath: "",
    snowflakeNodeId: 1,
    port: 4000,
    logLevel: "debug",
    corsOrigin: "*",
    databaseUrl: "",
    redisUrl: "",
    authCodeTtlSeconds: 300,
    authResendCooldownSeconds: 60,
    authCodeMaxAttempts: 5,
    authRateLimitWindowSeconds: 600,
    authRateLimitStartPerEmail: 5,
    authRateLimitStartPerIp: 10,
    authRateLimitConfirmPerIp: 30,
    authRateLimitResendPerIp: 10,
    registrationAuthStateTtlSeconds: 3600,
    registrationResultTtlSeconds: 604800,
    deviceApprovalTtlSeconds: 600,
    sessionSecret: "test-session-secret-key-min-32-chars",
    sessionTtlSeconds: 3600,
    authPendingTwoFactorTtlSeconds: 600,
    totpEnrollmentTtlSeconds: 600,
    twoFactorVerifyMaxAttemptsPerState: 5,
    twoFactorVerifyClockSteps: 1,
    authRateLimitTwoFactorVerifyPerIp: 40,
    twoFactorBackupCodesCount: 10,
    allowHeaderUserIdAuth: true,
    defaultEmailLocale: "en",
    publicAppBaseUrl: "https://app.okkey.test",
    emailFrom: "no-reply@okkey.local",
    emailProvider: "logger",
    smtpHost: "localhost",
    smtpPort: 1025,
    smtpSecure: false,
    smtpUser: "",
    smtpPassword: "",
    emailApiEndpoint: "",
    emailApiKey: "",
    emailApiTimeoutMs: 10_000,
    sesRegion: "",
    sesAccessKeyId: "",
    sesSecretAccessKey: "",
    sesEndpoint: "",
    sesTimeoutMs: 10_000,
    capsuleOpenRateLimitPerIp: 60,
    capsuleRateLimitWindowSeconds: 60,
    allowedCryptoProfileVersions: [1, 2],
    cryptoRolloutMode: "compat",
    cryptoRolloutEnabled: true,
    cryptoRolloutState: "resume",
    cryptoRolloutStopWritePaths: [],
    geoIpEnabled: false,
    geoIpProvider: "db-ip",
    geoIpDbPath: "",
    geoIpAutoUpdate: false,
    trustedProxyHops: 0,
    webauthnRpId: "localhost",
    webauthnRpName: "Okkey",
    webauthnOrigins: ["http://localhost:5173"],
    webauthnChallengeTtlSeconds: 300,
    ...overrides,
  };
}
