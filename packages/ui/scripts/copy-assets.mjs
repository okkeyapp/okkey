import { cpSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const from = join(root, "src", "assets");
const to = join(root, "dist", "assets");

mkdirSync(to, { recursive: true });
cpSync(from, to, { recursive: true });
