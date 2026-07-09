import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { initSync } from "@okkey/crypto-wasm";

const cryptoDist = join(dirname(fileURLToPath(import.meta.url)), "../../../packages/crypto/dist");

test("attachment: encrypt/decrypt round-trip with vault key", async () => {
  initSync(readFileSync(join(cryptoDist, "okkey_crypto_engine_bg.wasm")));

  const { encryptAttachmentPayload, decryptAttachmentPayload } = await import(
    "../../../packages/crypto/dist/attachment.js"
  );

  const vaultKey = new Uint8Array(32);
  vaultKey.fill(0x37);
  const plaintext = new TextEncoder().encode("encrypted attachment bytes");
  const context = { vaultId: "1000000000000000001", itemId: "1000000000000000002" };

  const encrypted = await encryptAttachmentPayload(vaultKey, plaintext, context);
  assert.ok(encrypted.encryptedBody.length > 24, "encrypted attachment body expected");
  assert.ok(encrypted.encryptedKey.length > 24, "encrypted attachment key expected");

  const roundTrip = await decryptAttachmentPayload(
    vaultKey,
    encrypted.encryptedKey,
    encrypted.encryptedBody,
    context,
  );
  assert.deepEqual(roundTrip, plaintext);

  await assert.rejects(
    () =>
      decryptAttachmentPayload(
        vaultKey,
        encrypted.encryptedKey,
        encrypted.encryptedBody,
        { vaultId: context.vaultId, itemId: "1000000000000000003" },
      ),
    /decrypt|auth|aad|invalid|aead/i,
  );
});
