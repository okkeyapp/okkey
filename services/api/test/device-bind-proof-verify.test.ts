import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, sign as nodeSign } from "node:crypto";
import { verifyDeviceBindSignature } from "../src/device/bind-proof.ts";

function b64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

/**
 * Bind proof verification must not depend on `@okkey/crypto` WASM init.
 * A missing WASM init previously made every valid client signature look invalid.
 */
test("verifyDeviceBindSignature accepts Node-generated Ed25519 proofs without WASM", () => {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const rawPub = publicKey.export({ type: "spki", format: "der" }).subarray(-32);
  const message = Buffer.from("okkey-device-bind-v1\nchallenge\ndevice\nhash\nnonce", "utf8");
  const signature = nodeSign(null, message, privateKey);

  assert.equal(verifyDeviceBindSignature(b64(rawPub), new Uint8Array(message), b64(signature)), true);

  const other = generateKeyPairSync("ed25519");
  const otherPub = other.publicKey.export({ type: "spki", format: "der" }).subarray(-32);
  assert.equal(
    verifyDeviceBindSignature(b64(otherPub), new Uint8Array(message), b64(signature)),
    false,
  );
});
