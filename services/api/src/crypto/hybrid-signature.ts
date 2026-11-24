import {
  HYBRID_SIGNATURE_ALGORITHM_V1,
  HYBRID_SIGNATURE_ALGORITHM_V2,
  HYBRID_SIGNATURE_ENVELOPE_VERSION_V1,
  HYBRID_SIGNATURE_ENVELOPE_VERSION_V2,
  verifyHybridSignatureEnvelopeV1,
  verifyHybridSignatureEnvelopeV2,
  type HybridSignatureEnvelope,
  type HybridSignatureEnvelopeV1,
  type HybridSignatureEnvelopeV2,
} from "@okkey/crypto";
import {
  CLIENT_UPGRADE_REQUIRED,
  CLIENT_UPGRADE_REQUIRED_MESSAGE,
  CLIENT_UPGRADE_REQUIRED_STATUS,
} from "./client-upgrade.ts";
import { ensureApiCryptoWasm } from "./wasm-runtime.ts";

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

function readString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function parseHybridSignatureEnvelope(
  value: unknown,
  expectedContext: SignatureContext,
): HybridSignatureEnvelope {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("signature must be an object");
  }
  const raw = value as Record<string, unknown>;
  const version = Number(raw.version);
  if (version === HYBRID_SIGNATURE_ENVELOPE_VERSION_V1) {
    return parseV1(raw, expectedContext);
  }
  if (version === HYBRID_SIGNATURE_ENVELOPE_VERSION_V2) {
    return parseV2(raw, expectedContext);
  }
  throw new Error("unsupported signature.version");
}

function parseV1(raw: Record<string, unknown>, expectedContext: SignatureContext): HybridSignatureEnvelopeV1 {
  const envelope: HybridSignatureEnvelopeV1 = {
    version: HYBRID_SIGNATURE_ENVELOPE_VERSION_V1,
    algorithm: readString(raw.algorithm) as HybridSignatureEnvelopeV1["algorithm"],
    key_id: readString(raw.key_id),
    context: readString(raw.context),
    signer_pq_public_key: readString(raw.signer_pq_public_key),
    payload_hash: readString(raw.payload_hash),
    signature: readString(raw.signature),
    created_at: readString(raw.created_at),
  };
  assertCommon(envelope, expectedContext, HYBRID_SIGNATURE_ALGORITHM_V1);
  return envelope;
}

function parseV2(raw: Record<string, unknown>, expectedContext: SignatureContext): HybridSignatureEnvelopeV2 {
  const envelope: HybridSignatureEnvelopeV2 = {
    version: HYBRID_SIGNATURE_ENVELOPE_VERSION_V2,
    algorithm: readString(raw.algorithm) as HybridSignatureEnvelopeV2["algorithm"],
    key_id: readString(raw.key_id),
    context: readString(raw.context),
    signer_pq_public_key: readString(raw.signer_pq_public_key),
    signer_mldsa_public_key: readString(raw.signer_mldsa_public_key),
    payload_hash: readString(raw.payload_hash),
    signature: readString(raw.signature),
    mldsa_signature: readString(raw.mldsa_signature),
    created_at: readString(raw.created_at),
  };
  assertCommon(envelope, expectedContext, HYBRID_SIGNATURE_ALGORITHM_V2);
  if (!envelope.signer_mldsa_public_key || !envelope.mldsa_signature) {
    throw new Error("signature envelope is incomplete");
  }
  return envelope;
}

function assertCommon(
  envelope: { version: number; algorithm: string; context: string; key_id: string; signature: string; payload_hash: string; signer_pq_public_key: string; created_at: string },
  expectedContext: SignatureContext,
  algorithm: string,
): void {
  if (envelope.algorithm !== algorithm) {
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
}

/** Verifies a v1 or v2 envelope. v1 remains valid for previously stored signatures. */
export function verifyHybridSignatureForPayload(input: {
  envelope: HybridSignatureEnvelope;
  payload: unknown;
  signerPublicKeyBase64: string;
}): boolean {
  try {
    ensureApiCryptoWasm();
    const signerPublicKey = Uint8Array.from(Buffer.from(input.signerPublicKeyBase64, "base64"));
    if (input.envelope.version === HYBRID_SIGNATURE_ENVELOPE_VERSION_V1) {
      return verifyHybridSignatureEnvelopeV1({
        envelope: input.envelope,
        payload: input.payload,
        signerPublicKey,
      });
    }
    return verifyHybridSignatureEnvelopeV2({
      envelope: input.envelope,
      payload: input.payload,
      signerPublicKey,
      signerMlDsaPublicKey: Uint8Array.from(Buffer.from(input.envelope.signer_mldsa_public_key, "base64")),
    });
  } catch {
    return false;
  }
}

export type HybridSignatureWriteCheck =
  | { ok: true; envelope: HybridSignatureEnvelopeV2 }
  | {
      ok: false;
      code: typeof SIGNATURE_INVALID | typeof CLIENT_UPGRADE_REQUIRED;
      statusCode: number;
      message: string;
    };

/**
 * New writes accept only the v2 envelope. v1 stays verifiable through
 * {@link verifyHybridSignatureForPayload} for stored history.
 */
export function checkHybridSignatureForNewWrite(input: {
  signature: unknown;
  expectedContext: SignatureContext;
  payload: unknown;
  signerPublicKeyBase64: string;
  signerPqPublicKeyBase64: string | null;
  signerMldsaPublicKeyBase64: string | null;
}): HybridSignatureWriteCheck {
  let envelope: HybridSignatureEnvelope;
  try {
    envelope = parseHybridSignatureEnvelope(input.signature, input.expectedContext);
  } catch (error) {
    return {
      ok: false,
      code: SIGNATURE_INVALID,
      statusCode: SIGNATURE_STATUS_CODE,
      message: (error as Error).message,
    };
  }
  if (envelope.version === HYBRID_SIGNATURE_ENVELOPE_VERSION_V1) {
    return {
      ok: false,
      code: CLIENT_UPGRADE_REQUIRED,
      statusCode: CLIENT_UPGRADE_REQUIRED_STATUS,
      message: CLIENT_UPGRADE_REQUIRED_MESSAGE,
    };
  }
  if (!input.signerPqPublicKeyBase64 || envelope.signer_pq_public_key !== input.signerPqPublicKeyBase64) {
    return {
      ok: false,
      code: SIGNATURE_INVALID,
      statusCode: SIGNATURE_STATUS_CODE,
      message: "signature signer_pq_public_key mismatch",
    };
  }
  if (!input.signerMldsaPublicKeyBase64 || envelope.signer_mldsa_public_key !== input.signerMldsaPublicKeyBase64) {
    return {
      ok: false,
      code: SIGNATURE_INVALID,
      statusCode: SIGNATURE_STATUS_CODE,
      message: "signature signer_mldsa_public_key mismatch",
    };
  }
  const verified = verifyHybridSignatureForPayload({
    envelope,
    payload: input.payload,
    signerPublicKeyBase64: input.signerPublicKeyBase64,
  });
  if (!verified) {
    return {
      ok: false,
      code: SIGNATURE_INVALID,
      statusCode: SIGNATURE_STATUS_CODE,
      message: "signature verification failed",
    };
  }
  return { ok: true, envelope };
}
