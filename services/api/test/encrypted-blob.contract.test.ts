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
  assert.match(content, /required: \[crypto_version, algorithm, payload, meta\]/);
  assert.match(content, /SyncAppendRequest:[\s\S]*encryptedBlob:/);
  assert.match(content, /VaultKeyResponse:[\s\S]*encryptedVaultKey:[\s\S]*EncryptedBlob/);
  assert.match(content, /CapsuleCreateRequest:[\s\S]*encryptedPayload:[\s\S]*EncryptedBlob/);
});

test("DTO contract exposes EncryptedBlob fields in types", async () => {
  const typesPath = path.join(repoRoot, "packages", "types", "src", "index.ts");
  const content = await readFile(typesPath, "utf8");

  assert.match(content, /export interface EncryptedBlobDto/);
  assert.match(content, /crypto_version: number;/);
  assert.match(content, /algorithm: string;/);
  assert.match(content, /payload: string;/);
  assert.match(content, /meta: Record<string, unknown>;/);

  assert.match(content, /SyncAppendEventRequestDto[\s\S]*encryptedBlob: EncryptedBlobDto;/);
  assert.match(content, /SyncEventWireDto[\s\S]*encryptedBlob: EncryptedBlobDto;/);
  assert.match(content, /CapsuleCreateRequestDto[\s\S]*encryptedPayload: EncryptedBlobDto;/);
});
