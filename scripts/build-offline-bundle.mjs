/**
 * Build one offline archive from a signed core package and a signed enterprise package.
 *
 *   node --experimental-strip-types scripts/build-offline-bundle.mjs \
 *     --core core.okpkg --enterprise enterprise.okpkg --out okkey.okbundle
 *
 * Air-gap cosign material (TSK-317) — use a `.zip` output:
 *
 *   node --experimental-strip-types scripts/build-offline-bundle.mjs \
 *     --core core.okpkg --enterprise enterprise.okpkg --out okkey.zip \
 *     --trusted-root ./trusted_root.json \
 *     --cosign api=./cosign-save/api \
 *     --cosign web=./cosign-save/web \
 *     --cosign worker=./cosign-save/worker
 *
 * Conventional layout after extract / under OKKEY_COSIGN_OFFLINE_DIR:
 *   trusted_root.json
 *   cosign/<image-key>/   (from `cosign save`)
 *
 * A path ending in `.okbundle` writes a JSON document whose `archiveBase64` is the zip
 * (web UI path; cosign material is not allowed). A path ending in `.zip` writes the zip.
 * The packages are read as bytes and are not rebuilt in this repository.
 *
 * Enterprise air-gap builders live outside this repository; pass enterprise image keys
 * the same way (`--cosign enterprise-api=…`, …) or ship the conventional layout beside
 * the signed package.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { buildOfflineBundle } from "../services/api/src/system-updates/offline-bundle.ts";

try {
  const args = parseArgs(process.argv.slice(2));
  const core = readFileSync(args.core);
  const enterprise = readFileSync(args.enterprise);
  assertComponent(core, "okkey", args.core);
  assertComponent(enterprise, "enterprise", args.enterprise);

  const hasCosign = Boolean(args.trustedRoot || Object.keys(args.cosignDirs).length > 0);
  if (hasCosign && !args.out.endsWith(".zip")) {
    throw new Error("Cosign offline material requires a .zip output (not .okbundle)");
  }

  const options =
    hasCosign
      ? {
          trustedRoot: readFileSync(args.trustedRoot),
          cosignDirs: args.cosignDirs,
        }
      : undefined;

  const built = buildOfflineBundle(core, enterprise, options);
  mkdirSync(path.dirname(path.resolve(args.out)), { recursive: true });
  if (args.out.endsWith(".zip")) {
    writeFileSync(args.out, built.zip);
  } else {
    if (!built.document) {
      throw new Error("Offline bundle document is unavailable for this archive");
    }
    writeFileSync(args.out, `${JSON.stringify(built.document)}\n`);
  }
  process.stdout.write(`Wrote ${args.out}\n`);
  if (built.includesCosignOffline) {
    process.stdout.write(
      "Included cosign offline material (trusted_root.json + cosign/<key>/). " +
        "Set OKKEY_COSIGN_OFFLINE_DIR to the extract root for isolated verify.\n",
    );
  }
} catch (error) {
  const message = error instanceof Error ? error.message : "Could not build the offline bundle";
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function assertComponent(bytes, component, filePath) {
  let parsed;
  try {
    parsed = JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new Error(`${filePath} is not a JSON offline package`);
  }
  const payload = parsed && typeof parsed === "object" ? parsed.payload : null;
  if (!payload || payload.component !== component) {
    throw new Error(`${filePath} must be a signed ${component} package`);
  }
}

function parseArgs(argv) {
  let core = "";
  let enterprise = "";
  let out = "";
  let trustedRoot = "";
  /** @type {Record<string, string>} */
  const cosignDirs = {};
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = argv[index + 1] ?? "";
    if (flag === "--core") {
      core = value;
      index += 1;
    } else if (flag === "--enterprise") {
      enterprise = value;
      index += 1;
    } else if (flag === "--out") {
      out = value;
      index += 1;
    } else if (flag === "--trusted-root") {
      trustedRoot = value;
      index += 1;
    } else if (flag === "--cosign") {
      const eq = value.indexOf("=");
      if (eq <= 0) {
        throw new Error("--cosign requires <image-key>=<cosign-save-dir>");
      }
      const key = value.slice(0, eq).trim();
      const dir = value.slice(eq + 1).trim();
      if (!key || !dir) {
        throw new Error("--cosign requires <image-key>=<cosign-save-dir>");
      }
      cosignDirs[key] = path.resolve(dir);
      index += 1;
    } else {
      throw new Error(`Unknown argument ${flag ?? ""}`);
    }
  }
  if (!core || !enterprise || !out) {
    throw new Error(
      "Usage: --core <package> --enterprise <package> --out <file.okbundle|file.zip> " +
        "[--trusted-root <file>] [--cosign <key>=<dir>]…",
    );
  }
  if (!out.endsWith(".okbundle") && !out.endsWith(".zip")) {
    throw new Error("Output must end with .okbundle or .zip");
  }
  const hasTrusted = Boolean(trustedRoot);
  const hasCosignDirs = Object.keys(cosignDirs).length > 0;
  if (hasTrusted !== hasCosignDirs) {
    throw new Error("Provide both --trusted-root and at least one --cosign <key>=<dir>");
  }
  return { core, enterprise, out, trustedRoot, cosignDirs };
}
