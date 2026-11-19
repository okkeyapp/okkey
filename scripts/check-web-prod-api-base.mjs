#!/usr/bin/env node
/**
 * TSK-305: production web image must not bake localhost:4000 as the API /
 * enterprise API base, and the production bundle must not embed that host
 * in user-facing copy either.
 *
 * Usage:
 *   node scripts/check-web-prod-api-base.mjs
 *   node scripts/check-web-prod-api-base.mjs --require-dist
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const requireDist = process.argv.includes("--require-dist");
const LOCALHOST_API = "http://localhost:4000";

function fail(message) {
  console.error(`check-web-prod-api-base: ${message}`);
  process.exitCode = 1;
}

function read(rel) {
  return fs.readFileSync(path.join(repoRoot, rel), "utf8");
}

// --- Source / image defaults ---
const dockerfile = read("apps/web/Dockerfile");
if (/ARG\s+VITE_API_BASE_URL\s*=\s*http:\/\/localhost:4000/.test(dockerfile)) {
  fail("apps/web/Dockerfile must not default VITE_API_BASE_URL to http://localhost:4000");
}

const entrypoint = read("apps/web/docker/docker-entrypoint.sh");
if (/localhost:4000/.test(entrypoint)) {
  fail("apps/web/docker/docker-entrypoint.sh must not fall back to localhost:4000");
}
if (!/OKKEY_API_PUBLIC_URL/.test(entrypoint)) {
  fail("apps/web/docker/docker-entrypoint.sh must read OKKEY_API_PUBLIC_URL at runtime");
}

const clientSrc = read("apps/web/src/api/client.ts");
if (!/import\.meta\.env\.PROD\s*\?\s*""\s*:\s*"http:\/\/localhost:4000"/.test(clientSrc)) {
  fail(
    "apps/web/src/api/client.ts must use import.meta.env.PROD ? \"\" : localhost so production DCE strips the default",
  );
}

for (const locale of ["en", "ru"]) {
  const localePath = `packages/i18n/src/locales/web/${locale}.json`;
  const localeSrc = read(localePath);
  if (localeSrc.includes(LOCALHOST_API) || localeSrc.includes("localhost:4000")) {
    fail(`${localePath} must not mention localhost:4000 in user-facing strings`);
  }
}

// --- Built bundle (optional unless --require-dist) ---
const distDir = path.join(repoRoot, "apps/web/dist");
const distExists = fs.existsSync(distDir);

if (!distExists) {
  if (requireDist) {
    fail("apps/web/dist is missing; run a production web build first");
  } else {
    console.log("check-web-prod-api-base: skipped dist scan (no apps/web/dist)");
  }
} else {
  const configJs = path.join(distDir, "config.js");
  if (fs.existsSync(configJs)) {
    const config = fs.readFileSync(configJs, "utf8");
    if (config.includes(LOCALHOST_API) || config.includes("localhost:4000")) {
      fail("apps/web/dist/config.js must not hardcode localhost:4000");
    }
  }

  const assetsDir = path.join(distDir, "assets");
  const files = fs.existsSync(assetsDir)
    ? fs.readdirSync(assetsDir).filter((name) => name.endsWith(".js"))
    : [];
  if (files.length === 0) {
    fail("apps/web/dist/assets has no .js bundles");
  } else {
    const hits = [];
    for (const name of files) {
      const content = fs.readFileSync(path.join(assetsDir, name), "utf8");
      if (content.includes(LOCALHOST_API) || content.includes("localhost:4000")) {
        hits.push(name);
      }
    }
    if (hits.length > 0) {
      fail(
        `production web bundle must not contain localhost:4000 (API base or i18n); found in: ${hits.join(", ")}`,
      );
    } else {
      console.log(
        `check-web-prod-api-base: scanned ${files.length} JS asset(s); no localhost:4000`,
      );
    }
  }
}

if (!process.exitCode) {
  console.log("check-web-prod-api-base: ok");
}
