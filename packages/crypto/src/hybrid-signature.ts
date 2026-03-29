import {
  b64_decode,
  b64_encode,
  hybrid_sign_v1,
  hybrid_verify_v1,
  sha256,
} from "@okkey/crypto-wasm";
import { mapWasmError } from "./errors.js";

export const HYBRID_SIGNATURE_ENVELOPE_VERSION_V1 = 1 as const;
export const HYBRID_SIGNATURE_ALGORITHM_V1 = "hybrid_ed25519_pq_bind_v1" as const;

export const HYBRID_SIGNATURE_REQUIRED_CONTEXTS = new Set<string>([
  "sync.append",
  "vault.share",
  "vault.revoke",
  "vault.rotate",
  "vault.member_role_update",
]);

export interface HybridSignatureEnvelopeV1 {
  version: 1;
  algorithm: typeof HYBRID_SIGNATURE_ALGORITHM_V1;
  key_id: string;
  context: string;
  signer_pq_public_key: string;
  payload_hash: string;
  signature: string;
  created_at: string;
}

const encoder = new TextEncoder();

function withWasmError<T>(op: string, fn: () => T): T {
  try {
    return fn();
  } catch (err) {
    throw mapWasmError(op, err);
  }
}

function toCanonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => toCanonicalValue(entry));
  }
  if (value && typeof value === "object") {
    const inObject = value as Record<string, unknown>;
    const outObject: Record<string, unknown> = {};
    for (const key of Object.keys(inObject).sort()) {
      outObject[key] = toCanonicalValue(inObject[key]);
    }
    return outObject;
  }
  return value;
}

export function buildHybridSignaturePayloadBytes(payload: unknown): Uint8Array {
  return encoder.encode(JSON.stringify(toCanonicalValue(payload)));
}

function digestPayloadBase64(payloadBytes: Uint8Array): string {
  return withWasmError("hybridSignaturePayloadHash", () => b64_encode(sha256(payloadBytes)));
}

function toBase64(bytes: Uint8Array): string {
  return withWasmError("hybridSignatureB64Encode", () => b64_encode(bytes));
}

function fromBase64(base64: string): Uint8Array {
  return withWasmError("hybridSignatureB64Decode", () => b64_decode(base64));
}

export function buildHybridSignatureEnvelopeV1(input: {
  keyId: string;
  context: string;
  payload: unknown;
  signerPrivateKey: Uint8Array;
  signerPqPublicKey: Uint8Array;
  createdAt?: string;
}): HybridSignatureEnvelopeV1 {
  if (!HYBRID_SIGNATURE_REQUIRED_CONTEXTS.has(input.context)) {
    throw new Error(`unsupported signature context: ${input.context}`);
  }
  const payloadBytes = buildHybridSignaturePayloadBytes(input.payload);
  const contextBytes = encoder.encode(input.context);
  const signatureBytes = withWasmError("hybridSignV1", () =>
    hybrid_sign_v1(input.signerPrivateKey, input.signerPqPublicKey, contextBytes, payloadBytes));
  return {
    version: HYBRID_SIGNATURE_ENVELOPE_VERSION_V1,
    algorithm: HYBRID_SIGNATURE_ALGORITHM_V1,
    key_id: input.keyId,
    context: input.context,
    signer_pq_public_key: toBase64(input.signerPqPublicKey),
    payload_hash: digestPayloadBase64(payloadBytes),
    signature: toBase64(signatureBytes),
    created_at: input.createdAt ?? new Date().toISOString(),
  };
}

export function verifyHybridSignatureEnvelopeV1(input: {
  envelope: HybridSignatureEnvelopeV1;
  payload: unknown;
  signerPublicKey: Uint8Array;
}): boolean {
  const { envelope } = input;
  if (
    envelope.version !== HYBRID_SIGNATURE_ENVELOPE_VERSION_V1 ||
    envelope.algorithm !== HYBRID_SIGNATURE_ALGORITHM_V1 ||
    !HYBRID_SIGNATURE_REQUIRED_CONTEXTS.has(envelope.context)
  ) {
    return false;
  }
  const payloadBytes = buildHybridSignaturePayloadBytes(input.payload);
  if (digestPayloadBase64(payloadBytes) !== envelope.payload_hash) {
    return false;
  }
  const contextBytes = encoder.encode(envelope.context);
  return withWasmError("hybridVerifyV1", () =>
    hybrid_verify_v1(
      input.signerPublicKey,
      fromBase64(envelope.signer_pq_public_key),
      contextBytes,
      payloadBytes,
      fromBase64(envelope.signature),
    ));
}
