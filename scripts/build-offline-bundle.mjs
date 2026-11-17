/**
 * Build one offline archive from a signed core package and a signed enterprise package.
 *
 *   node --experimental-strip-types scripts/build-offline-bundle.mjs \
 *     --core core.okpkg --enterprise enterprise.okpkg --out okkey.okbundle
 *
 * A path ending in `.okbundle` writes a JSON document whose `archiveBase64` is the zip.
 * A path ending in `.zip` writes that same zip. The packages are read as bytes and are
 * not rebuilt in this repository.
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

  const built = buildOfflineBundle(core, enterprise);
  mkdirSync(path.dirname(path.resolve(args.out)), { recursive: true });
  if (args.out.endsWith(".zip")) {
    writeFileSync(args.out, built.zip);
  } else {
    writeFileSync(args.out, `${JSON.stringify(built.document)}\n`);
  }
  process.stdout.write(`Wrote ${args.out}\n`);
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
    } else {
      throw new Error(`Unknown argument ${flag ?? ""}`);
    }
  }
  if (!core || !enterprise || !out) {
    throw new Error("Usage: --core <package> --enterprise <package> --out <file.okbundle|file.zip>");
  }
  if (!out.endsWith(".okbundle") && !out.endsWith(".zip")) {
    throw new Error("Output must end with .okbundle or .zip");
  }
  return { core, enterprise, out };
}
