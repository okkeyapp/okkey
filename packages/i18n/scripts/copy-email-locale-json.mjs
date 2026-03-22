import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const pkgRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const srcDir = path.join(pkgRoot, "src", "locales", "email");
const destDir = path.join(pkgRoot, "dist", "locales", "email");

fs.mkdirSync(destDir, { recursive: true });
for (const name of fs.readdirSync(srcDir)) {
  if (name.endsWith(".json")) {
    fs.copyFileSync(path.join(srcDir, name), path.join(destDir, name));
  }
}
