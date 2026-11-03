import test from "node:test";
import assert from "node:assert/strict";

import {
  buildEditItemDeepLink,
  buildNewCapsuleDeepLink,
  buildSettingsMainDeepLink,
  buildWorkspaceSettingsDeepLink,
  isUsableTabUrl,
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

test("buildWorkspaceSettingsDeepLink opens /settings/main", () => {
  assert.equal(buildWorkspaceSettingsDeepLink(WEB), `${WEB}/settings/main`);
});

test("isUsableTabUrl accepts http(s) pages and rejects browser/extension URLs", () => {
  assert.equal(isUsableTabUrl("https://example.com/login"), true);
  assert.equal(isUsableTabUrl("http://localhost:8080/"), true);
  assert.equal(isUsableTabUrl("chrome://extensions"), false);
  assert.equal(isUsableTabUrl("chrome-extension://abcdef/popup.html"), false);
  assert.equal(isUsableTabUrl("about:blank"), false);
  assert.equal(isUsableTabUrl("moz-extension://abcdef/popup.html"), false);
  assert.equal(isUsableTabUrl("  "), false);
});
