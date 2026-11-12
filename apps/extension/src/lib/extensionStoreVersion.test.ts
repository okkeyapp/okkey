import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  DEV_PRODUCT_VERSION,
  ExtensionStoreVersionError,
  assertStoreVersionAboveFloor,
  compareStoreVersions,
  parseLastSubmittedStoreVersion,
  productSemverToStoreVersion,
  resolveExtensionManifestVersion,
} from "./extensionStoreVersion.ts";

const extensionRoot = fileURLToPath(new URL("../..", import.meta.url));
const repoRoot = fileURLToPath(new URL("../../../..", import.meta.url));
const floorPath = fileURLToPath(
  new URL("../../store/LAST_SUBMITTED_MANIFEST_VERSION", import.meta.url),
);
const wxtConfigPath = fileURLToPath(new URL("../../wxt.config.ts", import.meta.url));
const cliPath = fileURLToPath(new URL("../../scripts/store-version.ts", import.meta.url));

function readFloor(): string {
  return parseLastSubmittedStoreVersion(readFileSync(floorPath, "utf8"));
}

function readPackageVersion(path: string): string {
  const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
  assert.ok(parsed !== null && typeof parsed === "object" && "version" in parsed);
  const version = (parsed as { version: unknown }).version;
  assert.equal(typeof version, "string");
  return version;
}

test("maps beta, rc, and stable product SemVer to four store integers", () => {
  assert.equal(productSemverToStoreVersion("1.0.0-beta.2"), "1.0.0.2");
  assert.equal(productSemverToStoreVersion("1.0.0-beta.11"), "1.0.0.11");
  assert.equal(productSemverToStoreVersion("1.0.0-rc.1"), "1.0.0.101");
  assert.equal(productSemverToStoreVersion("1.0.0-rc.99"), "1.0.0.199");
  assert.equal(productSemverToStoreVersion("1.0.0"), "1.0.0.1000");
  assert.equal(productSemverToStoreVersion("1.0.1"), "1.0.1.1000");
  assert.equal(productSemverToStoreVersion(" 1.0.0-beta.2 "), "1.0.0.2");
});

test("compares the fourth component numerically, not lexicographically", () => {
  const beta2 = productSemverToStoreVersion("1.0.0-beta.2");
  const beta11 = productSemverToStoreVersion("1.0.0-beta.11");
  const rc1 = productSemverToStoreVersion("1.0.0-rc.1");
  const stable = productSemverToStoreVersion("1.0.0");
  const nextPatch = productSemverToStoreVersion("1.0.1");
  assert.equal(beta2, "1.0.0.2");
  assert.equal(beta11, "1.0.0.11");
  assert.ok(compareStoreVersions(beta11, beta2) > 0);
  assert.ok(compareStoreVersions("1.0.0.11", "1.0.0.2") > 0);
  assert.ok(compareStoreVersions(beta2, rc1) < 0);
  assert.ok(compareStoreVersions(rc1, stable) < 0);
  assert.ok(compareStoreVersions(stable, nextPatch) < 0);
  assert.equal(compareStoreVersions(stable, "1.0.0.1000"), 0);
});

test("rejects product versions that are not a store-mappable SemVer", () => {
  const rejected = [
    "1.0.0-beta.0",
    "1.0.0-beta",
    "1.0.0-beta.100",
    "1.0.0-rc.0",
    "1.0.0-rc",
    "1.0.0-rc.100",
    "1.0.0-alpha.1",
    "1.0.0-BETA.1",
    "1.0.0-beta.01",
    "1.0.0-beta.2.1",
    "1.0",
    "1.0.0.2",
    "v1.0.0",
    "01.0.0",
    "1.0.0+build",
    "65536.0.0",
    "1.0.65536",
    "",
    "beta.2",
  ];
  for (const semver of rejected) {
    assert.throws(
      () => productSemverToStoreVersion(semver),
      ExtensionStoreVersionError,
      semver,
    );
  }
});

test("accepts the maximum component and rejects a store version above it", () => {
  assert.equal(productSemverToStoreVersion("65535.0.0"), "65535.0.0.1000");
  assert.throws(
    () => compareStoreVersions("1.0.0.65536", "1.0.0.1"),
    ExtensionStoreVersionError,
  );
});

