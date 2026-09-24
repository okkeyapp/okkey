import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * SaaS / deployment keys owned by okkey-enterprise.
 * Applied from `okkey-enterprise/backend/.env` when ENTERPRISE_MODULES is on.
 * Never documented in open-core committed `.env.example`.
 */
const ENTERPRISE_OWNED_API_KEYS = new Set(["OKKEY_DEPLOYMENT_MODE"]);

/** Bootstrap stays in Core process env — never overwritten from enterprise files. */
const CORE_BOOTSTRAP_API_KEYS = new Set(["ENTERPRISE_MODULES", "ENTERPRISE_MODULES_PATH"]);

function parseEnvFile(contents: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function readEnvDir(envDir: string): Record<string, string> {
  const merged: Record<string, string> = {};
  const files = [".env", ".env.local"];
  for (const file of files) {
    const full = path.join(envDir, file);
    if (!existsSync(full)) continue;
    Object.assign(merged, parseEnvFile(readFileSync(full, "utf8")));
  }
  return merged;
}

/**
 * Load enterprise-owned API keys from `okkey-enterprise/backend/.env`.
 * Skips Core bootstrap keys.
 */
export function loadEnterpriseBackendEnv(enterpriseBackendEnvDir: string): Record<string, string> {
  if (!existsSync(enterpriseBackendEnvDir)) {
    return {};
  }
  const loaded = readEnvDir(enterpriseBackendEnvDir);
  const overlay: Record<string, string> = {};
  for (const [key, value] of Object.entries(loaded)) {
    if (CORE_BOOTSTRAP_API_KEYS.has(key)) continue;
    if (!ENTERPRISE_OWNED_API_KEYS.has(key)) continue;
    overlay[key] = value;
  }
  return overlay;
}

/** Apply overlay into `process.env` (enterprise wins for owned keys). */
export function applyEnterpriseBackendEnvToProcess(overlay: Record<string, string>): void {
  for (const [key, value] of Object.entries(overlay)) {
    process.env[key] = value;
  }
}
