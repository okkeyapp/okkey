import {
  MLDSA65_PUBLIC_KEY_LEN,
  buildMlDsaIdentityUploadMessage,
  ed25519Verify,
} from "@okkey/crypto";
import {
  mergeEncryptedBlobMeta,
  parseEncryptedBlobInput,
  serializeEncryptedBlobToStorage,
  type EncryptedBlob,
} from "../crypto/encrypted-blob.ts";
import { ensureApiCryptoWasm } from "../crypto/wasm-runtime.ts";
import type { UsersRepository } from "../storage/repositories.ts";

const MIN_ENCRYPTED_USER_IDENTITY_PAYLOAD_LEN = 2473;

export class MldsaIdentityKeyError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, statusCode: number, message: string) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
  }
}

export class MldsaIdentityKeyService {
  private readonly users: Pick<UsersRepository, "findById" | "setMlDsaIdentityKey">;

  constructor(users: Pick<UsersRepository, "findById" | "setMlDsaIdentityKey">) {
    this.users = users;
  }

  async upload(input: {
    userId: string;
    publicKeyBase64: string;
    encryptedPrivateKey: unknown;
    signatureBase64: string;
  }): Promise<{ public_mldsa_key: string; status: "stored" }> {
    const publicKey = decodeBase64(input.publicKeyBase64);
    if (!publicKey || publicKey.length !== MLDSA65_PUBLIC_KEY_LEN) {
      throw new MldsaIdentityKeyError(
        "MLDSA_KEY_INVALID",
        400,
        "public_key must decode to 1952 bytes (ML-DSA-65)",
      );
    }
    const signature = decodeBase64(input.signatureBase64);
    if (!signature || signature.length !== 64) {
      throw new MldsaIdentityKeyError("MLDSA_KEY_INVALID", 400, "signature must decode to 64 bytes");
    }

    let parsed: ReturnType<typeof parseEncryptedBlobInput>;
    try {
      parsed = parseEncryptedBlobInput(input.encryptedPrivateKey, {
        fieldName: "encrypted_private_key",
        maxPayloadBytes: 1024 * 1024,
        allowLegacyString: false,
      });
    } catch (error) {
      throw new MldsaIdentityKeyError("MLDSA_KEY_INVALID", 400, (error as Error).message);
    }
    if (parsed.payloadBytes.length < MIN_ENCRYPTED_USER_IDENTITY_PAYLOAD_LEN) {
      throw new MldsaIdentityKeyError("MLDSA_KEY_INVALID", 400, "encrypted_private_key too short");
    }
    const blob = mergeEncryptedBlobMeta(parsed.blob, {
      entity: "user_private_key_bundle",
      bundle_version: 3,
      identity: "ed25519_mlkem768_mldsa65_v2",
      key_scope: "account",
    });

    const user = await this.users.findById(input.userId);
    if (!user?.publicKey) {
      throw new MldsaIdentityKeyError("USER_NOT_FOUND", 404, "user not found");
    }
    const identityPublicKey = decodeBase64(user.publicKey);
    if (!identityPublicKey || identityPublicKey.length !== 32) {
      throw new MldsaIdentityKeyError("MLDSA_KEY_INVALID", 400, "account identity key is unavailable");
    }

    ensureApiCryptoWasm();
    const message = buildMlDsaIdentityUploadMessage({
      userId: input.userId,
      mldsaPublicKey: publicKey,
      cryptoVersion: blob.crypto_version,
      algorithm: blob.algorithm,
      encryptedPrivateKeyPayload: parsed.payloadBytes,
    });
    let verified = false;
    try {
      verified = ed25519Verify(identityPublicKey, message, signature);
    } catch {
      verified = false;
    }
    if (!verified) {
      throw new MldsaIdentityKeyError("MLDSA_KEY_INVALID", 400, "identity signature verification failed");
    }

    const stored = await this.users.setMlDsaIdentityKey(input.userId, {
      publicMldsaKey: input.publicKeyBase64.trim(),
      encryptedPrivateKey: serializeEncryptedBlobToStorage(blob),
    });
    if (stored === null) {
      throw new MldsaIdentityKeyError("USER_NOT_FOUND", 404, "user not found");
    }
    if (stored === "conflict") {
      throw new MldsaIdentityKeyError("MLDSA_KEY_CONFLICT", 409, "ml-dsa identity key is already set");
    }
    return { public_mldsa_key: input.publicKeyBase64.trim(), status: "stored" };
  }
}

function decodeBase64(value: string): Uint8Array | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  try {
    const bytes = Uint8Array.from(Buffer.from(trimmed, "base64"));
    if (bytes.length === 0) {
      return null;
    }
    return bytes;
  } catch {
    return null;
  }
}

export type { EncryptedBlob };
