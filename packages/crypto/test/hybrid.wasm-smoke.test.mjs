import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import initWasm, {
  decrypt_hybrid,
  encrypt_hybrid,
  generate_pq_keys,
  x25519_keypair,
} from "../dist/okkey_crypto_engine.js";

test("wasm hybrid encrypt/decrypt smoke", async () => {
  const wasmBytes = await readFile(
    new URL("../dist/okkey_crypto_engine_bg.wasm", import.meta.url),
  );
  await initWasm({ module_or_path: wasmBytes });

  const recipientBoth = x25519_keypair();
  const recipientSk = recipientBoth.slice(0, 32);
  const recipientPk = recipientBoth.slice(32);

  const senderBoth = x25519_keypair();
  const senderSk = senderBoth.slice(0, 32);

  const pqBoth = generate_pq_keys();
  const recipientPqDk = pqBoth.slice(0, 2400);
  const recipientPqEk = pqBoth.slice(2400);

  const aad = new TextEncoder().encode("okkey-wasm-smoke");
  const plaintext = new TextEncoder().encode("hello-hybrid");

  const envelope = encrypt_hybrid(
    senderSk,
    recipientPk,
    recipientPqEk,
    aad,
    plaintext,
  );
  const decrypted = decrypt_hybrid(
    recipientSk,
    recipientPqDk,
    aad,
    envelope,
  );

  assert.equal(new TextDecoder().decode(decrypted), "hello-hybrid");
});
