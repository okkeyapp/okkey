import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ITEM_CATEGORY_LOGIN,
  ITEM_PLAINTEXT_SCHEMA_VERSION_V2,
  type ItemPlaintextV2,
} from "@okkey/types";

import {
  allowPasswordlessLoginSave,
  applyLinkedAccountItemId,
  listLoginLinkTargetItems,
  matchLoginTargetsForProvider,
  preselectLinkedAccountItemId,
  shouldLoadLoginLinkTargets,
} from "./linkedAccountSave.ts";

function loginItem(partial: Partial<ItemPlaintextV2> & { itemId: string }): ItemPlaintextV2 {
  return {
    schemaVersion: ITEM_PLAINTEXT_SCHEMA_VERSION_V2,
    itemId: partial.itemId,
    vaultId: "vault-1",
    title: partial.title ?? partial.itemId,
    categoryId: partial.categoryId ?? ITEM_CATEGORY_LOGIN,
    createdAtMs: 1,
    updatedAtMs: 1,
    sections: [],
    fields: [],
    ...(partial.linkedAccountItemId ? { linkedAccountItemId: partial.linkedAccountItemId } : {}),
    ...(partial.deleted ? { deleted: true } : {}),
    ...(partial.archived ? { archived: true } : {}),
  };
}

describe("applyLinkedAccountItemId", () => {
  it("stores linkedAccountItemId on the encrypted plaintext draft", () => {
    const base = loginItem({ itemId: "login-app", title: "App" });
    const next = applyLinkedAccountItemId(base, "login-google", 99);
    assert.equal(next.linkedAccountItemId, "login-google");
    assert.equal(next.updatedAtMs, 99);
    assert.equal(base.linkedAccountItemId, undefined);
  });

  it("clears linkedAccountItemId when unset", () => {
    const base = loginItem({
      itemId: "login-app",
      linkedAccountItemId: "login-google",
    });
    const next = applyLinkedAccountItemId(base, "", 50);
    assert.equal(next.linkedAccountItemId, undefined);
    assert.equal("linkedAccountItemId" in next, false);
  });
});

describe("allowPasswordlessLoginSave", () => {
  it("allows empty password when OAuth was detected or a link is chosen", () => {
    assert.equal(
      allowPasswordlessLoginSave({ password: "", oauthDetected: true }),
      true,
    );
    assert.equal(
      allowPasswordlessLoginSave({ password: "", linkedAccountItemId: "login-google" }),
      true,
    );
    assert.equal(allowPasswordlessLoginSave({ password: "" }), false);
    assert.equal(allowPasswordlessLoginSave({ password: "x" }), true);
  });
});

describe("listLoginLinkTargetItems", () => {
  it("lists only non-deleted login items and excludes self", () => {
    const items = [
      loginItem({ itemId: "a", title: "Zebra" }),
      loginItem({ itemId: "b", title: "Apple" }),
      loginItem({ itemId: "c", title: "Gone", deleted: true }),
      loginItem({ itemId: "d", title: "Note", categoryId: "secure_note" }),
      loginItem({ itemId: "e", title: "Archived", archived: true }),
    ];
    const listed = listLoginLinkTargetItems(items, { excludeItemId: "a" });
    assert.deepEqual(
      listed.map((item) => item.itemId),
      ["b"],
    );
  });
});

describe("preselectLinkedAccountItemId", () => {
  const google = {
    itemId: "login-google",
    title: "Google",
    websiteUrls: ["https://accounts.google.com"],
    username: "me@gmail.com",
  };
  const apple = {
    itemId: "login-apple",
    title: "Apple",
    websiteUrls: ["https://appleid.apple.com"],
  };
  const googleWork = {
    itemId: "login-google-work",
    title: "Google Work",
    websiteUrls: ["https://accounts.google.com"],
    username: "work@company.com",
  };
  const site = {
    itemId: "login-site",
    title: "Example",
    websiteUrls: ["https://example.com"],
  };

  it("preselects the single provider match", () => {
    assert.equal(
      preselectLinkedAccountItemId({
        providerHint: "Google",
        candidates: [google, apple, site],
      }),
      "login-google",
    );
  });

  it("does not preselect when several provider matches are ambiguous", () => {
    assert.equal(
      preselectLinkedAccountItemId({
        providerHint: "Google",
        candidates: [google, googleWork, site],
      }),
      undefined,
    );
  });

  it("preselects the identified account among several provider matches", () => {
    assert.equal(
      preselectLinkedAccountItemId({
        providerHint: "Google",
        candidates: [google, googleWork, site],
        identifiedAccountHint: "work@company.com",
      }),
      "login-google-work",
    );
  });

  it("keeps No linked account when nothing matches the provider", () => {
    assert.equal(
      preselectLinkedAccountItemId({
        providerHint: "Google",
        candidates: [apple, site],
      }),
      undefined,
    );
  });

  it("keeps an already chosen linked account", () => {
    assert.equal(
      preselectLinkedAccountItemId({
        providerHint: "Google",
        candidates: [google, apple],
        existingLinkedAccountItemId: "login-apple",
      }),
      "login-apple",
    );
  });

  it("matches provider by known IdP host when title differs", () => {
    const matches = matchLoginTargetsForProvider(
      [{ itemId: "g", title: "Personal", websiteUrls: ["https://accounts.google.com/"] }],
      "Google",
    );
    assert.deepEqual(
      matches.map((m) => m.itemId),
      ["g"],
    );
  });
});

describe("shouldLoadLoginLinkTargets", () => {
  it("does not load logins when the vault is locked", () => {
    assert.equal(
      shouldLoadLoginLinkTargets({ locked: true, oauthDetected: true }),
      false,
    );
    assert.equal(
      shouldLoadLoginLinkTargets({
        locked: true,
        linkedAccountItemId: "login-google",
      }),
      false,
    );
  });

  it("loads targets for unlocked OAuth / linked-account saves", () => {
    assert.equal(
      shouldLoadLoginLinkTargets({ locked: false, oauthDetected: true }),
      true,
    );
    assert.equal(
      shouldLoadLoginLinkTargets({
        locked: false,
        linkedAccountItemId: "login-google",
      }),
      true,
    );
    assert.equal(shouldLoadLoginLinkTargets({ locked: false }), false);
  });
});
