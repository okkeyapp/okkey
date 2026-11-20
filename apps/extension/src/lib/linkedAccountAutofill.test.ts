import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ITEM_CATEGORY_LOGIN,
  ITEM_PLAINTEXT_SCHEMA_VERSION_V2,
  type ItemPlaintextV2,
} from "@okkey/types";

import {
  fillLeaksProviderSecrets,
  linkedAccountSuggestionInfo,
  resolveLinkedLoginFill,
  type LinkedLoginLocalSecrets,
} from "./linkedAccountAutofill.ts";

function loginItem(partial: Partial<ItemPlaintextV2> & { itemId: string }): ItemPlaintextV2 {
  return {
    schemaVersion: ITEM_PLAINTEXT_SCHEMA_VERSION_V2,
    itemId: partial.itemId,
    vaultId: partial.vaultId ?? "vault-1",
    title: partial.title ?? partial.itemId,
    categoryId: partial.categoryId ?? ITEM_CATEGORY_LOGIN,
    createdAtMs: partial.createdAtMs ?? 1,
    updatedAtMs: partial.updatedAtMs ?? 1,
    sections: partial.sections ?? [{ id: "login", title: "Login", order: 0, isPreset: true }],
    fields: partial.fields ?? [],
    ...(partial.linkedAccountItemId ? { linkedAccountItemId: partial.linkedAccountItemId } : {}),
    ...(partial.deleted ? { deleted: true } : {}),
  };
}

const providerSecrets: LinkedLoginLocalSecrets = {
  username: "provider@gmail.com",
  password: "provider-secret-NEVER-FILL",
};

const provider = loginItem({
  itemId: "login-google",
  title: "Google",
});

function extractFromFixture(item: ItemPlaintextV2): LinkedLoginLocalSecrets | null {
  if (item.itemId === provider.itemId) {
    return providerSecrets;
  }
  if (item.itemId === "login-app") {
    return { username: "app-user", password: "" };
  }
  if (item.itemId === "login-plain") {
    return { username: "user@example.com", password: "local-password" };
  }
  if (item.itemId === "login-empty") {
    return { username: "", password: "" };
  }
  return null;
}

describe("linkedAccountSuggestionInfo", () => {
  it("shows Sign in with {title} when the link resolves", () => {
    const site = loginItem({
      itemId: "login-app",
      title: "App",
      linkedAccountItemId: "login-google",
    });
    const info = linkedAccountSuggestionInfo(
      site,
      (id) => (id === provider.itemId ? provider : undefined),
      {
        signInWith: (title) => `Sign in with ${title}`,
        linkLost: "Link lost",
        fallbackSubtitle: "fallback@example.com",
      },
    );
    assert.equal(info.linkStatus, "ok");
    assert.equal(info.subtitle, "Sign in with Google");
  });

  it("shows Link lost when the target is missing", () => {
    const site = loginItem({
      itemId: "login-app",
      linkedAccountItemId: "gone",
    });
    const info = linkedAccountSuggestionInfo(site, () => undefined, {
      signInWith: (title) => `Sign in with ${title}`,
      linkLost: "Link lost",
      fallbackSubtitle: "user@example.com",
    });
    assert.equal(info.linkStatus, "lost");
    assert.equal(info.subtitle, "Link lost");
  });
});

describe("resolveLinkedLoginFill — provider secrets never fill another site", () => {
  it("does not expose provider username/password when the link is ok", () => {
    const site = loginItem({
      itemId: "login-app",
      title: "App",
      linkedAccountItemId: "login-google",
    });
    const lookup = (id: string) =>
      id === provider.itemId ? provider : id === site.itemId ? site : undefined;
    const resolved = resolveLinkedLoginFill(site, lookup, extractFromFixture);
    assert.equal(resolved.linkStatus, "ok");
    assert.equal(resolved.providerSecretsBlocked, true);
    assert.equal(resolved.localSecrets?.username, "app-user");
    assert.equal(resolved.localSecrets?.password, "");

    const fill = {
      username: resolved.localSecrets?.username ?? "",
      password: resolved.localSecrets?.password ?? "",
      values: {
        username: resolved.localSecrets?.username ?? "",
      },
    };
    assert.equal(fillLeaksProviderSecrets(fill, providerSecrets), false);
    assert.equal(fill.password.includes("provider-secret"), false);
    assert.equal(fill.username.includes("provider@gmail.com"), false);
  });

  it("never returns provider secrets for an empty local linked item", () => {
    const site = loginItem({
      itemId: "login-empty",
      linkedAccountItemId: "login-google",
    });
    const resolved = resolveLinkedLoginFill(
      site,
      (id) => (id === provider.itemId ? provider : undefined),
      extractFromFixture,
    );
    assert.equal(resolved.providerSecretsBlocked, true);
    assert.equal(resolved.localSecrets?.password ?? "", "");
    assert.notEqual(resolved.localSecrets?.password, "provider-secret-NEVER-FILL");

    const badFill = {
      username: "provider@gmail.com",
      password: "provider-secret-NEVER-FILL",
      values: {},
    };
    assert.equal(fillLeaksProviderSecrets(badFill, providerSecrets), true);
  });

  it("allows ordinary local secrets when there is no link", () => {
    const site = loginItem({ itemId: "login-plain", title: "Plain" });
    const resolved = resolveLinkedLoginFill(site, () => undefined, extractFromFixture);
    assert.equal(resolved.linkStatus, "none");
    assert.equal(resolved.providerSecretsBlocked, false);
    assert.equal(resolved.localSecrets?.password, "local-password");
  });
});
