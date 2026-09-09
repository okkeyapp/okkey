/** Bitwarden password-protected export helpers (Web Crypto). */

export type BitwardenPasswordProtectedFile = {
  encrypted: true;
  passwordProtected: true;
  salt: string;
  kdfType: number;
  kdfIterations: number;
  kdfMemory?: number;
  kdfParallelism?: number;
  encKeyValidation_DO_NOT_EDIT: string;
  data: string;
};

const KDF_PBKDF2 = 0;
const ENC_TYPE_AES_CBC_256_HMAC_SHA256 = 2;

export function isPasswordProtectedExportEnvelope(
  data: unknown,
): data is BitwardenPasswordProtectedFile {
  if (!data || typeof data !== "object") {
    return false;
  }
  const record = data as Record<string, unknown>;
  return (
    record.encrypted === true &&
    record.passwordProtected === true &&
    typeof record.salt === "string" &&
    typeof record.kdfIterations === "number" &&
    typeof record.encKeyValidation_DO_NOT_EDIT === "string" &&
    typeof record.data === "string"
  );
}

export function isBitwardenPasswordProtected(data: unknown): data is BitwardenPasswordProtectedFile {
  if (!isPasswordProtectedExportEnvelope(data)) {
    return false;
  }
  const record = data as Record<string, unknown>;
  // Okkey password-protected exports share the envelope but carry format: "okkey".
  return record.format !== "okkey";
}

export function looksLikeBitwardenPasswordProtectedJson(text: string): boolean {
  try {
    return isBitwardenPasswordProtected(JSON.parse(text) as unknown);
  } catch {
    return false;
  }
}

export function isBitwardenAccountEncryptedExport(data: unknown): boolean {
  if (!data || typeof data !== "object") {
    return false;
  }
  const record = data as Record<string, unknown>;
  return record.encrypted === true && record.passwordProtected !== true;
}

export class ImportPasswordRequiredError extends Error {
  readonly code = "IMPORT_PASSWORD_REQUIRED" as const;
  constructor(message = "Encrypted Bitwarden export requires export password") {
    super(message);
    this.name = "ImportPasswordRequiredError";
  }
}

export class ImportInvalidPasswordError extends Error {
  readonly code = "IMPORT_INVALID_PASSWORD" as const;
  constructor(message = "Invalid export password") {
    super(message);
    this.name = "ImportInvalidPasswordError";
  }
}

export async function decryptBitwardenPasswordProtectedExport(
  file: BitwardenPasswordProtectedFile,
  password: string,
): Promise<string> {
  if (!password.trim()) {
    throw new ImportInvalidPasswordError();
  }
  if (file.kdfType !== KDF_PBKDF2) {
    throw new Error("Only PBKDF2 password-protected Bitwarden exports are supported");
  }

  const masterKey = await derivePbkdf2Key(password, file.salt, file.kdfIterations);
  const stretched = await stretchKey(masterKey);

  try {
    await decryptEncString(file.encKeyValidation_DO_NOT_EDIT, stretched);
  } catch {
    throw new ImportInvalidPasswordError();
  }

  return decryptEncString(file.data, stretched);
}

async function derivePbkdf2Key(password: string, salt: string, iterations: number): Promise<Uint8Array> {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: enc.encode(salt),
      iterations,
    },
    baseKey,
    256,
  );
  return new Uint8Array(bits);
}

async function stretchKey(key: Uint8Array): Promise<Uint8Array> {
  const encKey = await hkdfExpand(key, "enc", 32);
  const macKey = await hkdfExpand(key, "mac", 32);
  const out = new Uint8Array(64);
  out.set(encKey, 0);
  out.set(macKey, 32);
  return out;
}

