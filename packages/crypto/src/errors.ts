export type CryptoSdkErrorCode =
  | "WASM_NOT_INITIALIZED"
  | "INVALID_INPUT"
  | "INVALID_KEY_LENGTH"
  | "UNSUPPORTED_ALGORITHM"
  | "MALFORMED_ENVELOPE"
  | "DECRYPT_FAILED"
  | "INTERNAL";

export class CryptoSdkError extends Error {
  readonly code: CryptoSdkErrorCode;
  readonly cause?: unknown;

  constructor(code: CryptoSdkErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = "CryptoSdkError";
    this.code = code;
    this.cause = cause;
  }
}

export function mapWasmError(op: string, err: unknown): CryptoSdkError {
  const message =
    err instanceof Error
      ? err.message
      : typeof err === "string"
        ? err
        : "unknown wasm error";
  const lower = message.toLowerCase();

  if (lower.includes("too short") || lower.includes("malformed") || lower.includes("version")) {
    return new CryptoSdkError("MALFORMED_ENVELOPE", `${op}: ${message}`, err);
  }
  if (lower.includes("unsupported")) {
    return new CryptoSdkError("UNSUPPORTED_ALGORITHM", `${op}: ${message}`, err);
  }
  if (lower.includes("invalid") || lower.includes("length")) {
    return new CryptoSdkError("INVALID_KEY_LENGTH", `${op}: ${message}`, err);
  }
  if (lower.includes("decrypt") || lower.includes("aead")) {
    return new CryptoSdkError("DECRYPT_FAILED", `${op}: ${message}`, err);
  }

  return new CryptoSdkError("INTERNAL", `${op}: ${message}`, err);
}
