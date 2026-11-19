import assert from "node:assert/strict";
import test from "node:test";

import { loadConfig, resolveSalesEmail } from "../src/config.ts";
import {
  applyApiTestSalesEmailDefault,
  TEST_OKKEY_SALES_EMAIL,
} from "./test-sales-email-default.ts";

function withEnv(vars: Record<string, string | undefined>, run: () => void): void {
  const snapshot = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(vars)) {
    snapshot.set(key, process.env[key]);
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  try {
    run();
  } finally {
    for (const [key, value] of snapshot.entries()) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

test("resolveSalesEmail requires an explicit address", () => {
  assert.throws(() => resolveSalesEmail(undefined), /OKKEY_SALES_EMAIL is required/);
  assert.throws(() => resolveSalesEmail(""), /OKKEY_SALES_EMAIL is required/);
  assert.throws(() => resolveSalesEmail("   "), /OKKEY_SALES_EMAIL is required/);
  assert.throws(() => resolveSalesEmail("not-an-email"), /valid email/);
});

test("resolveSalesEmail accepts a trimmed address", () => {
  assert.equal(resolveSalesEmail("  sales@example.com  "), "sales@example.com");
});

test("loadConfig throws without OKKEY_SALES_EMAIL outside test preload", () => {
  // Empty string (not delete): loadEnvFile only fills undefined keys, so a local
  // `.env` cannot reintroduce a value and mask the fail-closed check.
  withEnv(
    {
      NODE_ENV: "production",
      DEPLOY_ENV: "prod",
      OKKEY_SALES_EMAIL: "",
      CRYPTO_ALLOWED_PROFILE_VERSIONS: "2",
      CRYPTO_ROLLOUT_MODE: "strict",
    },
    () => {
      assert.throws(() => loadConfig(), /OKKEY_SALES_EMAIL is required/);
    },
  );

  withEnv(
    {
      NODE_ENV: "development",
      DEPLOY_ENV: "dev",
      OKKEY_SALES_EMAIL: "",
      CRYPTO_ALLOWED_PROFILE_VERSIONS: "2",
      CRYPTO_ROLLOUT_MODE: "compat",
    },
    () => {
      assert.throws(() => loadConfig(), /OKKEY_SALES_EMAIL is required/);
    },
  );
});

test("applyApiTestSalesEmailDefault fills only unset or empty sales email", () => {
  const env: NodeJS.ProcessEnv = {
    OKKEY_SALES_EMAIL: "ops@example.com",
  };
  applyApiTestSalesEmailDefault(env);
  assert.equal(env.OKKEY_SALES_EMAIL, "ops@example.com");

  const empty: NodeJS.ProcessEnv = {
    OKKEY_SALES_EMAIL: "",
  };
  applyApiTestSalesEmailDefault(empty);
  assert.equal(empty.OKKEY_SALES_EMAIL, TEST_OKKEY_SALES_EMAIL);

  const unset: NodeJS.ProcessEnv = {};
  applyApiTestSalesEmailDefault(unset);
  assert.equal(unset.OKKEY_SALES_EMAIL, TEST_OKKEY_SALES_EMAIL);
});

test("loadConfig works after test sales-email default without an external env var", () => {
  withEnv(
    {
      NODE_ENV: "test",
      DEPLOY_ENV: "dev",
      OKKEY_SALES_EMAIL: undefined,
      CRYPTO_ALLOWED_PROFILE_VERSIONS: "2",
      CRYPTO_ROLLOUT_MODE: "compat",
    },
    () => {
      applyApiTestSalesEmailDefault();
      const cfg = loadConfig();
      assert.equal(cfg.salesEmail, TEST_OKKEY_SALES_EMAIL);
    },
  );
});
