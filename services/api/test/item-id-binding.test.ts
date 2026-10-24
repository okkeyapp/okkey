import assert from "node:assert/strict";
import { test } from "node:test";

import { itemPlaintextMatchesReferencedId } from "../../../packages/sync/src/item-id-binding.ts";

test("itemPlaintextMatchesReferencedId allows legacy events without referenced id", () => {
  assert.equal(
    itemPlaintextMatchesReferencedId({ itemId: "item-1" }, {}),
    true,
  );
  assert.equal(
    itemPlaintextMatchesReferencedId({ itemId: "item-1" }, { referencedItemId: null }),
    true,
  );
});

test("itemPlaintextMatchesReferencedId requires equality when referenced id is set", () => {
  assert.equal(
    itemPlaintextMatchesReferencedId(
      { itemId: "item-1" },
      { referencedItemId: "item-1" },
    ),
    true,
  );
  assert.equal(
    itemPlaintextMatchesReferencedId(
      { itemId: "victim-item" },
      { referencedItemId: "attacker-new-id" },
    ),
    false,
  );
});
