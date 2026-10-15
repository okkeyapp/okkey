/** Canonical encrypted wire/storage envelope for all ciphertext artifacts. */
export interface EncryptedBlobDto {
  crypto_version: number;
  algorithm: string;
  payload: string;
  meta: Record<string, unknown>;
}

/** Canonical hybrid signature envelope for integrity-critical artifacts. */
export interface HybridSignatureEnvelopeDto {
  version: 1;
  algorithm: "hybrid_ed25519_pq_bind_v1";
  key_id: string;
  context:
    | "sync.append"
    | "vault.share"
    | "vault.revoke"
    | "vault.rotate"
    | "vault.member_role_update"
    | "vault.create"
    | "vault.access_update";
  signer_pq_public_key: string;
  payload_hash: string;
  signature: string;
  created_at: string;
}
