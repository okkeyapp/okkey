/**
 * Shared hybrid vault-key wrap policy (hop #1 share/rotate/create/grant).
 *
 * Mandatory in every DEPLOY_ENV (dev / stage / prod / self-host).
 * No compat mode and no operator flag may weaken this gate.
 *
 * Import path for Core + enterprise plugins (sibling relative):
 *   `okkey/services/api/src/crypto/vault-key-wrap-policy.ts`
 */

export const HYBRID_VAULT_KEY_WRAP_SCHEME = "hybrid_ecc_pq_v1" as const;

export const VAULT_SHARE_RECIPIENT_PQ_REQUIRED = "VAULT_SHARE_RECIPIENT_PQ_REQUIRED";
export const VAULT_KEY_WRAP_INVALID = "VAULT_KEY_WRAP_INVALID";
export const VAULT_KEY_WRAP_POLICY_STATUS_CODE = 400;

/** Minimal blob shape accepted by the policy (full EncryptedBlob is fine). */
export interface VaultKeyWrapPolicyBlob {
  crypto_version: number;
  meta?: Record<string, unknown> | null;
}

export interface VaultKeyWrapPolicyViolation {
  code: typeof VAULT_SHARE_RECIPIENT_PQ_REQUIRED | typeof VAULT_KEY_WRAP_INVALID;
  statusCode: typeof VAULT_KEY_WRAP_POLICY_STATUS_CODE;
  message: string;
  details?: Record<string, unknown>;
}

function normalizeWireUserId(raw: string): string {
  return String(raw).trim();
}

/**
 * Evaluate hybrid vault-key wrap policy without throwing.
 * Returns null when the wrap is acceptable.
 */
export function getHybridVaultKeyWrapPolicyViolation(input: {
  wrappedKeyBlob: VaultKeyWrapPolicyBlob;
  recipientUserId: string;
  recipientPublicPqKey: string | null | undefined;
}): VaultKeyWrapPolicyViolation | null {
  const { wrappedKeyBlob, recipientUserId } = input;
  const recipientPublicPqKey = input.recipientPublicPqKey ?? null;

  if (!recipientPublicPqKey) {
    return {
      code: VAULT_SHARE_RECIPIENT_PQ_REQUIRED,
      statusCode: VAULT_KEY_WRAP_POLICY_STATUS_CODE,
      message: "recipient must have ML-KEM public key",
    };
  }
  if (wrappedKeyBlob.crypto_version < 2) {
    return {
      code: VAULT_KEY_WRAP_INVALID,
      statusCode: VAULT_KEY_WRAP_POLICY_STATUS_CODE,
      message: "vault key wrap must use crypto_version >= 2",
    };
  }
  const wrapScheme = wrappedKeyBlob.meta?.["key_wrap_scheme"];
  if (wrapScheme !== HYBRID_VAULT_KEY_WRAP_SCHEME) {
    return {
      code: VAULT_KEY_WRAP_INVALID,
      statusCode: VAULT_KEY_WRAP_POLICY_STATUS_CODE,
      message: `vault key wrap must declare meta.key_wrap_scheme=${HYBRID_VAULT_KEY_WRAP_SCHEME}`,
      details: {
        recipientUserId,
        requiredKeyWrapScheme: HYBRID_VAULT_KEY_WRAP_SCHEME,
      },
    };
  }
  const metaRecipientRaw = wrappedKeyBlob.meta?.["recipient_user_id"];
  const metaRecipientUserId =
    typeof metaRecipientRaw === "string" ? normalizeWireUserId(metaRecipientRaw) : null;
  if (metaRecipientUserId !== normalizeWireUserId(recipientUserId)) {
    return {
      code: VAULT_KEY_WRAP_INVALID,
      statusCode: VAULT_KEY_WRAP_POLICY_STATUS_CODE,
      message: "vault key wrap recipient mismatch",
      details: {
        recipientUserId,
        metaRecipientUserId: metaRecipientRaw,
      },
    };
  }
  return null;
}

/**
 * Throw {@link VaultKeyWrapPolicyError} when the wrap violates hybrid policy.
 * Prefer this from Core `VaultSharingService` and enterprise shared-vault create/grant.
 */
export function assertHybridVaultKeyWrapPolicy(input: {
  wrappedKeyBlob: VaultKeyWrapPolicyBlob;
  recipientUserId: string;
  recipientPublicPqKey: string | null | undefined;
}): void {
  const violation = getHybridVaultKeyWrapPolicyViolation(input);
  if (violation) {
    throw new VaultKeyWrapPolicyError(violation);
  }
}

export class VaultKeyWrapPolicyError extends Error {
  readonly code: VaultKeyWrapPolicyViolation["code"];
  readonly statusCode: typeof VAULT_KEY_WRAP_POLICY_STATUS_CODE;
  readonly details?: Record<string, unknown>;

  constructor(violation: VaultKeyWrapPolicyViolation) {
    super(violation.message);
    this.name = "VaultKeyWrapPolicyError";
    this.code = violation.code;
    this.statusCode = violation.statusCode;
    this.details = violation.details;
  }
}