test("floor file rejects a store version that is not strictly newer", () => {
  const floor = readFloor();
  assert.equal(compareStoreVersions(productSemverToStoreVersion("1.0.0-beta.2"), floor) <= 0, true);
  assert.throws(
    () => assertStoreVersionAboveFloor(floor, floor),
    ExtensionStoreVersionError,
  );
  assert.throws(
    () => assertStoreVersionAboveFloor("0.0.0.0", floor),
    ExtensionStoreVersionError,
  );
  const newer = productSemverToStoreVersion("1.0.0-beta.11");
  if (compareStoreVersions(newer, floor) > 0) {
    assert.doesNotThrow(() => assertStoreVersionAboveFloor(newer, floor));
  }
});

test("dev builds stay below the floor and release builds must clear it", () => {
  const floor = "1.0.0.2";
  const dev = resolveExtensionManifestVersion({
    rootVersion: DEV_PRODUCT_VERSION,
    extensionPackageVersion: "1.0.0",
    floor,
  });
  assert.equal(dev.mode, "dev");
  assert.equal(dev.manifestVersion, "0.0.0.0");
  assert.equal(dev.productSemver, null);
  assert.ok(compareStoreVersions(dev.manifestVersion, floor) < 0);

  const counted = resolveExtensionManifestVersion({
    rootVersion: DEV_PRODUCT_VERSION,
    extensionPackageVersion: "1.0.0",
    devBuildCounterEnv: "7",
    floor,
  });
  assert.equal(counted.manifestVersion, "0.0.0.7");

  assert.throws(
    () =>
      resolveExtensionManifestVersion({
        rootVersion: DEV_PRODUCT_VERSION,
        extensionPackageVersion: "1.0.0",
        devBuildCounterEnv: "1",
        floor: "0.0.0.1",
      }),
    /strictly below the store floor/,
  );

  const release = resolveExtensionManifestVersion({
    rootVersion: "1.0.0-beta.3",
    extensionPackageVersion: "1.0.0-beta.3",
    floor,
  });
  assert.equal(release.mode, "release");
  assert.equal(release.productSemver, "1.0.0-beta.3");
  assert.equal(release.manifestVersion, "1.0.0.3");

  assert.throws(
    () =>
      resolveExtensionManifestVersion({
        rootVersion: "1.0.0-beta.2",
        extensionPackageVersion: "1.0.0-beta.2",
        floor,
      }),
    /must be greater than the last submitted version/,
  );

  assert.throws(
    () =>
      resolveExtensionManifestVersion({
        rootVersion: DEV_PRODUCT_VERSION,
        extensionPackageVersion: "1.0.0",
        storeReleaseEnv: "1",
        floor,
      }),
    /Refusing a store manifest/,
  );

  assert.throws(
    () =>
      resolveExtensionManifestVersion({
        rootVersion: DEV_PRODUCT_VERSION,
        extensionPackageVersion: "1.0.0",
        storeReleaseEnv: "1",
        productVersionEnv: "1.0.0-beta.3",
        floor,
      }),
    /must equal the release product SemVer/,
  );

  const explicit = resolveExtensionManifestVersion({
    rootVersion: DEV_PRODUCT_VERSION,
    extensionPackageVersion: "1.0.0-rc.1",
    storeReleaseEnv: "1",
    productVersionEnv: "1.0.0-rc.1",
    floor,
  });
  assert.equal(explicit.manifestVersion, "1.0.0.101");

  assert.throws(
    () =>
      resolveExtensionManifestVersion({
        rootVersion: "1.0.0-beta.3",
        extensionPackageVersion: "1.0.0",
        floor,
      }),
    /must equal the release product SemVer/,
  );
});

