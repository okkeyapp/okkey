import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { isEnterpriseBackendLoadable, loadConfig } from "../src/config.ts";
import { loadEnterprisePlugins } from "../src/plugins/load-enterprise-plugins.ts";
import { createTestApiConfig } from "./test-api-config.ts";

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

test("isEnterpriseBackendLoadable requires api-plugin entry", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "okkey-ent-fc-"));
  try {
    assert.equal(isEnterpriseBackendLoadable(dir), false);
    mkdirSync(path.join(dir, "backend/api-plugin"), { recursive: true });
    writeFileSync(path.join(dir, "backend/api-plugin/index.ts"), "export {};\n");
    assert.equal(isEnterpriseBackendLoadable(dir), true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("loadConfig fail-closes when ENTERPRISE_MODULES=true but path missing", async () => {
  await withEnv(
    {
      ENTERPRISE_MODULES: "true",
      ENTERPRISE_MODULES_PATH: path.join(tmpdir(), "okkey-enterprise-missing-sibling"),
      OKKEY_DEPLOYMENT_MODE: "self_hosted",
    },
    () => {
      const cfg = loadConfig();
      assert.equal(cfg.enterpriseModulesEnabled, false);
      assert.equal(cfg.defaultWorkspacePlanTier, "FREE");
    },
  );
});

test("loadConfig enables modules when sibling plugin entry exists", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "okkey-ent-ok-"));
  try {
    mkdirSync(path.join(dir, "backend/api-plugin"), { recursive: true });
    writeFileSync(path.join(dir, "backend/api-plugin/index.ts"), "export {};\n");
    mkdirSync(path.join(dir, "backend"), { recursive: true });
    writeFileSync(path.join(dir, "backend/.env"), "OKKEY_DEPLOYMENT_MODE=self_hosted\n");
    await withEnv(
      {
        ENTERPRISE_MODULES: "true",
        ENTERPRISE_MODULES_PATH: dir,
        OKKEY_DEPLOYMENT_MODE: undefined,
      },
      () => {
        const cfg = loadConfig();
        assert.equal(cfg.enterpriseModulesEnabled, true);
        assert.equal(cfg.defaultWorkspacePlanTier, "FREE");
        assert.equal(cfg.deploymentMode, "self_hosted");
      },
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("loadEnterprisePlugins fail-closes on import error", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "okkey-ent-bad-"));
  try {
    mkdirSync(path.join(dir, "backend/api-plugin"), { recursive: true });
    writeFileSync(
      path.join(dir, "backend/api-plugin/index.ts"),
      "throw new Error('boom');\n",
    );
    const result = await loadEnterprisePlugins(
      createTestApiConfig({
        enterpriseModulesEnabled: true,
        enterpriseModulesPath: dir,
      }),
    );
    assert.deepEqual(result.plugins, []);
    assert.equal(result.enterpriseModulesActive, false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
