import {
  HYBRID_SIGNATURE_ALGORITHM_V1,
  HYBRID_SIGNATURE_ENVELOPE_VERSION_V1,
  verifyHybridSignatureEnvelopeV1,
  type HybridSignatureEnvelopeV1,
} from "@okkey/crypto";

export const SIGNATURE_REQUIRED = "SIGNATURE_REQUIRED";
export const SIGNATURE_INVALID = "SIGNATURE_INVALID";
export const SIGNATURE_STATUS_CODE = 400;

const REQUIRED_CONTEXTS = new Set([
  "sync.append",
  "vault.share",
  "vault.revoke",
  "vault.rotate",
  "vault.member_role_update",
  "vault.create",
  "vault.access_update",
] as const);

export type SignatureContext =
  | "sync.append"
  | "vault.share"
  | "vault.revoke"
  | "vault.rotate"
  | "vault.member_role_update"
  | "vault.create"
  | "vault.access_update";

export function parseHybridSignatureEnvelope(
  value: unknown,
  expectedContext: SignatureContext,
): HybridSignatureEnvelopeV1 {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("signature must be an object");
  }
  const raw = value as Record<string, unknown>;
  const envelope: HybridSignatureEnvelopeV1 = {
    version: Number(raw.version) as 1,
    algorithm: String(raw.algorithm) as HybridSignatureEnvelopeV1["algorithm"],
    key_id: String(raw.key_id ?? ""),
    context: String(raw.context ?? ""),
    signer_pq_public_key: String(raw.signer_pq_public_key ?? ""),
    payload_hash: String(raw.payload_hash ?? ""),
    signature: String(raw.signature ?? ""),
    created_at: String(raw.created_at ?? ""),
  };
  if (envelope.version !== HYBRID_SIGNATURE_ENVELOPE_VERSION_V1) {
    throw new Error("unsupported signature.version");
  }
  if (envelope.algorithm !== HYBRID_SIGNATURE_ALGORITHM_V1) {
    throw new Error("unsupported signature.algorithm");
  }
  if (!REQUIRED_CONTEXTS.has(envelope.context as SignatureContext)) {
    throw new Error("unsupported signature.context");
  }
  if (envelope.context !== expectedContext) {
    throw new Error("signature.context mismatch");
  }
  if (!envelope.key_id || !envelope.signature || !envelope.payload_hash || !envelope.signer_pq_public_key) {
    throw new Error("signature envelope is incomplete");
  }
  if (Number.isNaN(Date.parse(envelope.created_at))) {
    throw new Error("signature.created_at must be ISO date-time");
  }
  return envelope;
}

export function verifyHybridSignatureForPayload(input: {
  envelope: HybridSignatureEnvelopeV1;
  payload: unknown;
  signerPublicKeyBase64: string;
}): boolean {
  try {
    return verifyHybridSignatureEnvelopeV1({
      envelope: input.envelope,
      payload: input.payload,
      signerPublicKey: Uint8Array.from(Buffer.from(input.signerPublicKeyBase64, "base64")),
    });
  } catch {
    return false;
  }
}
