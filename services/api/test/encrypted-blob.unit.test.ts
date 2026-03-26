import assert from "node:assert/strict";
import test from "node:test";
import {
  decodeEncryptedBlobFromStorage,
  parseEncryptedBlobInput,
  serializeEncryptedBlobToStorage,
} from "../src/crypto/encrypted-blob.ts";

test("EncryptedBlob round-trip serialize/deserialize", () => {
  const parsed = parseEncryptedBlobInput(
    {
      crypto_version: 2,
      algorithm: "opaque",
      payload: Buffer.from("ciphertext").toString("base64"),
      meta: { origin: "unit-test", x: 1 },
    },
    {
      fieldName: "encryptedBlob",
      maxPayloadBytes: 1024,
    },
  );
  const stored = serializeEncryptedBlobToStorage(parsed.blob);
  const restored = decodeEncryptedBlobFromStorage(stored);
  assert.deepEqual(restored, parsed.blob);
});

test("EncryptedBlob rejects malformed/missing fields", () => {
  assert.throws(
    () =>
      parseEncryptedBlobInput(
        {
          algorithm: "opaque",
          payload: Buffer.from("x").toString("base64"),
          meta: {},
        },
        { fieldName: "encryptedBlob", maxPayloadBytes: 32 },
      ),
    /crypto_version/,
  );

  assert.throws(
    () =>
      parseEncryptedBlobInput(
        {
          crypto_version: 2,
          algorithm: "opaque",
          payload: "",
          meta: {},
        },
        { fieldName: "encryptedBlob", maxPayloadBytes: 32 },
      ),
    /payload/,
  );

  assert.throws(
    () =>
      parseEncryptedBlobInput(
        {
          crypto_version: 2,
          algorithm: "opaque",
          payload: Buffer.from("x").toString("base64"),
          meta: [],
        },
        { fieldName: "encryptedBlob", maxPayloadBytes: 32 },
      ),
    /meta must be an object/,
  );
});

test("EncryptedBlob rejects payload over limit and unknown algorithm", () => {
  const payload = Buffer.alloc(300, 1).toString("base64");
  assert.throws(
    () =>
      parseEncryptedBlobInput(
        {
          crypto_version: 2,
          algorithm: "opaque",
          payload,
          meta: {},
        },
        { fieldName: "encryptedBlob", maxPayloadBytes: 64 },
      ),
    /exceeds/,
  );

  assert.throws(
    () =>
      parseEncryptedBlobInput(
        {
          crypto_version: 2,
          algorithm: "unknown-algo",
          payload: Buffer.from("x").toString("base64"),
          meta: {},
        },
        { fieldName: "encryptedBlob", maxPayloadBytes: 64 },
      ),
    /algorithm is not allowed/,
  );
});

test("EncryptedBlob accepts unknown meta keys", () => {
  const parsed = parseEncryptedBlobInput(
    {
      crypto_version: 2,
      algorithm: "opaque",
      payload: Buffer.from("x").toString("base64"),
      meta: {
        new_key: "v",
        nested: { a: 1 },
        arr: [1, 2, 3],
      },
    },
    { fieldName: "encryptedBlob", maxPayloadBytes: 64 },
  );
  assert.equal(parsed.blob.meta.new_key, "v");
});
