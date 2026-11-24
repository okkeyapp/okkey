import assert from "node:assert/strict";
import test from "node:test";
import { loadConfig } from "../src/config.ts";
import {
  applyApiTestRateLimitDefaults,
  TEST_AUTH_RATE_LIMIT_REGISTER_COMPLETE_PER_EMAIL,
  TEST_AUTH_RATE_LIMIT_REGISTER_COMPLETE_PER_IP,
} from "./test-rate-limit-defaults.ts";

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

test("loadConfig keeps production register-complete rate-limit defaults", () => {
  withEnv(
    {
      AUTH_RATE_LIMIT_REGISTER_COMPLETE_PER_IP: undefined,
      AUTH_RATE_LIMIT_REGISTER_COMPLETE_PER_EMAIL: undefined,
      OKKEY_SALES_EMAIL: "sales@okkey.test",
    },
    () => {
      const cfg = loadConfig();
      assert.equal(cfg.authRateLimitRegisterCompletePerIp, 10);
      assert.equal(cfg.authRateLimitRegisterCompletePerEmail, 5);
    },
  );
});

test("applyApiTestRateLimitDefaults fills only unset register-complete budgets", () => {
  const env: NodeJS.ProcessEnv = {
    AUTH_RATE_LIMIT_REGISTER_COMPLETE_PER_IP: "3",
  };
  applyApiTestRateLimitDefaults(env);
  assert.equal(env.AUTH_RATE_LIMIT_REGISTER_COMPLETE_PER_IP, "3");
  assert.equal(
    env.AUTH_RATE_LIMIT_REGISTER_COMPLETE_PER_EMAIL,
    String(TEST_AUTH_RATE_LIMIT_REGISTER_COMPLETE_PER_EMAIL),
  );
  assert.equal(TEST_AUTH_RATE_LIMIT_REGISTER_COMPLETE_PER_IP, 100_000);
  assert.equal(TEST_AUTH_RATE_LIMIT_REGISTER_COMPLETE_PER_EMAIL, 100_000);
});

test("applyApiTestRateLimitDefaults replaces an empty register-complete budget", () => {
  const env: NodeJS.ProcessEnv = {
    AUTH_RATE_LIMIT_REGISTER_COMPLETE_PER_IP: "",
    AUTH_RATE_LIMIT_REGISTER_COMPLETE_PER_EMAIL: "",
  };
  applyApiTestRateLimitDefaults(env);
  assert.equal(
    env.AUTH_RATE_LIMIT_REGISTER_COMPLETE_PER_IP,
    String(TEST_AUTH_RATE_LIMIT_REGISTER_COMPLETE_PER_IP),
  );
  assert.equal(
    env.AUTH_RATE_LIMIT_REGISTER_COMPLETE_PER_EMAIL,
    String(TEST_AUTH_RATE_LIMIT_REGISTER_COMPLETE_PER_EMAIL),
  );
});
