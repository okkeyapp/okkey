import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AccountUserBar } from "../../../../packages/ui/dist/components/account/account-user-bar.js";

import { accountIdentityForBar, accountIdentityFromSession } from "./accountIdentity.ts";
import { readSession, writeSession, type ExtensionSession } from "./storage.ts";

type StorageAreaMock = {
  get: (keys?: unknown) => Promise<Record<string, unknown>>;
  set: (items: Record<string, unknown>) => Promise<void>;
  remove: (keys: string | string[]) => Promise<void>;
};

function installLocalStorage(store: Record<string, unknown>): () => void {
  const g = globalThis as {
    browser?: { storage?: { local?: StorageAreaMock } };
    chrome?: { storage?: { local?: StorageAreaMock } };
  };
  const prevBrowser = g.browser;
  const prevChrome = g.chrome;
  const local: StorageAreaMock = {
    async get(keys) {
      if (typeof keys === "string") {
        return keys in store ? { [keys]: store[keys] } : {};
      }
      return { ...store };
    },
    async set(items) {
      Object.assign(store, items);
    },
    async remove(keys) {
      const list = Array.isArray(keys) ? keys : [keys];
      for (const key of list) {
        delete store[key];
      }
    },
  };
  g.chrome = { storage: { local } };
  g.browser = { storage: { local } };
  return () => {
    g.browser = prevBrowser;
    g.chrome = prevChrome;
  };
}

function renderCard(session: ExtensionSession): string {
  const fields = accountIdentityForBar(accountIdentityFromSession(session));
  return renderToStaticMarkup(
    createElement(AccountUserBar, {
      email: fields.email,
      firstName: fields.firstName,
      lastName: fields.lastName,
      signOutLabel: "Sign out",
      onSignOut: () => {},
    }),
  );
}

test("pending device card renders the token email when the account has no name", () => {
  const html = renderCard({
    access_token: "ext-fresh",
    user_id: "u-email",
    expires_at: "2099-01-01T00:00:00.000Z",
    email: "no-name@example.com",
    firstName: "",
    lastName: "",
  });
  assert.match(html, /no-name@example.com/);
  assert.equal(html.includes("—"), false);
  assert.match(html, /Sign out/);
});

test("pending device card renders the token name and email", () => {
  const html = renderCard({
    access_token: "ext-fresh",
    user_id: "u-named",
    expires_at: "2099-01-01T00:00:00.000Z",
    email: "ada@example.com",
    firstName: "Ada",
    lastName: "Lovelace",
  });
  assert.match(html, /Ada Lovelace/);
  assert.match(html, /ada@example.com/);
});

test("token identity still renders after the popup storage is read again", async () => {
  const store: Record<string, unknown> = {};
  const restore = installLocalStorage(store);
  try {
    const issued: ExtensionSession = {
      access_token: "ext-fresh",
      user_id: "u-email",
      expires_at: "2099-01-01T00:00:00.000Z",
      email: "no-name@example.com",
      firstName: "",
      lastName: "",
    };
    await writeSession(issued);
    const reloaded = await readSession();
    assert.ok(reloaded);
    const html = renderCard(reloaded);
    assert.match(html, /no-name@example.com/);
    assert.equal(html.includes("—"), false);
  } finally {
    restore();
  }
});
