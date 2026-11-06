/** Canonical encrypted wire/storage envelope for all ciphertext artifacts. */
export interface EncryptedBlobDto {
  crypto_version: number;
  algorithm: string;
  payload: string;
  meta: Record<string, unknown>;
}

type HybridSignatureContext =
  | "sync.append"
  | "vault.share"
  | "vault.revoke"
  | "vault.rotate"
  | "vault.member_role_update"
  | "vault.create"
  | "vault.access_update";

/** Historical hybrid envelope: one Ed25519 signature binding the ML-KEM public key. */
export interface HybridSignatureEnvelopeV1Dto {
  version: 1;
  algorithm: "hybrid_ed25519_pq_bind_v1";
  key_id: string;
  context: HybridSignatureContext;
  signer_pq_public_key: string;
  payload_hash: string;
  signature: string;
  created_at: string;
}

/** Current hybrid envelope: Ed25519 and ML-DSA-65 signatures, both required. */
export interface HybridSignatureEnvelopeV2Dto {
  version: 2;
  algorithm: "hybrid_ed25519_ml_dsa_65_v2";
  key_id: string;
  context: HybridSignatureContext;
  signer_pq_public_key: string;
  signer_mldsa_public_key: string;
  payload_hash: string;
  /** Ed25519 signature over the v2 statement. */
  signature: string;
  /** ML-DSA-65 signature over the same statement. */
  mldsa_signature: string;
  created_at: string;
}

/** Canonical hybrid signature envelope for integrity-critical artifacts. */
export type HybridSignatureEnvelopeDto =
  | HybridSignatureEnvelopeV1Dto
  | HybridSignatureEnvelopeV2Dto;
