/**
 * completePendingVaultWraps finishes staged key wraps only.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { describe, it } from "vitest";
import {
  canCompletePendingVaultWraps,
  tryCompletePendingVaultWraps,
  type PendingVaultWrapRuntime,
} from "./completePendingVaultWraps";

const PLAIN_VAULT_KEY = Uint8Array.from({ length: 32 }, (_, index) => index + 1);
const ACCOUNT_KEY = Uint8Array.from({ length: 32 }, () => 7);
const VALID_PK = Buffer.alloc(32, 1).toString("base64");
const VALID_PQ = Buffer.alloc(1184, 2).toString("base64");
const INVALID_PK = Buffer.alloc(16, 3).toString("base64");

function runtime(wrapImpl?: PendingVaultWrapRuntime["wrapVaultKeyForRecipient"]): PendingVaultWrapRuntime {
  return {
    readVaultBundle: () => ({ encrypted_private_key: { payload: "bundle" } }),
    decryptUserIdentityFromEncryptedBlob: async () => ({
      ed25519SecretKey: Uint8Array.from([1]),
      mlkem768DecapsulationKey: Uint8Array.from([2]),
    }),
    unwrapVaultKeyForSelf: async () => PLAIN_VAULT_KEY,
    wrapVaultKeyForRecipient: wrapImpl ?? (async () => ({ payload: "wrapped-for-recipient" })),
    base64ToBytes: (value) => Uint8Array.from(Buffer.from(value, "base64")),
  };
}

function core(
  wraps: Array<Record<string, unknown>>,
  skippedInvalidKeyRecipients: Array<Record<string, unknown>> = [],
) {
  const updates: unknown[] = [];
  const vaultKeyReads: string[] = [];
  return {
    updates,
    vaultKeyReads,
    client: {
      listPendingVaultWraps: async () => ({ wraps, skippedInvalidKeyRecipients }),
      getVaultKey: async (vaultId: string) => {
        vaultKeyReads.push(vaultId);
        return { encryptedVaultKey: { payload: "self-wrap" } };
      },
      updateMemberVaultAccess: async (_workspaceId: string, userId: string, body: unknown) => {
        updates.push({ userId, body });
      },
    },
  };
}

it("completes only staged wraps and never sends the plaintext vault key", async () => {
  const api = core([
    {
      userId: "u2",
      vaultId: "v1",
      profileId: "p1",
      publicKey: VALID_PK,
      publicPqKey: VALID_PQ,
    },
    {
      userId: "u3",
      vaultId: "v1",
      profileId: "p1",
      publicKey: VALID_PK,
      publicPqKey: null,
    },
  ]);
  const result = await tryCompletePendingVaultWraps(
    {
      core: api.client as never,
      workspaceId: "w1",
      userId: "u1",
      accountVaultKey: ACCOUNT_KEY,
    },
    runtime(),
  );
  assert.deepEqual(api.vaultKeyReads, ["v1"]);
  assert.equal(api.updates.length, 1);
  assert.equal(result.skippedInvalidKeys, 1);
  const sent = JSON.stringify(api.updates[0]);
  assert.match(sent, /wrapped-for-recipient/);
  assert.doesNotMatch(sent, /"0":1/);
  assert.equal(sent.includes(Buffer.from(PLAIN_VAULT_KEY).toString("base64")), false);
});

it("a second call is a no-op once no staged wraps remain", async () => {
  const api = core([]);
  const deps = runtime();
  await tryCompletePendingVaultWraps(
    { core: api.client as never, workspaceId: "w1", userId: "u1", accountVaultKey: ACCOUNT_KEY },
    deps,
  );
  await tryCompletePendingVaultWraps(
    { core: api.client as never, workspaceId: "w1", userId: "u1", accountVaultKey: ACCOUNT_KEY },
    deps,
  );
  assert.equal(api.updates.length, 0);
  assert.equal(api.vaultKeyReads.length, 0);
});

it("403 and 404 from the pending list are ignored; other errors propagate", async () => {
  const forbidden = {
    listPendingVaultWraps: async () => {
      const error = new Error("nope");
      error.name = "ApiRequestError";
      (error as { status?: number }).status = 404;
      throw error;
    },
  };
  await tryCompletePendingVaultWraps(
    { core: forbidden as never, workspaceId: "w1", userId: "u1", accountVaultKey: ACCOUNT_KEY },
    runtime(),
  );

  const broken = {
    listPendingVaultWraps: async () => {
      throw new Error("network");
    },
  };
  await assert.rejects(() =>
    tryCompletePendingVaultWraps(
      { core: broken as never, workspaceId: "w1", userId: "u1", accountVaultKey: ACCOUNT_KEY },
      runtime(),
    ),
  );
});

it("one wrap failure does not drop the other staged wraps", async () => {
  let calls = 0;
  const api = core([
    { userId: "u2", vaultId: "v1", profileId: "p1", publicKey: VALID_PK, publicPqKey: VALID_PQ },
    { userId: "u3", vaultId: "v1", profileId: "p1", publicKey: VALID_PK, publicPqKey: VALID_PQ },
    { userId: "u4", vaultId: "v2", profileId: "p2", publicKey: VALID_PK, publicPqKey: VALID_PQ },
  ]);
  await tryCompletePendingVaultWraps(
    { core: api.client as never, workspaceId: "w1", userId: "u1", accountVaultKey: ACCOUNT_KEY },
    runtime(async (input) => {
      calls += 1;
      if (input.recipientUserId === "u2") {
        throw new Error("wrap failed");
      }
      return { payload: `wrapped-${input.recipientUserId}` };
    }),
  );
  const users = api.updates.map((row) => (row as { userId: string }).userId).sort();
  assert.deepEqual(users, ["u3", "u4"]);
  assert.ok(calls >= 3);
});

it("invalid recipient public key is skipped and counted", async () => {
  const api = core([
    {
      userId: "u2",
      vaultId: "v1",
      profileId: "p1",
      publicKey: INVALID_PK,
      publicPqKey: VALID_PQ,
    },
    {
      userId: "u3",
      vaultId: "v1",
      profileId: "p1",
      publicKey: VALID_PK,
      publicPqKey: VALID_PQ,
    },
  ]);
  const result = await tryCompletePendingVaultWraps(
    { core: api.client as never, workspaceId: "w1", userId: "u1", accountVaultKey: ACCOUNT_KEY },
    runtime(),
  );
  assert.equal(result.skippedInvalidKeys, 1);
  assert.equal(api.updates.length, 1);
  assert.equal((api.updates[0] as { userId: string }).userId, "u3");
});

it("server-reported invalid-key recipients count even when wraps is empty", async () => {
  const api = core(
    [],
    [{ userId: "u3", vaultId: "v1", profileId: "p1" }],
  );
  const result = await tryCompletePendingVaultWraps(
    { core: api.client as never, workspaceId: "w1", userId: "u1", accountVaultKey: ACCOUNT_KEY },
    runtime(),
  );
  assert.equal(result.skippedInvalidKeys, 1);
  assert.equal(api.updates.length, 0);
  assert.equal(api.vaultKeyReads.length, 0);
});

it("server-reported skips add to client-side invalid-key skips", async () => {
  const api = core(
    [
      {
        userId: "u2",
        vaultId: "v1",
        profileId: "p1",
        publicKey: INVALID_PK,
        publicPqKey: VALID_PQ,
      },
    ],
    [{ userId: "u3", vaultId: "v1", profileId: "p1" }],
  );
  const result = await tryCompletePendingVaultWraps(
    { core: api.client as never, workspaceId: "w1", userId: "u1", accountVaultKey: ACCOUNT_KEY },
    runtime(),
  );
  assert.equal(result.skippedInvalidKeys, 2);
  assert.equal(api.updates.length, 0);
});

it("canCompletePendingVaultWraps requires members.get", () => {
  assert.equal(canCompletePendingVaultWraps(null), false);
  assert.equal(
    canCompletePendingVaultWraps({
      settings: { get: 0, post: 0, put: 0, delete: 0 },
      settings_items: { get: 0, post: 0, put: 0, delete: 0 },
      settings_capsules: { get: 0, post: 0, put: 0, delete: 0 },
      roles: { get: 0, post: 0, put: 0, delete: 0 },
      profiles: { get: 0, post: 0, put: 0, delete: 0 },
      members: { get: 0, post: 0, put: 0, delete: 0 },
      vaults: { get: 0, post: 0, put: 0, delete: 0 },
      billing: { get: 0, post: 0, put: 0, delete: 0 },
    }),
    false,
  );
  assert.equal(
    canCompletePendingVaultWraps({
      settings: { get: 0, post: 0, put: 0, delete: 0 },
      settings_items: { get: 0, post: 0, put: 0, delete: 0 },
      settings_capsules: { get: 0, post: 0, put: 0, delete: 0 },
      roles: { get: 0, post: 0, put: 0, delete: 0 },
      profiles: { get: 0, post: 0, put: 0, delete: 0 },
      members: { get: 1, post: 0, put: 0, delete: 0 },
      vaults: { get: 0, post: 0, put: 0, delete: 0 },
      billing: { get: 0, post: 0, put: 0, delete: 0 },
    }),
    true,
  );
});
