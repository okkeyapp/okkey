/**
 * Build the signed core offline package and feed.json for a GitHub Release.
 *
 * The signing key is read from OKKEY_CORE_RELEASE_SIGNING_KEY (PKCS#8 PEM).
 * It is never accepted on the command line.
 *
 *   OKKEY_CORE_RELEASE_SIGNING_KEY="$(cat core-release-key.pem)" \
 *   node --experimental-strip-types services/api/src/system-updates/build-core-release-package.ts \
 *     --version 1.2.3 \
 *     --package-url https://github.com/okkeyapp/okkey/releases/download/v1.2.3/okkey-1.2.3.okpkg \
 *     --out /tmp/core-update
 */
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  assertHttpUrl,
  signOfflinePackage,
  UPDATE_FEED_SCHEMA,
  type OfflinePackagePayload,
  type UpdateFeedDocument,
} from "./package-format.ts";
import { compareVersions, parseVersion } from "./versions.ts";

export const CORE_RELEASE_SIGNING_KEY_ENV = "OKKEY_CORE_RELEASE_SIGNING_KEY";

/** Image registry used by the published core package. Matches the GHCR image names. */
export const CORE_RELEASE_IMAGE_REGISTRY = "ghcr.io/okkeyapp";

/**
 * The signed package records a from-version because the format requires one.
 * Update checks compare the installed version with `version`, not this field.
 */
export const CORE_RELEASE_FROM_VERSION = "0.0.0";

export type CoreReleasePublishFlags = {
  /**
   * Always false. GitHub's `releases/latest` skips pre-releases, and the API
   * refuses to mark a pre-release as latest. Beta tags are published as
   * normal releases so the core feed URL can move with them.
   */
  prerelease: false;
  /** True when this version should become the repository's latest release. */
  latest: boolean;
};

export function stripLeadingReleaseV(version: string): string {
  const trimmed = version.trim();
  return trimmed.startsWith("v") ? trimmed.slice(1) : trimmed;
}

export function corePackageFileName(version: string): string {
  return `okkey-${stripLeadingReleaseV(version)}.okpkg`;
}

export function assertCoreReleaseVersion(version: string): string {
  const normalized = stripLeadingReleaseV(version);
  if (!parseVersion(normalized)) {
    throw new Error(`Core release version must be SemVer, got: ${version}`);
  }
  return normalized;
}

/**
 * Decide GitHub latest/prerelease flags for a core release.
 * A republish of the current latest stays latest. An older tag does not
 * replace a newer one. Comparison is SemVer, including beta identifiers.
 */
export function coreReleasePublishFlags(
  version: string,
  currentLatestVersion: string | null | undefined,
): CoreReleasePublishFlags {
  const candidate = assertCoreReleaseVersion(version);
  const currentRaw = (currentLatestVersion ?? "").trim();
  const current = currentRaw ? stripLeadingReleaseV(currentRaw) : "";
  const latest = current === "" || compareVersions(candidate, current) >= 0;
  return { prerelease: false, latest };
}

export function normalizePrivateKeyPem(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    return "";
  }
  return trimmed.replace(/\\n/g, "\n");
}

export function readCoreReleaseSigningKey(env: NodeJS.ProcessEnv = process.env): string {
  const pem = normalizePrivateKeyPem(env[CORE_RELEASE_SIGNING_KEY_ENV] ?? "");
  if (!pem.includes("BEGIN PRIVATE KEY")) {
    throw new Error(
      `${CORE_RELEASE_SIGNING_KEY_ENV} must be an ed25519 PKCS#8 PEM private key`,
    );
  }
  return pem;
}

export type BuiltCoreRelease = {
  version: string;
  fileName: string;
  packageBytes: Buffer;
  packageSha256: string;
  feed: UpdateFeedDocument;
  flags: CoreReleasePublishFlags;
  notes: string;
};

