import { randomBytes, timingSafeEqual } from "node:crypto";
import { kdf_derive } from "@okkey/crypto-wasm";

import { ensureApiCryptoWasm } from "./wasm-runtime.ts";

/** Stored verifier parameters. Version 1 matches the vault Argon2id cost. */
export const LOGIN_VERIFIER_PARAMS_VERSION = 1;
export const LOGIN_KEY_LEN = 32;
export const LOGIN_VERIFIER_SALT_LEN = 16;
export const LOGIN_VERIFIER_LEN = 32;

const LOGIN_VERIFIER_KDF = {
  mCost: 19456,
  tCost: 2,
  pCost: 1,
} as const;

export interface LoginVerifierMaterial {
  verifier: Uint8Array;
  salt: Uint8Array;
  paramsVersion: number;
}

/**
 * Slow hash of a client login key. The master password and password share C
 * are not inputs. A database leak of this verifier does not yield VaultKey
 * and still costs Argon2id per password guess (the guess must produce the
 * login key first, then this hash).
 */
export function hashLoginKey(loginKey: Uint8Array, salt: Uint8Array): Uint8Array {
  ensureApiCryptoWasm();
  if (loginKey.length !== LOGIN_KEY_LEN) {
    throw new Error("login key must be 32 bytes");
  }
  if (salt.length !== LOGIN_VERIFIER_SALT_LEN) {
    throw new Error("login verifier salt must be 16 bytes");
  }
  return new Uint8Array(
    kdf_derive(
      loginKey,
      salt,
      LOGIN_VERIFIER_KDF.mCost,
      LOGIN_VERIFIER_KDF.tCost,
      LOGIN_VERIFIER_KDF.pCost,
      LOGIN_VERIFIER_LEN,
    ),
  );
}

export function createLoginVerifier(loginKey: Uint8Array): LoginVerifierMaterial {
  const salt = new Uint8Array(randomBytes(LOGIN_VERIFIER_SALT_LEN));
  return {
    verifier: hashLoginKey(loginKey, salt),
    salt,
    paramsVersion: LOGIN_VERIFIER_PARAMS_VERSION,
  };
}

/**
 * Constant-time compare. Always runs Argon2id, including when the account or
 * verifier is missing, so the failure path does not skip the KDF.
 */
export function loginVerifierMatches(
  loginKey: Uint8Array,
  salt: Uint8Array | null,
  verifier: Uint8Array | null,
): boolean {
  const saltBytes = new Uint8Array(
    salt ?? Buffer.alloc(LOGIN_VERIFIER_SALT_LEN, 0x5a),
  );
  const expected = Buffer.from(verifier ?? Buffer.alloc(LOGIN_VERIFIER_LEN, 0));
  let actual: Uint8Array;
  try {
    actual = hashLoginKey(loginKey, saltBytes);
  } catch {
    actual = Buffer.alloc(LOGIN_VERIFIER_LEN, 1);
  }
  const left = Buffer.from(actual);
  const right = expected;
  if (left.length !== right.length) {
    return false;
  }
  const equal = timingSafeEqual(left, right);
  return Boolean(verifier && salt && equal);
}

/** Decode a standard-base64 32-byte login key. Returns null when the shape is wrong. */
export function decodeLoginKey(value: unknown): Uint8Array | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const bytes = Buffer.from(trimmed, "base64");
  if (bytes.length !== LOGIN_KEY_LEN) {
    return null;
  }
  return new Uint8Array(bytes);
}
