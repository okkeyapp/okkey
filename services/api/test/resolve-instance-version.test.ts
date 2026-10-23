import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  DEFAULT_PRODUCT_VERSION,
  resolveInstanceVersion,
} from "../src/version/resolve-instance-version.ts";

test("resolveInstanceVersion prefers OKKEY_VERSION over package.json", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "okkey-version-"));
  const corePackageJsonPath = path.join(dir, "package.json");
  writeFileSync(corePackageJsonPath, JSON.stringify({ version: "9.9.9" }), "utf8");

  const payload = resolveInstanceVersion({
    deploymentMode: "self_hosted",
    enterpriseModulesEnabled: false,
    enterpriseModulesPath: "",
    env: { OKKEY_VERSION: "1.2.3", OKKEY_IMAGE_TAG: "dev" },
    corePackageJsonPath,
  });

  assert.equal(payload.okkey, "1.2.3");
  assert.equal(payload.enterprise, null);
  assert.equal(payload.deploymentMode, "self_hosted");
  assert.equal(payload.enterpriseModulesEnabled, false);
});

test("resolveInstanceVersion skips npm placeholder package.json and non-semver image tag", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "okkey-version-"));
  const corePackageJsonPath = path.join(dir, "package.json");
  writeFileSync(corePackageJsonPath, JSON.stringify({ version: "0.0.1" }), "utf8");

  const fromDevTag = resolveInstanceVersion({
    deploymentMode: "saas",
    enterpriseModulesEnabled: false,
    enterpriseModulesPath: "",
    env: { OKKEY_IMAGE_TAG: "dev-abc" },
    corePackageJsonPath,
  });
  assert.equal(fromDevTag.okkey, DEFAULT_PRODUCT_VERSION);

  const fromSemverTag = resolveInstanceVersion({
    deploymentMode: "saas",
    enterpriseModulesEnabled: false,
    enterpriseModulesPath: "",
    env: { OKKEY_IMAGE_TAG: "1.2.3" },
    corePackageJsonPath: path.join(dir, "missing-package.json"),
  });
  assert.equal(fromSemverTag.okkey, "1.2.3");

  const fromRealPkg = resolveInstanceVersion({
    deploymentMode: "saas",
    enterpriseModulesEnabled: false,
    enterpriseModulesPath: "",
    env: {},
    corePackageJsonPath: (() => {
      const p = path.join(dir, "real-package.json");
      writeFileSync(p, JSON.stringify({ version: "1.4.0" }), "utf8");
      return p;
    })(),
  });
  assert.equal(fromRealPkg.okkey, "1.4.0");
});

test("resolveInstanceVersion reads OKKEY_VERSION_FILE after env", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "okkey-version-file-"));
  const versionFilePath = path.join(dir, "version.json");
  writeFileSync(
    versionFilePath,
    JSON.stringify({ okkey: "1.0.0-betta.4", enterprise: "1.0.0-betta.4" }),
    "utf8",
  );

  const payload = resolveInstanceVersion({
    deploymentMode: "self_hosted",
    enterpriseModulesEnabled: true,
    enterpriseModulesPath: "/missing",
    env: {},
    corePackageJsonPath: "/missing/package.json",
    versionFilePath,
  });
  assert.equal(payload.okkey, "1.0.0-betta.4");
  assert.equal(payload.enterprise, "1.0.0-betta.4");
});

test("resolveInstanceVersion includes enterprise when modules enabled", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "okkey-version-ee-"));
  const corePackageJsonPath = path.join(dir, "core-package.json");
  const enterprisePackageJsonPath = path.join(dir, "ee-package.json");
  writeFileSync(corePackageJsonPath, JSON.stringify({ version: "1.0.0-betta.3" }), "utf8");
  writeFileSync(enterprisePackageJsonPath, JSON.stringify({ version: "1.0.0-betta.3" }), "utf8");

  const payload = resolveInstanceVersion({
    deploymentMode: "self_hosted",
    enterpriseModulesEnabled: true,
    enterpriseModulesPath: dir,
    env: {},
    corePackageJsonPath,
    enterprisePackageJsonPath,
  });

  assert.equal(payload.okkey, "1.0.0-betta.3");
  assert.equal(payload.enterprise, "1.0.0-betta.3");
  assert.equal(payload.enterpriseModulesEnabled, true);
});

test("resolveInstanceVersion prefers OKKEY_ENTERPRISE_VERSION", () => {
  const payload = resolveInstanceVersion({
    deploymentMode: "self_hosted",
    enterpriseModulesEnabled: true,
    enterpriseModulesPath: "/missing",
    env: { OKKEY_VERSION: "1.0.0-betta.3", OKKEY_ENTERPRISE_VERSION: "1.0.0-betta.3" },
    corePackageJsonPath: "/missing/package.json",
  });

  assert.equal(payload.okkey, "1.0.0-betta.3");
  assert.equal(payload.enterprise, "1.0.0-betta.3");
});
