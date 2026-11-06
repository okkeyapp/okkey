/**
 * One-time hybrid delivery of a 32-byte device share.
 * Ephemeral sender secrets are wiped inside the crypto engine.
 * The caller wipes the one-time private keys after the share is received.
 */
import { decrypt_hybrid, encrypt_hybrid, mlkem768_keypair, x25519_keypair } from "@okkey/crypto-wasm";
import { mapWasmError } from "./errors.js";
import { wipeBytes } from "./secret-buffer.js";
import { ensureWasm } from "./wasm-init.js";
import {
  MLKEM768_DECAPSULATION_KEY_LEN,
  MLKEM768_ENCAPSULATION_KEY_LEN,
} from "./user-identity-bundle.js";

const SHARE_LEN = 32;
const X25519_LEN = 32;

export function deviceShareDeliveryAad(deviceId: string): Uint8Array {
  return new TextEncoder().encode(`okkey-device-share-delivery-v1\n${deviceId}`);
}

export interface OneTimeDeliveryKeyPair {
  x25519PublicKey: Uint8Array;
  x25519PrivateKey: Uint8Array;
  mlkemPublicKey: Uint8Array;
  mlkemPrivateKey: Uint8Array;
}

export async function generateOneTimeDeliveryKeyPair(): Promise<OneTimeDeliveryKeyPair> {
  await ensureWasm();
  const x25519 = x25519_keypair();
  const mlkem = mlkem768_keypair();
  try {
    if (x25519.length !== X25519_LEN * 2) {
      throw new Error("unexpected X25519 keypair length");
    }
    if (mlkem.length !== MLKEM768_DECAPSULATION_KEY_LEN + MLKEM768_ENCAPSULATION_KEY_LEN) {
      throw new Error("unexpected ML-KEM keypair length");
    }
    return {
      x25519PrivateKey: x25519.slice(0, X25519_LEN),
      x25519PublicKey: x25519.slice(X25519_LEN),
      mlkemPrivateKey: mlkem.slice(0, MLKEM768_DECAPSULATION_KEY_LEN),
      mlkemPublicKey: mlkem.slice(MLKEM768_DECAPSULATION_KEY_LEN),
    };
  } finally {
    wipeBytes(x25519);
    wipeBytes(mlkem);
  }
}

/** Wipe the one-time private keys held by the new device. */
export function wipeOneTimeDeliveryPrivateKeys(keys: {
  x25519PrivateKey: Uint8Array;
  mlkemPrivateKey: Uint8Array;
}): void {
  wipeBytes(keys.x25519PrivateKey);
  wipeBytes(keys.mlkemPrivateKey);
}

export async function sealDeviceShareForOneTimeKey(input: {
  deviceShare: Uint8Array;
  recipientX25519PublicKey: Uint8Array;
  recipientMlkemPublicKey: Uint8Array;
  deviceId: string;
}): Promise<Uint8Array> {
  await ensureWasm();
  if (input.deviceShare.length !== SHARE_LEN) {
    throw new Error("device share must be 32 bytes");
  }
  const shareCopy = input.deviceShare.slice();
  try {
    return encrypt_hybrid(
      new Uint8Array(32),
      input.recipientX25519PublicKey,
      input.recipientMlkemPublicKey,
      deviceShareDeliveryAad(input.deviceId),
      shareCopy,
    );
  } catch (error) {
    throw mapWasmError("sealDeviceShareForOneTimeKey", error);
  } finally {
    wipeBytes(shareCopy);
  }
}

/**
 * Decrypt a delivery envelope. Does not wipe the one-time private keys:
 * the caller deletes them only after the server accepts receipt.
 * A tampered envelope throws and leaves those keys intact so the attempt can be told apart.
 */
export async function openDeviceShareDelivery(input: {
  envelope: Uint8Array;
  x25519PrivateKey: Uint8Array;
  mlkemPrivateKey: Uint8Array;
  deviceId: string;
}): Promise<Uint8Array> {
  await ensureWasm();
  let share: Uint8Array;
  try {
    share = decrypt_hybrid(
      input.x25519PrivateKey,
      input.mlkemPrivateKey,
      deviceShareDeliveryAad(input.deviceId),
      input.envelope,
    );
  } catch (error) {
    throw mapWasmError("openDeviceShareDelivery", error);
  }
  if (share.length !== SHARE_LEN) {
    wipeBytes(share);
    throw new Error("device share delivery plaintext must be 32 bytes");
  }
  return share;
}