export function buildCoreReleasePackage(input: {
  version: string;
  packageUrl: string;
  privateKeyPem: string;
  fromVersion?: string;
  summary?: string;
  releasedAt?: string;
  currentLatestVersion?: string | null;
  repository?: string;
}): BuiltCoreRelease {
  const version = assertCoreReleaseVersion(input.version);
  const fileName = corePackageFileName(version);
  const packageUrl = assertHttpUrl(input.packageUrl).toString();
  if (!packageUrl.includes(`/releases/download/`) || !packageUrl.endsWith(`/${fileName}`)) {
    throw new Error(`package URL must be the GitHub Release asset URL for ${fileName}`);
  }
  const fromVersion = (input.fromVersion ?? CORE_RELEASE_FROM_VERSION).trim();
  if (!fromVersion) {
    throw new Error("fromVersion is required");
  }
  const releasedAt = (input.releasedAt ?? new Date().toISOString()).trim();
  const summary = (input.summary ?? `Okkey ${version}`).trim().slice(0, 280);
  const payload: OfflinePackagePayload = {
    format: "okkey-offline-package",
    formatVersion: 1,
    component: "okkey",
    version,
    fromVersion,
    summary,
    releasedAt,
    imageTag: version,
    images: {
      api: `${CORE_RELEASE_IMAGE_REGISTRY}/api:${version}`,
      web: `${CORE_RELEASE_IMAGE_REGISTRY}/web:${version}`,
      worker: `${CORE_RELEASE_IMAGE_REGISTRY}/worker:${version}`,
    },
  };
  const signed = signOfflinePackage(payload, normalizePrivateKeyPem(input.privateKeyPem));
  const packageBytes = Buffer.from(`${JSON.stringify(signed, null, 2)}\n`, "utf8");
  const packageSha256 = createHash("sha256").update(packageBytes).digest("hex");
  const feed: UpdateFeedDocument = {
    schema: UPDATE_FEED_SCHEMA,
    packages: [
      {
        component: "okkey",
        version,
        fromVersion,
        summary,
        releasedAt,
        packageUrl,
        packageSha256,
      },
    ],
  };
  const repository = (input.repository ?? "okkeyapp/okkey").trim() || "okkeyapp/okkey";
  return {
    version,
    fileName,
    packageBytes,
    packageSha256,
    feed,
    flags: coreReleasePublishFlags(version, input.currentLatestVersion),
    notes: coreReleaseNotes(version, repository),
  };
}

export function coreReleaseNotes(version: string, repository: string): string {
  const normalized = assertCoreReleaseVersion(version);
  const fileName = corePackageFileName(normalized);
  const beta = parseVersion(normalized)?.prerelease.length
    ? [
        "",
        "This tag is a beta. The GitHub Release is not marked as a pre-release.",
        "GitHub's releases/latest listing skips pre-releases, and a pre-release cannot be marked latest.",
        "The core update feed is served from that URL, so beta tags stay on the normal release list.",
        "",
      ].join("\n")
    : "\n";
  return [
    `Okkey core ${normalized}`,
    "",
    "Assets:",
    "- feed.json — core update feed (okkey.update-feed.v1)",
    `- ${fileName} — signed offline core package (okkey-offline-package)`,
    "",
    "feed.json points at the package asset on this same release.",
    `Newest core feed: https://github.com/${repository}/releases/latest/download/feed.json`,
    beta.trimEnd(),
    "",
  ].join("\n");
}

export function writeCoreReleaseFiles(dir: string, built: BuiltCoreRelease): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, built.fileName), built.packageBytes);
  writeFileSync(path.join(dir, "feed.json"), `${JSON.stringify(built.feed, null, 2)}\n`);
  writeFileSync(path.join(dir, "release-notes.md"), built.notes);
  writeFileSync(
    path.join(dir, "release-flags"),
    `latest=${built.flags.latest ? "true" : "false"}\nprerelease=false\n`,
  );
}

function argValue(argv: string[], name: string): string | undefined {
  const index = argv.indexOf(name);
  if (index === -1) {
    return undefined;
  }
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${name} requires a value`);
  }
  return value;
}

function runCli(argv: string[]): void {
  const version = argValue(argv, "--version");
  const packageUrl = argValue(argv, "--package-url");
  const outDir = argValue(argv, "--out");
  if (!version || !packageUrl || !outDir) {
    throw new Error("--version, --package-url, and --out are required");
  }
  const privateKeyPem = readCoreReleaseSigningKey();
  const built = buildCoreReleasePackage({
    version,
    packageUrl,
    privateKeyPem,
    fromVersion: argValue(argv, "--from-version"),
    summary: argValue(argv, "--summary"),
    releasedAt: argValue(argv, "--released-at"),
    currentLatestVersion: argValue(argv, "--current-latest") ?? "",
    repository: argValue(argv, "--repository"),
  });
  writeCoreReleaseFiles(path.resolve(outDir), built);
  process.stdout.write(`Wrote ${built.fileName} and feed.json (${built.packageSha256})\n`);
  process.stdout.write(`latest=${built.flags.latest ? "true" : "false"}\n`);
}

const invoked = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invoked && invoked === fileURLToPath(import.meta.url)) {
  try {
    runCli(process.argv.slice(2));
  } catch (error) {
    const message = error instanceof Error ? error.message : "core release package failed";
    process.stderr.write(`${message}\n`);
    process.exit(1);
  }
}
