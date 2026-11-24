import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import test from "node:test";

const currentFile = fileURLToPath(import.meta.url);
const apiDir = path.resolve(path.dirname(currentFile), "..");
const repoRoot = path.resolve(apiDir, "..", "..");

test("OpenAPI includes canonical EncryptedBlob schema and usage", async () => {
  const openapiPath = path.join(repoRoot, "docs", "openapi", "core-api.yaml");
  const content = await readFile(openapiPath, "utf8");

  assert.match(content, /EncryptedBlob:/);
  assert.match(content, /Vault:[\s\S]*cryptoVersion:/);
  assert.match(content, /required: \[crypto_version, algorithm, payload, meta\]/);
  assert.match(content, /SyncAppendRequest:[\s\S]*encryptedBlob:/);
  assert.match(content, /VaultKeyResponse:[\s\S]*encryptedVaultKey:[\s\S]*EncryptedBlob/);
  assert.match(content, /CapsuleCreateRequest:[\s\S]*encryptedPayload:[\s\S]*EncryptedBlob/);
  assert.match(content, /RegisterCompleteRequest:[\s\S]*encrypted_private_key:[\s\S]*EncryptedBlob/);
});

test("OpenAPI snowflake id patterns stay a quoted digit-class regex", async () => {
  const openapiPath = path.join(repoRoot, "docs", "openapi", "core-api.yaml");
  const content = await readFile(openapiPath, "utf8");
  const patternLines = content.split("\n").filter((line) => /^\s*pattern:/.test(line));
  assert.ok(patternLines.length >= 3);
  // Single-quoted YAML so the value is ^\d{10,20}$, matching ENTITY_ID_RE in packages/id.
  // A truncated `^d{10,20}` (missing the digit-class escape) must not land in this file.
  const expectedLine = "pattern: '^\\d{10,20}$'";
  const expectedValue = "^\\d{10,20}$";
  for (const line of patternLines) {
    const raw = line.trim();
    assert.equal(raw, expectedLine, `unexpected OpenAPI pattern: ${raw}`);
    const quoted = raw.slice("pattern: ".length);
    const value = quoted.slice(1, -1).replaceAll("''", "'");
    assert.equal(value, expectedValue);
    assert.equal(new RegExp(value).test("1234567890"), true);
    assert.equal(new RegExp(value).test("d234567890"), false);
    assert.equal(new RegExp(value).test("123456789"), false);
  }
});

test("DTO contract exposes EncryptedBlob fields in types", async () => {
  const typesPath = path.join(repoRoot, "packages", "types", "src", "index.ts");
  const cryptoWirePath = path.join(repoRoot, "packages", "types", "src", "crypto-wire.ts");
  const content = await readFile(typesPath, "utf8");
  const cryptoWireContent = await readFile(cryptoWirePath, "utf8");
  const capsuleContent = await readFile(
    path.join(repoRoot, "packages", "types", "src", "capsules.ts"),
    "utf8",
  );

  assert.match(content, /export interface Vault[\s\S]*cryptoVersion: number;/);
  // Canonical wire DTO lives in crypto-wire.ts and must stay publicly re-exported from index.
  assert.match(cryptoWireContent, /export interface EncryptedBlobDto/);
  assert.match(cryptoWireContent, /crypto_version: number;/);
  assert.match(cryptoWireContent, /algorithm: string;/);
  assert.match(cryptoWireContent, /payload: string;/);
  assert.match(cryptoWireContent, /meta: Record<string, unknown>;/);
  assert.match(
    content,
    /export type \{[\s\S]*EncryptedBlobDto[\s\S]*\} from "\.\/crypto-wire\.js";/,
  );

  assert.match(content, /SyncAppendEventRequestDto[\s\S]*encryptedBlob: EncryptedBlobDto;/);
  assert.match(content, /SyncEventWireDto[\s\S]*encryptedBlob: EncryptedBlobDto;/);
  assert.match(capsuleContent, /CapsuleCreateRequestDto[\s\S]*encryptedPayload: EncryptedBlobDto;/);
  assert.match(content, /RegisterCompleteRequestDto[\s\S]*user_public_pq_key:[\s\S]*encrypted_private_key: EncryptedBlobDto;/);
});
