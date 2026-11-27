/**
 * ENTERPRISE_MODULES grammar: true / all / comma list → requested;
 * empty / false / 0 → off; unknown tokens → warn list, never enable extras.
 */
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { loadConfig } from "../src/config.ts";
import {
  enterpriseModulesUnknownTokens,
  isEnterpriseModulesRequested,
  parseEnterpriseModulesEnv,
} from "../src/enterprise-modules-env.ts";

function withEnv(vars: Record<string, string | undefined>, run: () => void | Promise<void>) {
  const snapshot = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(vars)) {
    snapshot.set(key, process.env[key]);
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  return Promise.resolve()
    .then(() => run())
    .finally(() => {
      for (const [key, value] of snapshot.entries()) {
        if (value === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = value;
        }
      }
    });
}

test("parse: unset / empty / whitespace → not requested", () => {
  for (const raw of [undefined, "", "   "]) {
    const parsed = parseEnterpriseModulesEnv(raw);
    assert.equal(parsed.kind, "unset");
    assert.equal(isEnterpriseModulesRequested(parsed), false);
    assert.deepEqual(enterpriseModulesUnknownTokens(parsed), []);
  }
});

test("parse: true / 1 / yes / all → requested", () => {
  for (const raw of ["true", "TRUE", "1", "yes", "YES", "all", "ALL", " all "]) {
    const parsed = parseEnterpriseModulesEnv(raw);
    assert.equal(parsed.kind, "boolean");
    if (parsed.kind === "boolean") {
      assert.equal(parsed.enabled, true);
    }
    assert.equal(isEnterpriseModulesRequested(parsed), true);
  }
});

test("parse: false / 0 / no / none → not requested", () => {
  for (const raw of ["false", "FALSE", "0", "no", "none", "NONE"]) {
    const parsed = parseEnterpriseModulesEnv(raw);
    assert.equal(parsed.kind, "boolean");
    if (parsed.kind === "boolean") {
      assert.equal(parsed.enabled, false);
    }
    assert.equal(isEnterpriseModulesRequested(parsed), false);
  }
});

test("parse: known comma list → requested with features", () => {
  const parsed = parseEnterpriseModulesEnv("customWorkspaceRoles,monitoring");
  assert.equal(parsed.kind, "allowlist");
  if (parsed.kind === "allowlist") {
    assert.deepEqual([...parsed.features], ["customWorkspaceRoles", "monitoring"]);
    assert.deepEqual([...parsed.unknownTokens], []);
  }
  assert.equal(isEnterpriseModulesRequested(parsed), true);
});

test("parse: single known module id → requested", () => {
  const parsed = parseEnterpriseModulesEnv("customWorkspaceRoles");
  assert.equal(isEnterpriseModulesRequested(parsed), true);
  assert.equal(parsed.kind, "allowlist");
  if (parsed.kind === "allowlist") {
    assert.deepEqual([...parsed.features], ["customWorkspaceRoles"]);
  }
});

test("parse: unknown tokens only → not requested, tokens collected", () => {
  const parsed = parseEnterpriseModulesEnv("notAModule,alsoFake");
  assert.equal(parsed.kind, "allowlist");
  if (parsed.kind === "allowlist") {
    assert.deepEqual([...parsed.features], []);
    assert.deepEqual([...parsed.unknownTokens], ["notAModule", "alsoFake"]);
  }
  assert.equal(isEnterpriseModulesRequested(parsed), false);
});

test("parse: mixed known + unknown → requested, unknowns collected, no extras", () => {
  const parsed = parseEnterpriseModulesEnv("customWorkspaceRoles,bogus,monitoring,bogus");
  assert.equal(parsed.kind, "allowlist");
  if (parsed.kind === "allowlist") {
    assert.deepEqual([...parsed.features], ["customWorkspaceRoles", "monitoring"]);
    assert.deepEqual([...parsed.unknownTokens], ["bogus"]);
  }
  assert.equal(isEnterpriseModulesRequested(parsed), true);
});

test("loadConfig: ENTERPRISE_MODULES=all loads plugin when path loadable", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "okkey-em-all-"));
  try {
    mkdirSync(path.join(dir, "backend/api-plugin"), { recursive: true });
    writeFileSync(path.join(dir, "backend/api-plugin/index.ts"), "export {};\n");
    await withEnv(
      {
        ENTERPRISE_MODULES: "all",
        ENTERPRISE_MODULES_PATH: dir,
        OKKEY_DEPLOYMENT_MODE: "self_hosted",
      },
      () => {
        const cfg = loadConfig();
        assert.equal(cfg.enterpriseModulesEnv, "all");
        assert.equal(cfg.enterpriseModulesRequested, true);
        assert.equal(cfg.enterpriseModulesEnabled, true);
        assert.deepEqual([...cfg.enterpriseModulesUnknownTokens], []);
        assert.equal(cfg.enterpriseLicenseVerified, false);
      },
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("loadConfig: comma list requests plugin; raw env preserved", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "okkey-em-list-"));
  try {
    mkdirSync(path.join(dir, "backend/api-plugin"), { recursive: true });
    writeFileSync(path.join(dir, "backend/api-plugin/index.ts"), "export {};\n");
    await withEnv(
      {
        ENTERPRISE_MODULES: "customWorkspaceRoles,capsuleAccessSettings",
        ENTERPRISE_MODULES_PATH: dir,
        OKKEY_DEPLOYMENT_MODE: "self_hosted",
      },
      () => {
        const cfg = loadConfig();
        assert.equal(cfg.enterpriseModulesEnv, "customWorkspaceRoles,capsuleAccessSettings");
        assert.equal(cfg.enterpriseModulesRequested, true);
        assert.equal(cfg.enterpriseModulesEnabled, true);
        assert.equal(cfg.enterpriseLicenseVerified, false);
      },
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("loadConfig: unknown-only list does not request plugin", async () => {
  await withEnv(
    {
      ENTERPRISE_MODULES: "notARealModule",
      ENTERPRISE_MODULES_PATH: path.join(tmpdir(), "okkey-em-unused"),
      OKKEY_DEPLOYMENT_MODE: "self_hosted",
    },
    () => {
      const cfg = loadConfig();
      assert.equal(cfg.enterpriseModulesRequested, false);
      assert.equal(cfg.enterpriseModulesEnabled, false);
      assert.deepEqual([...cfg.enterpriseModulesUnknownTokens], ["notARealModule"]);
    },
  );
});
