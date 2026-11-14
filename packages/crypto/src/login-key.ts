/**
 * Login key for self-host sign-in when outbound email cannot deliver a code.
 *
 * Domain-separated from password share C (Argon2id over the raw master password
 * and the vault KDF salt). The login key is not a vault share and cannot be
 * XORed with shares A and B to recover VaultKey. The master password never
 * leaves the client; only this 32-byte key is sent, and the server stores a
 * further slow hash of it.
 */
import { kdf_derive, sha256 } from "@okkey/crypto-wasm";
import { ensureWasm } from "./wasm-init.js";
import { OKKEY_PASSWORD_KDF_PARAMS_V1 } from "./registration.js";

const LOGIN_KEY_LEN = 32;
const LOGIN_SALT_LEN = 16;

/** Domain tag mixed into the Argon2id password input. Distinct from share C. */
export const LOGIN_KDF_DOMAIN = "okkey.login.kdf.v1";

/** Domain tag mixed into the email-derived salt. Not the vault KDF salt. */
export const LOGIN_KDF_SALT_DOMAIN = "okkey.login.salt.v1";

export function normalizeLoginEmail(email: string): string {
  return email.trim().toLowerCase();
}

function concatBytes(parts: readonly Uint8Array[]): Uint8Array {
  const length = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function utf8(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

/**
 * Public salt for the login KDF. Derived from the normalized email so the
 * client can compute it before authentication. Independent of `password_kdf_salt`.
 */
export async function loginKdfSaltForEmail(email: string): Promise<Uint8Array> {
  await ensureWasm();
  const normalized = normalizeLoginEmail(email);
  if (!normalized) {
    throw new Error("email is required to derive a login key");
  }
  const material = concatBytes([
    utf8(LOGIN_KDF_SALT_DOMAIN),
    new Uint8Array([0]),
    utf8(normalized),
  ]);
  return sha256(material).slice(0, LOGIN_SALT_LEN);
}

/**
 * 32-byte login key. Argon2id parameters match the vault password KDF, but the
 * password input and salt are domain-separated so this output is not share C.
 */
export async function deriveLoginKey(input: {
  masterPasswordUtf8: Uint8Array;
  email: string;
}): Promise<Uint8Array> {
  await ensureWasm();
  if (input.masterPasswordUtf8.length === 0) {
    throw new Error("master password is required to derive a login key");
  }
  const salt = await loginKdfSaltForEmail(input.email);
  const password = concatBytes([
    utf8(LOGIN_KDF_DOMAIN),
    new Uint8Array([0]),
    input.masterPasswordUtf8,
  ]);
  return kdf_derive(
    password,
    salt,
    OKKEY_PASSWORD_KDF_PARAMS_V1.mCost,
    OKKEY_PASSWORD_KDF_PARAMS_V1.tCost,
    OKKEY_PASSWORD_KDF_PARAMS_V1.pCost,
    LOGIN_KEY_LEN,
  );
}
