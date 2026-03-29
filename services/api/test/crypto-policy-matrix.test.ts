import assert from "node:assert/strict";
import test from "node:test";
import { listCryptoConfigs } from "@okkey/crypto";
import {
  CRYPTO_POLICY_MATRIX,
  assertCryptoPolicyMatrix,
  getAllowedCryptoProfileVersionsByEnv,
  getCryptoPolicyForDeployEnv,
  validateCryptoPolicyMatrix,
} from "../src/crypto/policy-matrix.ts";

test("crypto policy matrix schema validates", () => {
  const errors = validateCryptoPolicyMatrix(CRYPTO_POLICY_MATRIX);
  assert.deepEqual(errors, []);
  assert.doesNotThrow(() => assertCryptoPolicyMatrix(CRYPTO_POLICY_MATRIX));
});

test("crypto policy matrix schema reports invalid deprecation window", () => {
  const invalidMatrix = {
    ...CRYPTO_POLICY_MATRIX,
    environments: {
      ...CRYPTO_POLICY_MATRIX.environments,
      dev: {
        ...CRYPTO_POLICY_MATRIX.environments.dev,
        profiles: CRYPTO_POLICY_MATRIX.environments.dev.profiles.map((row) => {
          if (row.version !== 1) {
            return row;
          }
          return {
            ...row,
            deprecation: {
              announcedOn: "2026-03-29",
              startsOn: "2026-10-01",
              graceEndsOn: "2026-09-30",
              removalTarget: "not-a-date",
            },
          };
        }),
      },
    },
  };

  const errors = validateCryptoPolicyMatrix(invalidMatrix);
  assert.ok(errors.length > 0);
  assert.ok(
    errors.some((entry) => entry.includes("startsOn must be <= graceEndsOn")),
    "expected startsOn/grace validation error",
  );
  assert.ok(
    errors.some((entry) => entry.includes("removalTarget must be YYYY-MM-DD")),
    "expected date format validation error",
  );
});

test("crypto policy matrix exposes expected allowed profiles by env", () => {
  assert.deepEqual(getAllowedCryptoProfileVersionsByEnv("dev"), [1, 2]);
  assert.deepEqual(getAllowedCryptoProfileVersionsByEnv("stage"), [2]);
  assert.deepEqual(getAllowedCryptoProfileVersionsByEnv("prod"), [2]);
});

test("matrix profile rows match crypto config registry", () => {
  const registry = new Map(listCryptoConfigs().map((config) => [config.version, config]));

  for (const env of ["dev", "stage", "prod"] as const) {
    const policy = getCryptoPolicyForDeployEnv(env);
    for (const row of policy.profiles) {
      const registeredConfig = registry.get(row.version);
      assert.ok(registeredConfig, `v${row.version} must exist in getCryptoConfig registry`);
      assert.equal(
        registeredConfig.id,
        row.configId,
        `v${row.version} configId mismatch in ${env} matrix`,
      );
      if (row.allowedForWrite) {
        assert.ok(
          registeredConfig.allowedEnvironments.includes(env),
          `v${row.version} is allowed in ${env} matrix but not by crypto config`,
        );
      }
    }
  }
});