test("this checkout's manifest version respects the submitted floor", () => {
  const floor = readFloor();
  const rootVersion = readPackageVersion(`${repoRoot}/package.json`);
  const extensionPackageVersion = readPackageVersion(`${extensionRoot}/package.json`);
  const resolved = resolveExtensionManifestVersion({
    rootVersion,
    extensionPackageVersion,
    floor,
  });
  if (rootVersion === DEV_PRODUCT_VERSION) {
    assert.equal(resolved.mode, "dev");
    assert.equal(resolved.manifestVersion, "0.0.0.0");
    assert.ok(compareStoreVersions(resolved.manifestVersion, floor) < 0);
    assert.throws(() =>
      resolveExtensionManifestVersion({
        rootVersion,
        extensionPackageVersion,
        storeReleaseEnv: "1",
        floor,
      }),
    );
    return;
  }
  assert.equal(resolved.mode, "release");
  assert.equal(extensionPackageVersion, rootVersion);
  assert.ok(compareStoreVersions(resolved.manifestVersion, floor) > 0);
});

test("store zip scripts pass the extension package version as the product SemVer", () => {
  const pkg = JSON.parse(readFileSync(`${extensionRoot}/package.json`, "utf8")) as {
    scripts: Record<string, string>;
  };
  for (const name of ["zip", "zip:chromium", "zip:firefox", "zip:store"] as const) {
    const script = pkg.scripts[name];
    assert.equal(typeof script, "string");
    assert.match(script, /OKKEY_EXTENSION_STORE_RELEASE=1/);
    assert.match(script, /OKKEY_PRODUCT_VERSION=/);
    assert.match(script, /ensure-store-wasm\.mjs/);
    assert.match(script, /package\.json/);
  }
});

test("AMO sources allowlist includes a rebuildable workspace slice", () => {
  const source = readFileSync(wxtConfigPath, "utf8");
  for (const entry of [
    '"package.json"',
    '"yarn.lock"',
    '"scripts/ensure-crypto-wasm-dist.mjs"',
    '"apps/extension/store/*.md"',
    '"packages/api/src/**"',
    '"packages/auth/src/**"',
    '"packages/crypto/src/**"',
    '"packages/crypto/scripts/**"',
    '"packages/i18n/src/**"',
    '"packages/email-templates/package.json"',
    '"packages/sync/src/**"',
    '"packages/types/src/**"',
    '"packages/ui/src/**"',
    '"packages/vault/src/**"',
    '"packages/vault-ui/src/**"',
    '"rust/crypto-engine/Cargo.toml"',
    '"rust/crypto-engine/Cargo.lock"',
  ]) {
    assert.ok(source.includes(entry), entry);
  }
  assert.match(source, /description:\s*"__MSG_extDescription__"/);
  assert.match(source, /default_locale:\s*"en"/);
  assert.match(source, /data_collection_permissions:/);
});

test("wxt.config.ts does not hardcode a manifest version", () => {
  const source = readFileSync(wxtConfigPath, "utf8");
  assert.match(source, /resolveExtensionManifestVersion/);
  assert.match(source, /LAST_SUBMITTED_MANIFEST_VERSION/);
  const code = source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
  assert.doesNotMatch(code, /version_name\s*:/);
  assert.doesNotMatch(code, /["'`]v?\d+\.\d+\.\d+(?:\.\d+)?(?:-[0-9A-Za-z.]+)?["'`]/);
});

test("store-version CLI prints the product SemVer and the store number", () => {
  const ok = spawnSync(
    process.execPath,
    ["--experimental-strip-types", cliPath, "1.0.0-beta.11"],
    { encoding: "utf8" },
  );
  assert.equal(ok.status, 0, ok.stderr);
  assert.equal(ok.stdout, "product 1.0.0-beta.11\nstore 1.0.0.11\n");

  const stable = spawnSync(
    process.execPath,
    ["--experimental-strip-types", cliPath, "1.0.1"],
    { encoding: "utf8" },
  );
  assert.equal(stable.status, 0, stable.stderr);
  assert.equal(stable.stdout, "product 1.0.1\nstore 1.0.1.1000\n");

  const bad = spawnSync(
    process.execPath,
    ["--experimental-strip-types", cliPath, "1.0.0-beta"],
    { encoding: "utf8" },
  );
  assert.notEqual(bad.status, 0);
  assert.match(bad.stderr, /Unsupported product SemVer/);
});
