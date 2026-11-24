import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { initSync } from "@okkey/crypto-wasm";

const cryptoDist = join(dirname(fileURLToPath(import.meta.url)), "../../../packages/crypto/dist");

test("workspace key wrap, rotation, and lazy re-encrypt", async () => {
  initSync(readFileSync(join(cryptoDist, "okkey_crypto_engine_bg.wasm")));
  const wasm = await import("@okkey/crypto-wasm");
  const {
    decryptWorkspaceScopedBytes,
    encryptWorkspaceScopedBytes,
    generateWorkspaceKey,
    reencryptWorkspaceScopedBytes,
    unwrapWorkspaceKeyForSelf,
    wrapWorkspaceKeyForMember,
  } = await import("../../../packages/crypto/dist/workspace-key.js");

  function identity() {
    const ed = wasm.ed25519_keypair();
    const mlkem = wasm.mlkem768_keypair();
    const decapLen = wasm.mlkem768_decapsulation_key_len();
    return {
      ed25519Seed: ed.slice(0, 32),
      ed25519Public: ed.slice(32, 64),
      mlkemSecret: mlkem.slice(0, decapLen),
      mlkemPublic: mlkem.slice(decapLen),
    };
  }

  const owner = identity();
  const member = identity();
  const removed = identity();
  const keyV1 = await generateWorkspaceKey();

  const ownerWrap = await wrapWorkspaceKeyForMember({
    workspaceKey: keyV1,
    keyVersion: 1,
    recipientUserId: "owner",
    recipientPublicKey: owner.ed25519Public,
    recipientPqPublicKey: owner.mlkemPublic,
  });
  const memberWrap = await wrapWorkspaceKeyForMember({
    workspaceKey: keyV1,
    keyVersion: 1,
    recipientUserId: "member",
    recipientPublicKey: member.ed25519Public,
    recipientPqPublicKey: member.mlkemPublic,
  });
  const removedWrap = await wrapWorkspaceKeyForMember({
    workspaceKey: keyV1,
    keyVersion: 1,
    recipientUserId: "removed",
    recipientPublicKey: removed.ed25519Public,
    recipientPqPublicKey: removed.mlkemPublic,
  });

  const ownerKey = await unwrapWorkspaceKeyForSelf({
    encryptedWorkspaceKey: ownerWrap,
    recipientPrivateKey: owner.ed25519Seed,
    recipientPqPrivateKey: owner.mlkemSecret,
  });
  const memberKey = await unwrapWorkspaceKeyForSelf({
    encryptedWorkspaceKey: memberWrap,
    recipientPrivateKey: member.ed25519Seed,
    recipientPqPrivateKey: member.mlkemSecret,
  });
  assert.deepEqual(ownerKey, keyV1);
  assert.deepEqual(memberKey, keyV1);
  await assert.rejects(() =>
    unwrapWorkspaceKeyForSelf({
      encryptedWorkspaceKey: ownerWrap,
      recipientPrivateKey: removed.ed25519Seed,
      recipientPqPrivateKey: removed.mlkemSecret,
    }),
  );

  const plaintext = new TextEncoder().encode("workspace-logo");
  const v1Ciphertext = await encryptWorkspaceScopedBytes({
    key: keyV1,
    keyVersion: 1,
    domain: "logo",
    plaintext,
  });
  assert.equal(new DataView(v1Ciphertext.buffer).getUint32(0, false), 1);
  const openedV1 = await decryptWorkspaceScopedBytes({
    key: memberKey,
    domain: "logo",
    ciphertext: v1Ciphertext,
  });
  assert.deepEqual(openedV1.plaintext, plaintext);

  const keyV2 = await generateWorkspaceKey();
  const ownerWrapV2 = await wrapWorkspaceKeyForMember({
    workspaceKey: keyV2,
    keyVersion: 2,
    recipientUserId: "owner",
    recipientPublicKey: owner.ed25519Public,
    recipientPqPublicKey: owner.mlkemPublic,
  });
  await assert.rejects(() =>
    unwrapWorkspaceKeyForSelf({
      encryptedWorkspaceKey: ownerWrapV2,
      recipientPrivateKey: removed.ed25519Seed,
      recipientPqPrivateKey: removed.mlkemSecret,
    }),
  );
  const removedStillHasV1 = await unwrapWorkspaceKeyForSelf({
    encryptedWorkspaceKey: removedWrap,
    recipientPrivateKey: removed.ed25519Seed,
    recipientPqPrivateKey: removed.mlkemSecret,
  });
  assert.deepEqual(removedStillHasV1, keyV1);

  const v2Ciphertext = await reencryptWorkspaceScopedBytes({
    domain: "logo",
    ciphertext: v1Ciphertext,
    keysByVersion: new Map([[1, keyV1]]),
    currentVersion: 2,
    currentKey: keyV2,
  });
  assert.equal(new DataView(v2Ciphertext.buffer).getUint32(0, false), 2);
  const openedV2 = await decryptWorkspaceScopedBytes({
    key: keyV2,
    domain: "logo",
    ciphertext: v2Ciphertext,
  });
  assert.deepEqual(openedV2.plaintext, plaintext);
  await assert.rejects(() =>
    decryptWorkspaceScopedBytes({
      key: keyV1,
      domain: "logo",
      ciphertext: v2Ciphertext,
    }),
  );
  await assert.rejects(() =>
    decryptWorkspaceScopedBytes({
      key: removedStillHasV1,
      domain: "client-settings",
      ciphertext: v2Ciphertext,
    }),
  );
});
