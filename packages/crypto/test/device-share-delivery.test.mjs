import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  generateOneTimeDeliveryKeyPair,
  initCrypto,
  openDeviceShareDelivery,
  sealDeviceShareForOneTimeKey,
  wipeOneTimeDeliveryPrivateKeys,
} from "../dist/index.js";

const wasmBytes = await readFile(
  new URL("../dist/okkey_crypto_engine_bg.wasm", import.meta.url),
);
await initCrypto({ module_or_path: wasmBytes });

test("one-time device share delivery round-trips and the private key is not reusable", async () => {
  const pair = await generateOneTimeDeliveryKeyPair();
  const share = new Uint8Array(32).fill(0x42);
  const deviceId = "1000000000000000001";
  const envelope = await sealDeviceShareForOneTimeKey({
    deviceShare: share,
    recipientX25519PublicKey: pair.x25519PublicKey,
    recipientMlkemPublicKey: pair.mlkemPublicKey,
    deviceId,
  });
  assert.equal(share.every((byte) => byte === 0x42), true);

  const opened = await openDeviceShareDelivery({
    envelope,
    x25519PrivateKey: pair.x25519PrivateKey,
    mlkemPrivateKey: pair.mlkemPrivateKey,
    deviceId,
  });
  assert.deepEqual(opened, share);

  wipeOneTimeDeliveryPrivateKeys(pair);
  assert.equal(pair.x25519PrivateKey.every((byte) => byte === 0), true);
  assert.equal(pair.mlkemPrivateKey.every((byte) => byte === 0), true);

  await assert.rejects(() =>
    openDeviceShareDelivery({
      envelope,
      x25519PrivateKey: pair.x25519PrivateKey,
      mlkemPrivateKey: pair.mlkemPrivateKey,
      deviceId,
    }),
  );
});

test("tampered device share envelope is rejected and the one-time key is left intact", async () => {
  const pair = await generateOneTimeDeliveryKeyPair();
  const share = new Uint8Array(32).fill(0x7);
  const envelope = await sealDeviceShareForOneTimeKey({
    deviceShare: share,
    recipientX25519PublicKey: pair.x25519PublicKey,
    recipientMlkemPublicKey: pair.mlkemPublicKey,
    deviceId: "device-a",
  });
  envelope[envelope.length - 1] ^= 0x01;
  const privateCopy = pair.x25519PrivateKey.slice();

  await assert.rejects(() =>
    openDeviceShareDelivery({
      envelope,
      x25519PrivateKey: pair.x25519PrivateKey,
      mlkemPrivateKey: pair.mlkemPrivateKey,
      deviceId: "device-a",
    }),
  );
  assert.deepEqual(pair.x25519PrivateKey, privateCopy);
  wipeOneTimeDeliveryPrivateKeys(pair);
});
