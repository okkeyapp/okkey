import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertCryptoPolicyMatrix,
  getAllowedCryptoProfileVersionsByEnv,
  getDefaultCryptoRolloutModeByEnv,
  isCryptoProfileVersionAllowedByEnv,
  type CryptoRolloutMode,
  type DeployEnv,
} from "./crypto/policy-matrix.ts";

type NodeEnv = "development" | "test" | "production";
type EmailProvider = "logger" | "smtp" | "http-api" | "ses";
type CryptoRolloutState = "resume" | "stop";

export type DeploymentMode = "self_hosted" | "saas";

export interface ApiConfig {
  nodeEnv: NodeEnv;
  deployEnv: DeployEnv;
  /** Product deployment: self_hosted (default OSS) vs saas (multi-workspace via enterprise plugin). */
  deploymentMode: DeploymentMode;
  /** Plan assigned to newly created workspaces. ENTERPRISE when enterprise modules are enabled. */
  defaultWorkspacePlanTier: "FREE" | "ENTERPRISE";
  port: number;
  logLevel: string;
  corsOrigin: string;
  databaseUrl: string;
  redisUrl: string;
  authCodeTtlSeconds: number;
  authResendCooldownSeconds: number;
  authCodeMaxAttempts: number;
  authRateLimitWindowSeconds: number;
  authRateLimitStartPerEmail: number;
  authRateLimitStartPerIp: number;
  authRateLimitConfirmPerIp: number;
  authRateLimitResendPerIp: number;
  registrationAuthStateTtlSeconds: number;
  registrationResultTtlSeconds: number;
  deviceApprovalTtlSeconds: number;
  /** Server secret: AES key for TOTP at rest, backup-code pepper, session binding */
  sessionSecret: string;
  sessionTtlSeconds: number;
  /** After email confirm, TTL for auth state when 2FA is still required */
  authPendingTwoFactorTtlSeconds: number;
  totpEnrollmentTtlSeconds: number;
  twoFactorVerifyMaxAttemptsPerState: number;
  twoFactorVerifyClockSteps: number;
  authRateLimitTwoFactorVerifyPerIp: number;
  twoFactorBackupCodesCount: number;
  /** In production, only Bearer sessions authenticate; X-User-Id is ignored */
  allowHeaderUserIdAuth: boolean;
  /** Load enterprise backend plugins from `enterpriseModulesPath`. */
  enterpriseModulesEnabled: boolean;
  enterpriseModulesPath: string;
  defaultEmailLocale: string;
  /** Base URL for links in transactional email (e.g. https://app.example.com); empty = text-only hints */
  publicAppBaseUrl: string;
  emailFrom: string;
  emailProvider: EmailProvider;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string;
  smtpPassword: string;
  emailApiEndpoint: string;
  emailApiKey: string;
  emailApiTimeoutMs: number;
  /** AWS SES / SES-compatible (Yandex Postbox) region for SigV4. */
  sesRegion: string;
  sesAccessKeyId: string;
  sesSecretAccessKey: string;
  /** Optional origin or full URL; empty = `https://email.{region}.amazonaws.com`. */
  sesEndpoint: string;
  sesTimeoutMs: number;
  capsuleOpenRateLimitPerIp: number;
  capsuleRateLimitWindowSeconds: number;
  geoIpEnabled: boolean;
  geoIpProvider: string;
  geoIpDbPath: string;
  geoIpAutoUpdate: boolean;
  trustedProxyHops: number;
  allowedCryptoProfileVersions: number[];
  cryptoRolloutMode: CryptoRolloutMode;
  cryptoRolloutEnabled: boolean;
  cryptoRolloutState: CryptoRolloutState;
  cryptoRolloutStopWritePaths: string[];
  /** Snowflake worker id for server-generated entity ids (0–1023). */
  snowflakeNodeId: number;
  /** WebAuthn relying party ID (e.g. localhost or app.okkey.app). */
  webauthnRpId: string;
  webauthnRpName: string;
  /** Allowed browser origins for WebAuthn ceremonies (comma-separated env). */
  webauthnOrigins: string[];
  webauthnChallengeTtlSeconds: number;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serviceRoot = path.resolve(__dirname, "..");

function parseEnvLine(line: string): [string, string] | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) {
    return null;
  }

  const separatorIndex = trimmed.indexOf("=");
  if (separatorIndex < 0) {
    return null;
  }

  const key = trimmed.slice(0, separatorIndex).trim();
  const rawValue = trimmed.slice(separatorIndex + 1).trim();
  const value = rawValue.replace(/^['"]|['"]$/g, "");

  if (!key) {
    return null;
  }

  return [key, value];
}

function loadEnvFile(filename: string): void {
  const filePath = path.join(serviceRoot, filename);
  if (!existsSync(filePath)) {
    return;
  }

  const content = readFileSync(filePath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const parsed = parseEnvLine(line);
    if (!parsed) {
      continue;
    }

    const [key, value] = parsed;
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function parsePort(value: string | undefined): number {
  const parsed = Number(value ?? "4000");
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65535) {
    return 4000;
  }
  return parsed;
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function parseNonNegativeInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) {
    return fallback;
  }

  const normalized = value.toLowerCase().trim();
  if (normalized === "true" || normalized === "1" || normalized === "yes") {
    return true;
  }
  if (normalized === "false" || normalized === "0" || normalized === "no") {
    return false;
  }
  return fallback;
}

function resolveDeployEnv(nodeEnv: NodeEnv, value: string | undefined): DeployEnv {
  const normalized = (value ?? "").trim().toLowerCase();
  if (normalized === "dev" || normalized === "stage" || normalized === "prod") {
    return normalized;
  }
  if (nodeEnv === "production") {
    return "prod";
  }
  return "dev";
}

function parseProfileVersions(raw: string | undefined, fallback: readonly number[]): number[] {
  if (!raw || raw.trim() === "") {
    return [...fallback];
  }

  const values = raw
    .split(",")
    .map((part) => Number(part.trim()))
    .filter((value) => Number.isInteger(value) && value > 0);
  const unique = Array.from(new Set(values)).sort((a, b) => a - b);
  return unique.length > 0 ? unique : [...fallback];
}

function parseCryptoRolloutMode(
  raw: string | undefined,
  deployEnv: DeployEnv,
): CryptoRolloutMode {
  const normalized = (raw ?? "").trim().toLowerCase();
  if (normalized === "strict" || normalized === "compat") {
    return normalized;
  }
  return getDefaultCryptoRolloutModeByEnv(deployEnv);
}

function parseCryptoRolloutState(raw: string | undefined): CryptoRolloutState {
  const normalized = (raw ?? "").trim().toLowerCase();
  if (normalized === "stop" || normalized === "resume") {
    return normalized;
  }
  return "resume";
}

function parseCsvList(raw: string | undefined): string[] {
  if (!raw || raw.trim() === "") {
    return [];
  }
  return [...new Set(raw.split(",").map((item) => item.trim().toLowerCase()).filter(Boolean))];
}

/** Comma-separated list preserving case (origins / hostnames). */
function parseCsvPreserveCase(raw: string | undefined, fallback: string[]): string[] {
  if (!raw || raw.trim() === "") {
    return fallback;
  }
  const parsed = [
    ...new Set(raw.split(",").map((item) => item.trim()).filter(Boolean)),
  ];
  return parsed.length > 0 ? parsed : fallback;
}

function resolveEnterpriseModulesPath(explicitPath: string | undefined): string {
  const trimmed = explicitPath?.trim();
  if (trimmed) {
    return path.resolve(trimmed);
  }
  const servicesApiDir = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(servicesApiDir, "../../../../okkey-enterprise");
}

function parseDeploymentMode(value: string | undefined): DeploymentMode {
  const normalized = (value ?? "self_hosted").trim().toLowerCase();
  if (normalized === "saas") {
    return "saas";
  }
  if (normalized === "self_hosted" || normalized === "self-hosted") {
    return "self_hosted";
  }
  throw new Error(`OKKEY_DEPLOYMENT_MODE must be "self_hosted" or "saas", got: ${value}`);
}

export function loadConfig(): ApiConfig {
  loadEnvFile(".env");
  loadEnvFile(".env.local");
  assertCryptoPolicyMatrix();

  const nodeEnv = (process.env.NODE_ENV ?? "development") as NodeEnv;
  const deployEnv = resolveDeployEnv(nodeEnv, process.env.DEPLOY_ENV);
  const enterpriseModulesEnabled = parseBoolean(process.env.ENTERPRISE_MODULES, false);
  const deploymentMode = parseDeploymentMode(process.env.OKKEY_DEPLOYMENT_MODE);
  const defaultWorkspacePlanTier = enterpriseModulesEnabled ? "ENTERPRISE" : "FREE";
  const allowedCryptoProfileVersions = parseProfileVersions(
    process.env.CRYPTO_ALLOWED_PROFILE_VERSIONS,
    getAllowedCryptoProfileVersionsByEnv(deployEnv),
  );
  const disallowedOverrideProfiles = allowedCryptoProfileVersions.filter(
    (version) => !isCryptoProfileVersionAllowedByEnv(deployEnv, version),
  );
  if (disallowedOverrideProfiles.length > 0) {
    throw new Error(
      `CRYPTO_ALLOWED_PROFILE_VERSIONS includes versions blocked by ${deployEnv} policy: ${disallowedOverrideProfiles.join(",")}`,
    );
  }
  const cryptoRolloutMode = parseCryptoRolloutMode(
    process.env.CRYPTO_ROLLOUT_MODE,
    deployEnv,
  );
  const cryptoRolloutEnabled = parseBoolean(process.env.CRYPTO_ROLLOUT_ENABLED, true);
  const cryptoRolloutState = parseCryptoRolloutState(process.env.CRYPTO_ROLLOUT_STATE);
  const cryptoRolloutStopWritePaths = parseCsvList(process.env.CRYPTO_ROLLOUT_STOP_WRITE_PATHS);
  const sessionSecret =
    process.env.SESSION_SECRET ?? process.env.JWT_SECRET ?? "dev-session-secret";
  return {
    nodeEnv,
    deployEnv,
    deploymentMode,
    defaultWorkspacePlanTier,
    port: parsePort(process.env.PORT),
    logLevel: process.env.LOG_LEVEL ?? "info",
    /** Comma-separated browser origins, or `*` (reflects request Origin when listed). */
    corsOrigin: process.env.CORS_ORIGIN ?? "*",
    databaseUrl:
      process.env.DATABASE_URL ?? "postgresql://okkey:okkey@localhost:5432/okkey",
    redisUrl: process.env.REDIS_URL ?? "redis://localhost:6379",
    authCodeTtlSeconds: parsePositiveInt(process.env.AUTH_CODE_TTL_SECONDS, 300),
    authResendCooldownSeconds: parsePositiveInt(
      process.env.AUTH_RESEND_COOLDOWN_SECONDS,
      60,
    ),
    authCodeMaxAttempts: parsePositiveInt(process.env.AUTH_CODE_MAX_ATTEMPTS, 5),
    authRateLimitWindowSeconds: parsePositiveInt(
      process.env.AUTH_RATE_LIMIT_WINDOW_SECONDS,
      600,
    ),
    authRateLimitStartPerEmail: parsePositiveInt(
      process.env.AUTH_RATE_LIMIT_START_PER_EMAIL,
      5,
    ),
    authRateLimitStartPerIp: parsePositiveInt(
      process.env.AUTH_RATE_LIMIT_START_PER_IP,
      10,
    ),
    authRateLimitConfirmPerIp: parsePositiveInt(
      process.env.AUTH_RATE_LIMIT_CONFIRM_PER_IP,
      30,
    ),
    authRateLimitResendPerIp: parsePositiveInt(
      process.env.AUTH_RATE_LIMIT_RESEND_PER_IP,
      10,
    ),
    registrationAuthStateTtlSeconds: parsePositiveInt(
      process.env.REGISTRATION_AUTH_STATE_TTL_SECONDS,
      3600,
    ),
    registrationResultTtlSeconds: parsePositiveInt(
      process.env.REGISTRATION_RESULT_TTL_SECONDS,
      604800,
    ),
    deviceApprovalTtlSeconds: parsePositiveInt(
      process.env.DEVICE_APPROVAL_TTL_SECONDS,
      600,
    ),
    sessionSecret,
    sessionTtlSeconds: parsePositiveInt(process.env.SESSION_TTL_SECONDS, 604_800),
    authPendingTwoFactorTtlSeconds: parsePositiveInt(
      process.env.AUTH_PENDING_TWO_FACTOR_TTL_SECONDS,
      600,
    ),
    totpEnrollmentTtlSeconds: parsePositiveInt(
      process.env.TOTP_ENROLLMENT_TTL_SECONDS,
      600,
    ),
    twoFactorVerifyMaxAttemptsPerState: parsePositiveInt(
      process.env.TWO_FACTOR_VERIFY_MAX_ATTEMPTS,
      5,
    ),
    twoFactorVerifyClockSteps: parsePositiveInt(
      process.env.TWO_FACTOR_VERIFY_CLOCK_STEPS,
      1,
    ),
    authRateLimitTwoFactorVerifyPerIp: parsePositiveInt(
      process.env.AUTH_RATE_LIMIT_TWO_FACTOR_VERIFY_PER_IP,
      40,
    ),
    twoFactorBackupCodesCount: parsePositiveInt(
      process.env.TWO_FACTOR_BACKUP_CODES_COUNT,
      10,
    ),
    allowHeaderUserIdAuth:
      nodeEnv !== "production" ||
      parseBoolean(process.env.ALLOW_HEADER_USER_ID_AUTH, false),
    enterpriseModulesEnabled,
    enterpriseModulesPath: resolveEnterpriseModulesPath(process.env.ENTERPRISE_MODULES_PATH),
    defaultEmailLocale: process.env.EMAIL_DEFAULT_LOCALE ?? "en",
    publicAppBaseUrl: (process.env.PUBLIC_APP_URL ?? "").trim(),
    emailFrom: process.env.EMAIL_FROM ?? "no-reply@okkey.local",
    emailProvider: (process.env.EMAIL_PROVIDER ?? "logger") as EmailProvider,
    smtpHost: process.env.EMAIL_SMTP_HOST ?? "localhost",
    smtpPort: parsePositiveInt(process.env.EMAIL_SMTP_PORT, 1025),
    smtpSecure: parseBoolean(process.env.EMAIL_SMTP_SECURE, false),
    smtpUser: process.env.EMAIL_SMTP_USER ?? "",
    smtpPassword: process.env.EMAIL_SMTP_PASSWORD ?? "",
    emailApiEndpoint: process.env.EMAIL_API_ENDPOINT ?? "",
    emailApiKey: process.env.EMAIL_API_KEY ?? "",
    emailApiTimeoutMs: parsePositiveInt(process.env.EMAIL_API_TIMEOUT_MS, 10000),
    sesRegion: process.env.EMAIL_SES_REGION ?? "",
    sesAccessKeyId: process.env.EMAIL_SES_ACCESS_KEY_ID ?? "",
    sesSecretAccessKey: process.env.EMAIL_SES_SECRET_ACCESS_KEY ?? "",
    sesEndpoint: (process.env.EMAIL_SES_ENDPOINT ?? "").trim(),
    sesTimeoutMs: parsePositiveInt(process.env.EMAIL_SES_TIMEOUT_MS, 10000),
    capsuleOpenRateLimitPerIp: parsePositiveInt(process.env.CAPSULE_OPEN_RATE_LIMIT_PER_IP, 60),
    capsuleRateLimitWindowSeconds: parsePositiveInt(
      process.env.CAPSULE_RATE_LIMIT_WINDOW_SECONDS,
      60,
    ),
    geoIpEnabled: parseBoolean(process.env.GEOIP_ENABLED, true),
    geoIpProvider: process.env.GEOIP_PROVIDER ?? "db-ip",
    geoIpDbPath:
      process.env.GEOIP_DB_PATH ??
      path.resolve(serviceRoot, "../../.data/geoip/city.mmdb"),
    geoIpAutoUpdate: parseBoolean(process.env.GEOIP_AUTO_UPDATE, false),
    trustedProxyHops: parseNonNegativeInt(process.env.TRUSTED_PROXY_HOPS, 0),
    webauthnRpId: (process.env.WEBAUTHN_RP_ID ?? "localhost").trim() || "localhost",
    webauthnRpName: (process.env.WEBAUTHN_RP_NAME ?? "Okkey").trim() || "Okkey",
    webauthnOrigins: parseCsvPreserveCase(
      process.env.WEBAUTHN_ORIGINS,
      ["http://localhost:5173"],
    ),
    webauthnChallengeTtlSeconds: parsePositiveInt(
      process.env.WEBAUTHN_CHALLENGE_TTL_SECONDS,
      300,
    ),
    allowedCryptoProfileVersions,
    cryptoRolloutMode,
    cryptoRolloutEnabled,
    cryptoRolloutState,
    cryptoRolloutStopWritePaths,
    snowflakeNodeId: parsePositiveInt(process.env.SNOWFLAKE_NODE_ID, 1) % 1024,
  };
}
