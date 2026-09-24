import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { applyEnterpriseBackendEnvToProcess, loadEnterpriseBackendEnv } from "../src/enterpriseEnv.ts";

test("loadEnterpriseBackendEnv returns empty when dir missing", () => {
  assert.deepEqual(loadEnterpriseBackendEnv("/tmp/okkey-enterprise-backend-env-missing"), {});
});

test("loadEnterpriseBackendEnv loads OKKEY_DEPLOYMENT_MODE and skips bootstrap", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "okkey-ent-api-env-"));
  try {
    fs.writeFileSync(
      path.join(dir, ".env"),
      [
        "ENTERPRISE_MODULES=false",
        "OKKEY_DEPLOYMENT_MODE=saas",
        "NOT_ALLOWED=ignored",
        "",
      ].join("\n"),
      "utf8",
    );
    assert.deepEqual(loadEnterpriseBackendEnv(dir), {
      OKKEY_DEPLOYMENT_MODE: "saas",
    });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("applyEnterpriseBackendEnvToProcess overwrites owned keys", () => {
  const prev = process.env.OKKEY_DEPLOYMENT_MODE;
  try {
    process.env.OKKEY_DEPLOYMENT_MODE = "self_hosted";
    applyEnterpriseBackendEnvToProcess({ OKKEY_DEPLOYMENT_MODE: "saas" });
    assert.equal(process.env.OKKEY_DEPLOYMENT_MODE, "saas");
  } finally {
    if (prev === undefined) {
      delete process.env.OKKEY_DEPLOYMENT_MODE;
    } else {
      process.env.OKKEY_DEPLOYMENT_MODE = prev;
    }
  }
});
