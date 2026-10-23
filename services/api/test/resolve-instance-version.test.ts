import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { resolveInstanceVersion } from "../src/version/resolve-instance-version.ts";

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

test("resolveInstanceVersion falls back to OKKEY_IMAGE_TAG then package.json", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "okkey-version-"));
  const corePackageJsonPath = path.join(dir, "package.json");
  writeFileSync(corePackageJsonPath, JSON.stringify({ version: "0.0.1" }), "utf8");

  const fromTag = resolveInstanceVersion({
    deploymentMode: "saas",
    enterpriseModulesEnabled: false,
    enterpriseModulesPath: "",
    env: { OKKEY_IMAGE_TAG: "dev-abc" },
    corePackageJsonPath,
  });
  assert.equal(fromTag.okkey, "dev-abc");

  const fromPkg = resolveInstanceVersion({
    deploymentMode: "saas",
    enterpriseModulesEnabled: false,
    enterpriseModulesPath: "",
    env: {},
    corePackageJsonPath,
  });
  assert.equal(fromPkg.okkey, "0.0.1");
});

test("resolveInstanceVersion includes enterprise when modules enabled", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "okkey-version-ee-"));
  const corePackageJsonPath = path.join(dir, "core-package.json");
  const enterprisePackageJsonPath = path.join(dir, "ee-package.json");
  writeFileSync(corePackageJsonPath, JSON.stringify({ version: "0.0.1" }), "utf8");
  writeFileSync(enterprisePackageJsonPath, JSON.stringify({ version: "1.0.0-beta.1" }), "utf8");

  const payload = resolveInstanceVersion({
    deploymentMode: "self_hosted",
    enterpriseModulesEnabled: true,
    enterpriseModulesPath: dir,
    env: {},
    corePackageJsonPath,
    enterprisePackageJsonPath,
  });

  assert.equal(payload.okkey, "0.0.1");
  assert.equal(payload.enterprise, "1.0.0-beta.1");
  assert.equal(payload.enterpriseModulesEnabled, true);
});

test("resolveInstanceVersion prefers OKKEY_ENTERPRISE_VERSION", () => {
  const payload = resolveInstanceVersion({
    deploymentMode: "self_hosted",
    enterpriseModulesEnabled: true,
    enterpriseModulesPath: "/missing",
    env: { OKKEY_VERSION: "1.0.0", OKKEY_ENTERPRISE_VERSION: "2.0.0" },
    corePackageJsonPath: "/missing/package.json",
  });

  assert.equal(payload.okkey, "1.0.0");
  assert.equal(payload.enterprise, "2.0.0");
});
