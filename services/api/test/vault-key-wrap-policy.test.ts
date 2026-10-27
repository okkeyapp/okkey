import test from "node:test";
import assert from "node:assert/strict";
import {
  assertHybridVaultKeyWrapPolicy,
  getHybridVaultKeyWrapPolicyViolation,
  HYBRID_VAULT_KEY_WRAP_SCHEME,
  VAULT_KEY_WRAP_INVALID,
  VAULT_SHARE_RECIPIENT_PQ_REQUIRED,
  VaultKeyWrapPolicyError,
} from "../src/crypto/vault-key-wrap-policy.ts";

const recipientId = "12345678901234567890";

function hybridBlob(overrides: Record<string, unknown> = {}) {
  return {
    crypto_version: 2,
    meta: {
      key_wrap_scheme: HYBRID_VAULT_KEY_WRAP_SCHEME,
      recipient_user_id: recipientId,
      ...overrides,
    },
  };
}

test("vault-key-wrap-policy: accepts hybrid wrap with PQ recipient", () => {
  assert.equal(
    getHybridVaultKeyWrapPolicyViolation({
      wrappedKeyBlob: hybridBlob(),
      recipientUserId: recipientId,
      recipientPublicPqKey: "pq-key",
    }),
    null,
  );
  assert.doesNotThrow(() =>
    assertHybridVaultKeyWrapPolicy({
      wrappedKeyBlob: hybridBlob(),
      recipientUserId: recipientId,
      recipientPublicPqKey: "pq-key",
    }),
  );
});

test("vault-key-wrap-policy: rejects missing recipient PQ key", () => {
  const violation = getHybridVaultKeyWrapPolicyViolation({
    wrappedKeyBlob: hybridBlob(),
    recipientUserId: recipientId,
    recipientPublicPqKey: null,
  });
  assert.ok(violation);
  assert.equal(violation.code, VAULT_SHARE_RECIPIENT_PQ_REQUIRED);
  assert.throws(
    () =>
      assertHybridVaultKeyWrapPolicy({
        wrappedKeyBlob: hybridBlob(),
        recipientUserId: recipientId,
        recipientPublicPqKey: null,
      }),
    (error: unknown) =>
      error instanceof VaultKeyWrapPolicyError &&
      error.code === VAULT_SHARE_RECIPIENT_PQ_REQUIRED,
  );
});

test("vault-key-wrap-policy: rejects classical / non-hybrid scheme", () => {
  const classical = {
    crypto_version: 2,
    meta: {
      key_wrap_scheme: "x25519_ecdh_xchacha_v1",
      recipient_user_id: recipientId,
    },
  };
  const violation = getHybridVaultKeyWrapPolicyViolation({
    wrappedKeyBlob: classical,
    recipientUserId: recipientId,
    recipientPublicPqKey: "pq-key",
  });
  assert.ok(violation);
  assert.equal(violation.code, VAULT_KEY_WRAP_INVALID);
  assert.match(violation.message, /hybrid_ecc_pq_v1/);
});

test("vault-key-wrap-policy: rejects missing scheme (no silent server fill)", () => {
  const noScheme = {
    crypto_version: 2,
    meta: {
      recipient_user_id: recipientId,
    },
  };
  const violation = getHybridVaultKeyWrapPolicyViolation({
    wrappedKeyBlob: noScheme,
    recipientUserId: recipientId,
    recipientPublicPqKey: "pq-key",
  });
  assert.ok(violation);
  assert.equal(violation.code, VAULT_KEY_WRAP_INVALID);
});

test("vault-key-wrap-policy: rejects crypto_version < 2", () => {
  const legacy = hybridBlob();
  legacy.crypto_version = 1;
  const violation = getHybridVaultKeyWrapPolicyViolation({
    wrappedKeyBlob: legacy,
    recipientUserId: recipientId,
    recipientPublicPqKey: "pq-key",
  });
  assert.ok(violation);
  assert.equal(violation.code, VAULT_KEY_WRAP_INVALID);
  assert.match(violation.message, /crypto_version/);
});

test("vault-key-wrap-policy: rejects recipient_user_id mismatch", () => {
  const spoofed = hybridBlob({ recipient_user_id: "99999999999999999999" });
  const violation = getHybridVaultKeyWrapPolicyViolation({
    wrappedKeyBlob: spoofed,
    recipientUserId: recipientId,
    recipientPublicPqKey: "pq-key",
  });
  assert.ok(violation);
  assert.equal(violation.code, VAULT_KEY_WRAP_INVALID);
  assert.match(violation.message, /recipient mismatch/);
});
