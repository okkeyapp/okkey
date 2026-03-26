export interface EncryptedBlob {
  crypto_version: number;
  algorithm: string;
  payload: string;
  meta: Record<string, unknown>;
}

const DEFAULT_ALLOWED_ALGORITHMS = new Set(["opaque", "hybrid-v2", "hybrid-ecc-pq-v2"]);

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseBase64Payload(payload: string, fieldName: string): Uint8Array {
  try {
    const bytes = Uint8Array.from(Buffer.from(payload, "base64"));
    if (bytes.length === 0 || Buffer.from(bytes).toString("base64") !== payload) {
      throw new Error("invalid");
    }
    return bytes;
  } catch {
    throw new Error(`${fieldName}.payload must be valid base64`);
  }
}

export function parseEncryptedBlobInput(
  value: unknown,
  options: {
    fieldName: string;
    maxPayloadBytes: number;
    allowedAlgorithms?: ReadonlySet<string>;
    fallbackCryptoVersion?: number;
  },
): { blob: EncryptedBlob; payloadBytes: Uint8Array } {
  const allowedAlgorithms = options.allowedAlgorithms ?? DEFAULT_ALLOWED_ALGORITHMS;
  if (typeof value === "string" && value.length > 0) {
    const payloadBytes = parseBase64Payload(value, options.fieldName);
    if (payloadBytes.length > options.maxPayloadBytes) {
      throw new Error(`${options.fieldName}.payload exceeds ${options.maxPayloadBytes} bytes`);
    }
    return {
      blob: {
        crypto_version: options.fallbackCryptoVersion ?? 2,
        algorithm: "opaque",
        payload: value,
        meta: {},
      },
      payloadBytes,
    };
  }
  if (!isObject(value)) {
    throw new Error(`${options.fieldName} must be an object`);
  }

  const cryptoVersion = value.crypto_version;
  const algorithm = value.algorithm;
  const payload = value.payload;
  const meta = value.meta;

  if (!Number.isInteger(cryptoVersion) || cryptoVersion < 1 || cryptoVersion > 65535) {
    throw new Error(`${options.fieldName}.crypto_version must be an integer from 1 to 65535`);
  }
  if (typeof algorithm !== "string" || algorithm.length === 0) {
    throw new Error(`${options.fieldName}.algorithm must be a non-empty string`);
  }
  if (!allowedAlgorithms.has(algorithm)) {
    throw new Error(`${options.fieldName}.algorithm is not allowed`);
  }
  if (typeof payload !== "string" || payload.length === 0) {
    throw new Error(`${options.fieldName}.payload must be a non-empty base64 string`);
  }
  if (!isObject(meta)) {
    throw new Error(`${options.fieldName}.meta must be an object`);
  }

  const payloadBytes = parseBase64Payload(payload, options.fieldName);
  if (payloadBytes.length > options.maxPayloadBytes) {
    throw new Error(`${options.fieldName}.payload exceeds ${options.maxPayloadBytes} bytes`);
  }

  return {
    blob: {
      crypto_version: cryptoVersion,
      algorithm,
      payload,
      meta,
    },
    payloadBytes,
  };
}

export function serializeEncryptedBlobToStorage(blob: EncryptedBlob): Uint8Array {
  return Uint8Array.from(Buffer.from(JSON.stringify(blob), "utf8"));
}

export function decodeEncryptedBlobFromStorage(
  bytes: Uint8Array,
  fallbackCryptoVersion = 2,
): EncryptedBlob {
  try {
    const parsed = JSON.parse(Buffer.from(bytes).toString("utf8")) as unknown;
    if (isObject(parsed)) {
      const cryptoVersion = parsed.crypto_version;
      const algorithm = parsed.algorithm;
      const payload = parsed.payload;
      const meta = parsed.meta;
      if (
        Number.isInteger(cryptoVersion) &&
        cryptoVersion > 0 &&
        typeof algorithm === "string" &&
        algorithm.length > 0 &&
        typeof payload === "string" &&
        payload.length > 0 &&
        isObject(meta)
      ) {
        return {
          crypto_version: cryptoVersion,
          algorithm,
          payload,
          meta,
        };
      }
    }
  } catch {
    // fallback below
  }

  return {
    crypto_version: fallbackCryptoVersion,
    algorithm: "opaque",
    payload: Buffer.from(bytes).toString("base64"),
    meta: {},
  };
}
