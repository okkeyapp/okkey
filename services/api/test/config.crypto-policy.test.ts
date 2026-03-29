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
      assert.equal(cfg.cryptoRolloutMode, "strict");
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
      assert.equal(cfg.cryptoRolloutMode, "compat");
    },
  );
});

test("loadConfig parses explicit crypto profile list within env policy", () => {
  withEnv(
    {
      DEPLOY_ENV: "stage",
      CRYPTO_ALLOWED_PROFILE_VERSIONS: "2,2,bad",
    },
    () => {
      const cfg = loadConfig();
      assert.deepEqual(cfg.allowedCryptoProfileVersions, [2]);
      assert.equal(cfg.deployEnv, "stage");
    },
  );
});

test("loadConfig rejects crypto profile overrides blocked by matrix", () => {
  withEnv(
    {
      DEPLOY_ENV: "prod",
      CRYPTO_ALLOWED_PROFILE_VERSIONS: "1,2",
    },
    () => {
      assert.throws(
        () => loadConfig(),
        /CRYPTO_ALLOWED_PROFILE_VERSIONS includes versions blocked by prod policy: 1/,
      );
    },
  );
});

test("loadConfig rejects stage overrides that enable forbidden profiles", () => {
  withEnv(
    {
      DEPLOY_ENV: "stage",
      CRYPTO_ALLOWED_PROFILE_VERSIONS: "1,2",
    },
    () => {
      assert.throws(
        () => loadConfig(),
        /CRYPTO_ALLOWED_PROFILE_VERSIONS includes versions blocked by stage policy: 1/,
      );
    },
  );
});

test("loadConfig parses explicit crypto rollout mode", () => {
  withEnv(
    {
      DEPLOY_ENV: "stage",
      CRYPTO_ROLLOUT_MODE: "strict",
    },
    () => {
      const cfg = loadConfig();
      assert.equal(cfg.deployEnv, "stage");
      assert.equal(cfg.cryptoRolloutMode, "strict");
    },
  );
});

test("loadConfig parses rollout stop/resume gates", () => {
  withEnv(
    {
      CRYPTO_ROLLOUT_ENABLED: "false",
      CRYPTO_ROLLOUT_STATE: "stop",
      CRYPTO_ROLLOUT_STOP_WRITE_PATHS: "sync.append, vault.rotate ,*",
    },
    () => {
      const cfg = loadConfig();
      assert.equal(cfg.cryptoRolloutEnabled, false);
      assert.equal(cfg.cryptoRolloutState, "stop");
      assert.deepEqual(cfg.cryptoRolloutStopWritePaths, ["sync.append", "vault.rotate", "*"]);
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
