/**
 * @deprecated Use gen-locale-bundles.mjs (web + email + registry).
 * Kept as a thin wrapper so older docs/scripts keep working.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const script = path.join(path.dirname(fileURLToPath(import.meta.url)), "gen-locale-bundles.mjs");
const result = spawnSync(process.execPath, [script], { stdio: "inherit" });
process.exit(result.status ?? 1);