async function hkdfExpand(prk: Uint8Array, info: string, length: number): Promise<Uint8Array> {
  const hashLen = 32;
  const n = Math.ceil(length / hashLen);
  const infoBytes = new TextEncoder().encode(info);
  let prev = new Uint8Array(0);
  const out = new Uint8Array(n * hashLen);
  const key = await crypto.subtle.importKey("raw", prk, { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  for (let i = 0; i < n; i += 1) {
    const input = new Uint8Array(prev.length + infoBytes.length + 1);
    input.set(prev, 0);
    input.set(infoBytes, prev.length);
    input[prev.length + infoBytes.length] = i + 1;
    const block = new Uint8Array(await crypto.subtle.sign("HMAC", key, input));
    out.set(block, i * hashLen);
    prev = block;
  }
  return out.slice(0, length);
}

const DEFAULT_KDF_ITERATIONS = 600_000;

export async function encryptPasswordProtectedExport(
  plaintext: string,
  password: string,
  options?: { kdfIterations?: number },
): Promise<BitwardenPasswordProtectedFile> {
  if (!password.trim()) {
    throw new ImportInvalidPasswordError("Export password is required");
  }
  const iterations = options?.kdfIterations ?? DEFAULT_KDF_ITERATIONS;
  const saltBytes = crypto.getRandomValues(new Uint8Array(16));
  const salt = bytesToB64(saltBytes);
  const masterKey = await derivePbkdf2Key(password, salt, iterations);
  const stretched = await stretchKey(masterKey);
  const encKeyValidation_DO_NOT_EDIT = await encryptEncString("okkey-export-key-validation", stretched);
  const data = await encryptEncString(plaintext, stretched);
  return {
    encrypted: true,
    passwordProtected: true,
    salt,
    kdfType: KDF_PBKDF2,
    kdfIterations: iterations,
    encKeyValidation_DO_NOT_EDIT,
    data,
  };
}

async function encryptEncString(plaintext: string, stretchedKey: Uint8Array): Promise<string> {
  const encKey = stretchedKey.slice(0, 32);
  const macKey = stretchedKey.slice(32, 64);
  const iv = crypto.getRandomValues(new Uint8Array(16));
  const aesKey = await crypto.subtle.importKey("raw", encKey, { name: "AES-CBC" }, false, ["encrypt"]);
  const cipher = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-CBC", iv }, aesKey, new TextEncoder().encode(plaintext)),
  );
  const macData = new Uint8Array(iv.length + cipher.length);
  macData.set(iv, 0);
  macData.set(cipher, iv.length);
  const macCryptoKey = await crypto.subtle.importKey(
    "raw",
    macKey,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", macCryptoKey, macData));
  return `${ENC_TYPE_AES_CBC_256_HMAC_SHA256}.${bytesToB64(iv)}|${bytesToB64(cipher)}|${bytesToB64(mac)}`;
}

function bytesToB64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

async function decryptEncString(encryptedString: string, stretchedKey: Uint8Array): Promise<string> {
  const parts = encryptedString.split(".");
  if (parts.length !== 2) {
    throw new Error("Invalid Bitwarden EncString");
  }
  const encType = Number(parts[0]);
  const payload = parts[1] ?? "";
  if (encType !== ENC_TYPE_AES_CBC_256_HMAC_SHA256) {
    throw new Error(`Unsupported Bitwarden encryption type: ${encType}`);
  }
  const [ivB64, dataB64, macB64] = payload.split("|");
  if (!ivB64 || !dataB64 || !macB64) {
    throw new Error("Invalid Bitwarden EncString payload");
  }

  const iv = b64ToBytes(ivB64);
  const data = b64ToBytes(dataB64);
  const mac = b64ToBytes(macB64);
  const encKey = stretchedKey.slice(0, 32);
  const macKey = stretchedKey.slice(32, 64);

  const macData = new Uint8Array(iv.length + data.length);
  macData.set(iv, 0);
  macData.set(data, iv.length);
  const macCryptoKey = await crypto.subtle.importKey(
    "raw",
    macKey,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const computedMac = new Uint8Array(await crypto.subtle.sign("HMAC", macCryptoKey, macData));
  if (!timingSafeEqual(computedMac, mac)) {
    throw new Error("MAC validation failed");
  }

  const aesKey = await crypto.subtle.importKey("raw", encKey, { name: "AES-CBC" }, false, [
    "decrypt",
  ]);
  const plain = await crypto.subtle.decrypt({ name: "AES-CBC", iv }, aesKey, data);
  return new TextDecoder().decode(plain);
}

function b64ToBytes(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const pad = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  const binary = atob(normalized + pad);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a[i]! ^ b[i]!;
  }
  return diff === 0;
}
