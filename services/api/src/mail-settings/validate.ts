import { SMTP_TLS_MODES, type SmtpTlsMode } from "./types.ts";

const HOST_RE =
  /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isSmtpTlsMode(value: string): value is SmtpTlsMode {
  return (SMTP_TLS_MODES as readonly string[]).includes(value);
}

/** Empty string clears the override. Otherwise a hostname or IPv4 address. */
export function parseSmtpHost(value: unknown): string | null {
  if (typeof value !== "string") {
    throw new Error("INVALID_SMTP_HOST");
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed.length > 253 || !HOST_RE.test(trimmed)) {
    throw new Error("INVALID_SMTP_HOST");
  }
  return trimmed;
}

/** Empty / null clears the override. Otherwise an integer port from 1 to 65535. */
export function parseSmtpPort(value: unknown): number | null {
  if (value === null || value === "") {
    return null;
  }
  const port = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("INVALID_SMTP_PORT");
  }
  return port;
}

export function parseSmtpTlsMode(value: unknown): SmtpTlsMode | null {
  if (value === null || value === "") {
    return null;
  }
  if (typeof value !== "string" || !isSmtpTlsMode(value)) {
    throw new Error("INVALID_SMTP_TLS_MODE");
  }
  return value;
}

export function parseSmtpUsername(value: unknown): string | null {
  if (typeof value !== "string") {
    throw new Error("INVALID_SMTP_USERNAME");
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed.length > 320 || /[\r\n]/.test(trimmed)) {
    throw new Error("INVALID_SMTP_USERNAME");
  }
  return trimmed;
}

export function parseEmailFrom(value: unknown): string | null {
  if (typeof value !== "string") {
    throw new Error("INVALID_EMAIL_FROM");
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed.length > 254 || !EMAIL_RE.test(trimmed)) {
    throw new Error("INVALID_EMAIL_FROM");
  }
  return trimmed;
}

/**
 * Empty string clears the override.
 * Otherwise an absolute http(s) URL with a host and no userinfo.
 */
export function parsePublicAppUrl(value: unknown): string | null {
  if (typeof value !== "string") {
    throw new Error("INVALID_PUBLIC_APP_URL");
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed.length > 2048) {
    throw new Error("INVALID_PUBLIC_APP_URL");
  }
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error("INVALID_PUBLIC_APP_URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("INVALID_PUBLIC_APP_URL");
  }
  if (!url.hostname || url.username || url.password) {
    throw new Error("INVALID_PUBLIC_APP_URL");
  }
  return trimmed.replace(/\/$/, "");
}

export function parseSmtpPassword(value: unknown): string {
  if (typeof value !== "string") {
    throw new Error("INVALID_SMTP_PASSWORD");
  }
  if (value.length > 1024 || /[\r\n]/.test(value)) {
    throw new Error("INVALID_SMTP_PASSWORD");
  }
  return value;
}
