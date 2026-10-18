import path from "node:path";
import { fileURLToPath } from "node:url";

/** Shared e2e env (web preview + API). Defaults match CI / local docs. */

export const E2E_BASE_URL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:4173";
export const E2E_API_BASE_URL = process.env.E2E_API_BASE_URL ?? "http://127.0.0.1:4000";
/** Must match AUTH_E2E_FIXED_CODE on the API process (non-prod only). */
export const E2E_OTP_CODE = process.env.E2E_OTP_CODE ?? process.env.AUTH_E2E_FIXED_CODE ?? "424242";
export const E2E_MASTER_PASSWORD = process.env.E2E_MASTER_PASSWORD ?? "e2e-master-pass";
export const E2E_DATABASE_URL =
  process.env.E2E_DATABASE_URL ??
  process.env.DATABASE_URL ??
  "postgresql://okkey:okkey@127.0.0.1:5432/okkey";

const here = path.dirname(fileURLToPath(import.meta.url));

export function uniqueEmail(prefix = "e2e"): string {
  const stamp = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  return `${prefix}-${stamp}@okkey.local`;
}

/** Unpacked Chromium extension dir (WXT `output/chrome-mv3`). */
export function extensionOutputDir(): string {
  if (process.env.E2E_EXTENSION_PATH) {
    return process.env.E2E_EXTENSION_PATH;
  }
  return path.resolve(here, "../../apps/extension/output/chrome-mv3");
}
