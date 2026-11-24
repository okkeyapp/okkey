/**
 * Capsule guest-key link.
 *
 * New links seal the capsule key to a one-time X25519 + ML-KEM-768 recipient
 * and carry that delivery in the URL fragment. Anonymous guests need no account.
 * A legacy fragment that is exactly 32 bytes still opens.
 */
import {
  decrypt_hybrid,
  encrypt_hybrid,
  mlkem768_decapsulation_key_len,
  mlkem768_encapsulation_key_len,
  mlkem768_keypair,
  x25519_keypair,
} from "@okkey/crypto-wasm";
import { mapWasmError } from "./errors.js";
import { wipeBytes } from "./secret-buffer.js";
import { ensureWasm } from "./wasm-init.js";

const KEY_LEN = 32;
const X25519_LEN = 32;
const MAGIC = [0x4f, 0x4b, 0x47, 0x4b] as const; // OKGK
const VERSION = 1;

/** Distinct from vault-key and share-B wraps. */
const GUEST_KEY_AAD = new TextEncoder().encode("okkey-capsule-guest-key-v1");

export const CAPSULE_GUEST_KEY_DELIVERY_LEGACY_FRAGMENT = "legacy_fragment" as const;
export const CAPSULE_GUEST_KEY_HYBRID_RECIPIENT = "ephemeral_v1" as const;

function b64urlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  const b64 = typeof btoa === "function" ? btoa(binary) : Buffer.from(binary, "binary").toString("base64");
  return b64.replace(/\+/gu, "-").replace(/\//gu, "_").replace(/=+$/u, "");
}

function b64urlDecode(value: string): Uint8Array {
  const normalized = value.replace(/-/gu, "+").replace(/_/gu, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary =
    typeof atob === "function" ? atob(padded) : Buffer.from(padded, "base64").toString("binary");
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function packGuestFragment(x25519Private: Uint8Array, mlkemDk: Uint8Array, envelope: Uint8Array): Uint8Array {
  const out = new Uint8Array(MAGIC.length + 1 + x25519Private.length + mlkemDk.length + envelope.length);
  out.set(MAGIC, 0);
  out[MAGIC.length] = VERSION;
  let offset = MAGIC.length + 1;
  out.set(x25519Private, offset);
  offset += x25519Private.length;
  out.set(mlkemDk, offset);
  offset += mlkemDk.length;
  out.set(envelope, offset);
  return out;
}

/** New guest link material. Legacy writers keep {@link encodeCapsuleKeyFragment}. */
export async function exportCapsuleGuestKeyFragment(capsuleKey: Uint8Array): Promise<string> {
  await ensureWasm();
  if (capsuleKey.length !== KEY_LEN) {
    throw new Error("capsule key must be 32 bytes");
  }
  const xBoth = x25519_keypair();
  const mlBoth = mlkem768_keypair();
  const dkLen = mlkem768_decapsulation_key_len();
  const ekLen = mlkem768_encapsulation_key_len();
  if (xBoth.length !== X25519_LEN * 2 || mlBoth.length !== dkLen + ekLen) {
    wipeBytes(xBoth);
    wipeBytes(mlBoth);
    throw new Error("unexpected ephemeral guest key length");
  }
  const xSk = xBoth.slice(0, X25519_LEN);
  const xPk = xBoth.slice(X25519_LEN);
  const dk = mlBoth.slice(0, dkLen);
  const ek = mlBoth.slice(dkLen);
  const share = capsuleKey.slice();
  let envelope: Uint8Array | null = null;
  try {
    try {
      envelope = encrypt_hybrid(new Uint8Array(32), xPk, ek, GUEST_KEY_AAD, share);
    } catch (error) {
      throw mapWasmError("exportCapsuleGuestKeyFragment", error);
    }
    const packed = packGuestFragment(xSk, dk, envelope);
    try {
      return b64urlEncode(packed);
    } finally {
      wipeBytes(packed);
    }
  } finally {
    wipeBytes(xBoth);
    wipeBytes(mlBoth);
    wipeBytes(xSk);
    wipeBytes(xPk);
    wipeBytes(dk);
    wipeBytes(ek);
    wipeBytes(share);
    if (envelope) {
      wipeBytes(envelope);
    }
  }
}

/**
 * Open a guest fragment.
 * Exactly 32 decoded bytes is the legacy raw key. Anything else is the
 * ephemeral recipient delivery.
 */
export async function readCapsuleGuestKey(material: string): Promise<Uint8Array> {
  await ensureWasm();
  let bytes: Uint8Array;
  try {
    bytes = b64urlDecode(material.trim());
  } catch {
    throw new Error("invalid capsule key fragment");
  }
  if (bytes.length === KEY_LEN) {
    return bytes;
  }
  const dkLen = mlkem768_decapsulation_key_len();
  const header = MAGIC.length + 1 + X25519_LEN + dkLen;
  const magicOk =
    bytes.length > header &&
    bytes[0] === MAGIC[0] &&
    bytes[1] === MAGIC[1] &&
    bytes[2] === MAGIC[2] &&
    bytes[3] === MAGIC[3] &&
    bytes[4] === VERSION;
  if (!magicOk) {
    bytes.fill(0);
    throw new Error("invalid capsule key fragment");
  }
  const xSk = bytes.slice(MAGIC.length + 1, MAGIC.length + 1 + X25519_LEN);
  const dk = bytes.slice(MAGIC.length + 1 + X25519_LEN, header);
  const envelope = bytes.slice(header);
  bytes.fill(0);
  try {
    let opened: Uint8Array;
    try {
      opened = decrypt_hybrid(xSk, dk, GUEST_KEY_AAD, envelope);
    } catch (error) {
      throw mapWasmError("readCapsuleGuestKey", error);
    }
    if (opened.length !== KEY_LEN) {
      wipeBytes(opened);
      throw new Error("invalid capsule key fragment");
    }
    return opened;
  } finally {
    wipeBytes(xSk);
    wipeBytes(dk);
    wipeBytes(envelope);
  }
}
