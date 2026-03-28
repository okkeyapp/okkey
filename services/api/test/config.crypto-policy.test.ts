import assert from "node:assert/strict";
import test from "node:test";
import { loadConfig } from "../src/config.ts";
import { getCryptoWritePolicyViolation } from "../src/crypto/policy.ts";

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

test("loadConfig defaults crypto policy by deploy environment", () => {
  withEnv(
    {
      DEPLOY_ENV: "prod",
      CRYPTO_ALLOWED_PROFILE_VERSIONS: undefined,
    },
    () => {
      const cfg = loadConfig();
      assert.deepEqual(cfg.allowedCryptoProfileVersions, [2]);
      assert.equal(cfg.deployEnv, "prod");
    },
  );

  withEnv(
    {
      DEPLOY_ENV: "dev",
      CRYPTO_ALLOWED_PROFILE_VERSIONS: undefined,
    },
    () => {
      const cfg = loadConfig();
      assert.deepEqual(cfg.allowedCryptoProfileVersions, [1, 2]);
      assert.equal(cfg.deployEnv, "dev");
    },
  );
});

test("loadConfig parses explicit crypto profile list", () => {
  withEnv(
    {
      DEPLOY_ENV: "stage",
      CRYPTO_ALLOWED_PROFILE_VERSIONS: "2, 3, 2, bad",
    },
    () => {
      const cfg = loadConfig();
      assert.deepEqual(cfg.allowedCryptoProfileVersions, [2, 3]);
      assert.equal(cfg.deployEnv, "stage");
    },
  );
});

test("getCryptoWritePolicyViolation returns normalized violation payload", () => {
  const violation = getCryptoWritePolicyViolation(
    { allowedCryptoProfileVersions: [2] },
    1,
  );
  assert.ok(violation);
  assert.equal(violation.code, "CRYPTO_PROFILE_NOT_ALLOWED");
  assert.equal(violation.statusCode, 400);
  assert.equal(violation.message, "crypto profile v1 is not allowed by policy");
  assert.deepEqual(violation.details, {
    reason: "policy",
    requestedVersion: 1,
    allowedVersions: [2],
  });
});

test("getCryptoWritePolicyViolation returns null for allowed profile", () => {
  const violation = getCryptoWritePolicyViolation(
    { allowedCryptoProfileVersions: [1, 2] },
    2,
  );
  assert.equal(violation, null);
});
