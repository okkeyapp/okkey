import test from "node:test";
import assert from "node:assert/strict";

import {
  buildEditItemDeepLink,
  buildNewCapsuleDeepLink,
  buildSettingsMainDeepLink,
} from "./deepLinks.ts";

const WEB = "https://app.okkey.test";
const ITEM = "item_abc123";

test("buildEditItemDeepLink matches web editItem|{id} popup", () => {
  assert.equal(
    buildEditItemDeepLink({ webBaseUrl: WEB, itemId: ITEM }),
    `${WEB}/items?item=${ITEM}&popup=editItem|${ITEM}`,
  );
});

test("buildNewCapsuleDeepLink uses item + capsuleFromItem", () => {
  assert.equal(
    buildNewCapsuleDeepLink({ webBaseUrl: WEB, itemId: ITEM }),
    `${WEB}/items?item=${ITEM}&popup=newCapsule&capsuleFromItem=${ITEM}`,
  );
});

test("buildSettingsMainDeepLink opens settings|main", () => {
  assert.equal(buildSettingsMainDeepLink(WEB), `${WEB}/items?popup=settings|main`);
});
