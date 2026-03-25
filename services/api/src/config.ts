import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

type NodeEnv = "development" | "test" | "production";
type EmailProvider = "logger" | "smtp" | "http-api";

export interface ApiConfig {
  nodeEnv: NodeEnv;
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
  capsuleOpenRateLimitPerIp: number;
  capsuleRateLimitWindowSeconds: number;
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

export function loadConfig(): ApiConfig {
  loadEnvFile(".env");
  loadEnvFile(".env.local");

  const nodeEnv = (process.env.NODE_ENV ?? "development") as NodeEnv;
  const sessionSecret =
    process.env.SESSION_SECRET ?? process.env.JWT_SECRET ?? "dev-session-secret";
  return {
    nodeEnv,
    port: parsePort(process.env.PORT),
    logLevel: process.env.LOG_LEVEL ?? "info",
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
    capsuleOpenRateLimitPerIp: parsePositiveInt(process.env.CAPSULE_OPEN_RATE_LIMIT_PER_IP, 60),
    capsuleRateLimitWindowSeconds: parsePositiveInt(
      process.env.CAPSULE_RATE_LIMIT_WINDOW_SECONDS,
      60,
    ),
  };
}
