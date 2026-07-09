import initWasm, {
  aead_decrypt,
  aead_encrypt,
  random_bytes,
} from "@okkey/crypto-wasm";
import { wipeBytes } from "./secret-buffer.js";

const NONCE_LEN = 24;
const ATTACHMENT_PAYLOAD_AAD_PREFIX = "okkey-attachment-payload-v1";
const ATTACHMENT_KEY_AAD_PREFIX = "okkey-attachment-key-wrap-v1";

let wasmReady: Promise<void> | undefined;

async function ensureWasm(): Promise<void> {
  if (!wasmReady) {
    wasmReady = initWasm().then(() => undefined);
  }
  await wasmReady;
}

export type AttachmentAadContext = {
  vaultId: string;
  itemId: string;
  attachmentId?: string;
};

export type EncryptedAttachmentPayload = {
  encryptedBody: Uint8Array;
  encryptedKey: Uint8Array;
};

function encodeAad(prefix: string, context: AttachmentAadContext): Uint8Array {
  return new TextEncoder().encode(
    JSON.stringify({
      prefix,
      vaultId: context.vaultId,
      itemId: context.itemId,
      attachmentId: context.attachmentId ?? "",
    }),
  );
}

function seal(key: Uint8Array, aad: Uint8Array, plaintext: Uint8Array): Uint8Array {
  const nonce = random_bytes(NONCE_LEN);
  const ciphertext = aead_encrypt("xchacha20-poly1305", key, nonce, aad, plaintext);
  const out = new Uint8Array(nonce.length + ciphertext.length);
  out.set(nonce, 0);
  out.set(ciphertext, nonce.length);
  return out;
}

function open(key: Uint8Array, aad: Uint8Array, blob: Uint8Array): Uint8Array {
  if (blob.length <= NONCE_LEN) {
    throw new Error("invalid attachment ciphertext: too short");
  }
  const nonce = blob.subarray(0, NONCE_LEN);
  const ciphertext = blob.subarray(NONCE_LEN);
  return aead_decrypt("xchacha20-poly1305", key, nonce, aad, ciphertext);
}

export async function encryptAttachmentPayload(
  vaultKey: Uint8Array,
  plaintext: Uint8Array,
  context: AttachmentAadContext,
): Promise<EncryptedAttachmentPayload> {
  await ensureWasm();
  const attachmentKey = random_bytes(32);
  try {
    const encryptedBody = seal(
      attachmentKey,
      encodeAad(ATTACHMENT_PAYLOAD_AAD_PREFIX, context),
      plaintext,
    );
    const encryptedKey = seal(
      vaultKey,
      encodeAad(ATTACHMENT_KEY_AAD_PREFIX, context),
      attachmentKey,
    );
    return { encryptedBody, encryptedKey };
  } finally {
    wipeBytes(attachmentKey);
  }
}

export async function decryptAttachmentPayload(
  vaultKey: Uint8Array,
  encryptedKey: Uint8Array,
  encryptedBody: Uint8Array,
  context: AttachmentAadContext,
): Promise<Uint8Array> {
  await ensureWasm();
  const attachmentKey = open(
    vaultKey,
    encodeAad(ATTACHMENT_KEY_AAD_PREFIX, context),
    encryptedKey,
  );
  try {
    return open(
      attachmentKey,
      encodeAad(ATTACHMENT_PAYLOAD_AAD_PREFIX, context),
      encryptedBody,
    );
  } finally {
    wipeBytes(attachmentKey);
  }
}
