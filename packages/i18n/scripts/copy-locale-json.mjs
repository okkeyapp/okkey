import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const pkgRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function copyLocaleSubdir(name) {
  const srcDir = path.join(pkgRoot, "src", "locales", name);
  const destDir = path.join(pkgRoot, "dist", "locales", name);
  fs.mkdirSync(destDir, { recursive: true });
  for (const file of fs.readdirSync(srcDir)) {
    if (file.endsWith(".json")) {
      fs.copyFileSync(path.join(srcDir, file), path.join(destDir, file));
    }
  }
}

copyLocaleSubdir("email");
copyLocaleSubdir("web");

const manifestSrc = path.join(pkgRoot, "src", "locales", "manifest.json");
const manifestDestDir = path.join(pkgRoot, "dist", "locales");
if (fs.existsSync(manifestSrc)) {
  fs.mkdirSync(manifestDestDir, { recursive: true });
  fs.copyFileSync(manifestSrc, path.join(manifestDestDir, "manifest.json"));
}
