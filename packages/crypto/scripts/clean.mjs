import { rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../..", import.meta.url));
const outDir = join(root, "packages", "crypto", "dist");

rmSync(outDir, { recursive: true, force: true });
