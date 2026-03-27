import {
  CryptoSdkError,
  type CryptoSdkErrorCode,
} from "./errors.js";

export type HybridEnvelopeHeader = {
  version: number;
  kdfId: number;
  aeadId: number;
  reserved: number;
};

export type HybridEnvelopeView = {
  header: HybridEnvelopeHeader;
  eccEphemeralPublicKey: Uint8Array;
  pqCiphertext: Uint8Array;
  nonce: Uint8Array;
  ciphertext: Uint8Array;
};

export type HybridEnvelopeConfig = {
  version: number;
  kdfId: number;
  aeadId: number;
  eccPublicKeyLen: number;
  pqCiphertextLen: number;
  nonceLen: number;
  fixedHeaderLen: number;
};

function fail(code: CryptoSdkErrorCode, message: string): never {
  throw new CryptoSdkError(code, message);
}

export function decodeHybridEnvelopeV1(
  envelope: Uint8Array,
  cfg: HybridEnvelopeConfig,
): HybridEnvelopeView {
  if (envelope.length < cfg.fixedHeaderLen + 16) {
    fail("MALFORMED_ENVELOPE", "hybrid envelope too short");
  }

  const header = {
    version: envelope[0] ?? 0,
    kdfId: envelope[1] ?? 0,
    aeadId: envelope[2] ?? 0,
    reserved: envelope[3] ?? 0,
  };

  if (header.version !== cfg.version) {
    fail("MALFORMED_ENVELOPE", "unsupported hybrid envelope version");
  }
  if (header.kdfId !== cfg.kdfId) {
    fail("MALFORMED_ENVELOPE", "unsupported hybrid kdf id");
  }
  if (header.aeadId !== cfg.aeadId) {
    fail("MALFORMED_ENVELOPE", "unsupported hybrid aead id");
  }

  const eccStart = 4;
  const eccEnd = eccStart + cfg.eccPublicKeyLen;
  const pqEnd = eccEnd + cfg.pqCiphertextLen;
  const nonceEnd = pqEnd + cfg.nonceLen;
  const ciphertext = envelope.subarray(nonceEnd);
  if (ciphertext.length < 16) {
    fail("MALFORMED_ENVELOPE", "hybrid envelope ciphertext too short");
  }

  return {
    header,
    eccEphemeralPublicKey: envelope.subarray(eccStart, eccEnd),
    pqCiphertext: envelope.subarray(eccEnd, pqEnd),
    nonce: envelope.subarray(pqEnd, nonceEnd),
    ciphertext,
  };
}

export function encodeHybridEnvelopeV1(parts: {
  header: HybridEnvelopeHeader;
  eccEphemeralPublicKey: Uint8Array;
  pqCiphertext: Uint8Array;
  nonce: Uint8Array;
  ciphertext: Uint8Array;
}, cfg: HybridEnvelopeConfig): Uint8Array {
  if (
    parts.eccEphemeralPublicKey.length !== cfg.eccPublicKeyLen ||
    parts.pqCiphertext.length !== cfg.pqCiphertextLen ||
    parts.nonce.length !== cfg.nonceLen
  ) {
    fail("INVALID_INPUT", "invalid hybrid envelope part lengths");
  }

  const out = new Uint8Array(
    cfg.fixedHeaderLen + parts.ciphertext.length,
  );
  out[0] = parts.header.version;
  out[1] = parts.header.kdfId;
  out[2] = parts.header.aeadId;
  out[3] = parts.header.reserved;
  out.set(parts.eccEphemeralPublicKey, 4);
  out.set(parts.pqCiphertext, 4 + cfg.eccPublicKeyLen);
  out.set(parts.nonce, 4 + cfg.eccPublicKeyLen + cfg.pqCiphertextLen);
  out.set(parts.ciphertext, cfg.fixedHeaderLen);
  return out;
}
