import assert from "node:assert/strict";
import test from "node:test";

import { ItemPurgeService } from "../src/item-purge/service.ts";

test("purgeItem deletes history, soft-delete row, and attachments", async () => {
  const deleted: string[] = [];
  const removed: string[] = [];
  const purgedAttachments: string[] = [];

  const service = new ItemPurgeService({
    events: {
      deleteByVaultAndReferencedItemId: async (vaultId, itemId) => {
        deleted.push(`${vaultId}:${itemId}`);
        return 3;
      },
      deleteByVaultAndReferencedItemIdExcept: async () => 0,
    },
    softDeletes: {
      upsert: async () => {},
      remove: async (vaultId, itemId) => {
        removed.push(`${vaultId}:${itemId}`);
      },
      exists: async () => true,
      listExpired: async () => [],
    } as never,
    attachments: {
      purgeForItem: async (vaultId, itemId) => {
        purgedAttachments.push(`${vaultId}:${itemId}`);
      },
    },
  });

  await service.purgeItem("1000000000000000001", "1000000000000000002");
  assert.deepEqual(deleted, ["1000000000000000001:1000000000000000002"]);
  assert.deepEqual(removed, ["1000000000000000001:1000000000000000002"]);
  assert.deepEqual(purgedAttachments, ["1000000000000000001:1000000000000000002"]);
});

test("purgeItem keepEventId uses except-delete", async () => {
  let kept = "";
  const service = new ItemPurgeService({
    events: {
      deleteByVaultAndReferencedItemId: async () => {
        throw new Error("should use except path");
      },
      deleteByVaultAndReferencedItemIdExcept: async (_vaultId, _itemId, keepEventId) => {
        kept = keepEventId;
        return 2;
      },
    },
    softDeletes: {
      upsert: async () => {},
      remove: async () => {},
      exists: async () => true,
      listExpired: async () => [],
    } as never,
  });

  await service.purgeItem("1000000000000000001", "1000000000000000002", {
    keepEventId: "e-purge",
  });
  assert.equal(kept, "e-purge");
});
