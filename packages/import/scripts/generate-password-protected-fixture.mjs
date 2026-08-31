/**
 * Generates packages/import/test/fixtures/bitwarden/password-protected.json
 * Password: 1234
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { webcrypto } from "node:crypto";

const crypto = webcrypto;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesRoot = path.join(__dirname, "../test/fixtures/bitwarden");
const password = "1234";
const clearText = readFileSync(path.join(fixturesRoot, "unencrypted.json"), "utf8");

function bytesToB64(bytes) {
  return Buffer.from(bytes).toString("base64");
}

async function derivePbkdf2Key(pwd, salt, iterations) {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey("raw", enc.encode(pwd), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: enc.encode(salt), iterations },
    baseKey,
    256,
  );
  return new Uint8Array(bits);
}

async function hkdfExpand(prk, info, length) {
  const hashLen = 32;
  const n = Math.ceil(length / hashLen);
  const infoBytes = new TextEncoder().encode(info);
  let prev = new Uint8Array(0);
  const out = new Uint8Array(n * hashLen);
  const key = await crypto.subtle.importKey("raw", prk, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
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

async function stretchKey(key) {
  const encKey = await hkdfExpand(key, "enc", 32);
  const macKey = await hkdfExpand(key, "mac", 32);
  const out = new Uint8Array(64);
  out.set(encKey, 0);
  out.set(macKey, 32);
  return out;
}

async function encryptEncString(plain, stretchedKey) {
  const encKey = stretchedKey.slice(0, 32);
  const macKey = stretchedKey.slice(32, 64);
  const iv = crypto.getRandomValues(new Uint8Array(16));
  const aesKey = await crypto.subtle.importKey("raw", encKey, { name: "AES-CBC" }, false, ["encrypt"]);
  const data = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-CBC", iv }, aesKey, new TextEncoder().encode(plain)));
  const macData = new Uint8Array(iv.length + data.length);
  macData.set(iv, 0);
  macData.set(data, iv.length);
  const macCryptoKey = await crypto.subtle.importKey("raw", macKey, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", macCryptoKey, macData));
  return `2.${bytesToB64(iv)}|${bytesToB64(data)}|${bytesToB64(mac)}`;
}

const saltBytes = crypto.getRandomValues(new Uint8Array(16));
const salt = bytesToB64(saltBytes);
const iterations = 100000;
const masterKey = await derivePbkdf2Key(password, salt, iterations);
const stretched = await stretchKey(masterKey);
const validation = crypto.randomUUID();
const encKeyValidation = await encryptEncString(validation, stretched);
const data = await encryptEncString(clearText, stretched);

const out = {
  encrypted: true,
  passwordProtected: true,
  salt,
  kdfType: 0,
  kdfIterations: iterations,
  encKeyValidation_DO_NOT_EDIT: encKeyValidation,
  data,
};

writeFileSync(path.join(fixturesRoot, "password-protected.json"), `${JSON.stringify(out, null, 2)}\n`);
console.log("Wrote password-protected.json (password: 1234)");
