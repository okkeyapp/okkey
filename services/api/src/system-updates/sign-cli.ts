/**
 * Sign an okkey-offline-package and write a local update feed.
 *
 *   node --experimental-strip-types services/api/src/system-updates/sign-cli.ts \
 *     1.1.0 1.0.0-beta.2 /tmp/okkey-update
 *
 * Serve `/tmp/okkey-update` over HTTP and set OKKEY_UPDATE_FEED_URL to the feed file.
 * Set OKKEY_UPDATE_TRUSTED_PUBLIC_KEY to the printed public key.
 */
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import {
  generateUpdateKeyPair,
  signOfflinePackage,
  type OfflinePackagePayload,
} from "./package-format.ts";

const version = process.argv[2] ?? "1.1.0";
const fromVersion = process.argv[3] ?? "1.0.0-beta.2";
const outDir = path.resolve(process.argv[4] ?? "deploy/docker/fixtures/generated");
const packageName = `okkey-${version}.okpkg`;

const payload: OfflinePackagePayload = {
  format: "okkey-offline-package",
  formatVersion: 1,
  component: "okkey",
  version,
  fromVersion,
  summary: "Signed example package for a local update feed.",
  releasedAt: new Date().toISOString(),
  imageTag: version,
  images: {
    api: `ghcr.io/okkeyapp/api:${version}`,
    web: `ghcr.io/okkeyapp/web:${version}`,
    worker: `ghcr.io/okkeyapp/worker:${version}`,
  },
};

const keys = generateUpdateKeyPair();
const signed = signOfflinePackage(payload, keys.privateKeyPem);
const bytes = Buffer.from(`${JSON.stringify(signed, null, 2)}\n`, "utf8");
const sha256 = createHash("sha256").update(bytes).digest("hex");
const feed = {
  schema: "okkey.update-feed.v1",
  packages: [
    {
      component: "okkey",
      version,
      fromVersion,
      summary: payload.summary,
      releasedAt: payload.releasedAt,
      packageUrl: `http://127.0.0.1:8099/${packageName}`,
      packageSha256: sha256,
    },
  ],
};

mkdirSync(outDir, { recursive: true });
writeFileSync(path.join(outDir, packageName), bytes);
writeFileSync(path.join(outDir, "update-feed.v1.json"), `${JSON.stringify(feed, null, 2)}\n`);
writeFileSync(path.join(outDir, "update-public-key.pem"), keys.publicKeyPem);
process.stdout.write(`Wrote ${outDir}\n`);
process.stdout.write(`Feed packageUrl expects this directory on http://127.0.0.1:8099\n`);
process.stdout.write(`Public key:\n${keys.publicKeyPem}`);
