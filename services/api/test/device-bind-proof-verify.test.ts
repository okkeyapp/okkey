import test from "node:test";
import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign as nodeSign } from "node:crypto";
import { encodeSplitKeyShareBFrame } from "@okkey/crypto";
import {
  verifyDeviceBindSignature,
  verifyDeviceBindWrapProof,
} from "../src/device/bind-proof.ts";

function b64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

function hybridShare(ed25519PublicKey: Uint8Array): Uint8Array {
  const envelope = new Uint8Array(1148 + 48);
  envelope[0] = 1;
  envelope[1] = 1;
  envelope[2] = 1;
  envelope[3] = 0;
  envelope.fill(3, 4);
  return encodeSplitKeyShareBFrame({
    ed25519PublicKey,
    mlkemEncapsulationKey: new Uint8Array(1184).fill(9),
    envelope,
  });
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

test("verifyDeviceBindWrapProof accepts a wrap-key signature and rejects digests of stored bytes", () => {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const rawPub = publicKey.export({ type: "spki", format: "der" }).subarray(-32);
  const share = hybridShare(rawPub);
  const message = Buffer.from("okkey-device-bind-v1\nchallenge\ndevice\nhash\nnonce", "utf8");
  const signature = nodeSign(null, message, privateKey);

  assert.equal(verifyDeviceBindWrapProof(share, new Uint8Array(message), b64(signature)), true);

  const digest = createHash("sha256")
    .update("okkey-device-bind-share-v1\n")
    .update(share)
    .update(message)
    .digest();
  assert.equal(verifyDeviceBindWrapProof(share, new Uint8Array(message), b64(digest)), false);
  assert.equal(verifyDeviceBindWrapProof(new Uint8Array(32).fill(1), new Uint8Array(message), b64(signature)), false);
});
