import fs from "node:fs";
import path from "node:path";

/** Kept in Core `.env` only — never overwritten from enterprise `web/.env`. */
const CORE_BOOTSTRAP_VITE_KEYS = new Set(["VITE_ENTERPRISE_MODULES"]);

/**
 * Minimal `.env` parser aligned with Vite’s common cases (MODE files, quotes, comments).
 * Avoids importing `vite` so unit tests do not pull esbuild into jsdom.
 */
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

function readEnvDir(mode: string, envDir: string): Record<string, string> {
  const merged: Record<string, string> = {};
  // Same file order as Vite `loadEnv` (later files override).
  const files = [".env", ".env.local", `.env.${mode}`, `.env.${mode}.local`];
  for (const file of files) {
    const full = path.join(envDir, file);
    if (!fs.existsSync(full) || !fs.statSync(full).isFile()) continue;
    Object.assign(merged, parseEnvFile(fs.readFileSync(full, "utf8")));
  }
  return merged;
}

/**
 * Load `VITE_*` from okkey-enterprise/web (SaaS / legal / deployment mode).
 * Skips bootstrap keys so Core remains the switch for enabling the overlay.
 */
export function loadEnterpriseWebViteEnv(
  mode: string,
  enterpriseWebEnvDir: string,
): Record<string, string> {
  if (!fs.existsSync(enterpriseWebEnvDir)) {
    return {};
  }
  const loaded = readEnvDir(mode, enterpriseWebEnvDir);
  const overlay: Record<string, string> = {};
  for (const [key, value] of Object.entries(loaded)) {
    if (!key.startsWith("VITE_")) continue;
    if (CORE_BOOTSTRAP_VITE_KEYS.has(key)) continue;
    overlay[key] = value;
  }
  return overlay;
}

/** Expose overlay to Vite client `import.meta.env` via `define`. */
export function enterpriseWebViteEnvDefines(overlay: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(overlay).map(([key, value]) => [`import.meta.env.${key}`, JSON.stringify(value)]),
  );
}

/** Also mirror into `process.env` for tooling that reads env after config. */
export function applyEnterpriseWebViteEnvToProcess(overlay: Record<string, string>): void {
  for (const [key, value] of Object.entries(overlay)) {
    process.env[key] = value;
  }
}
