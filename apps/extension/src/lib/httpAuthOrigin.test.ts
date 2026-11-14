import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ITEM_PLAINTEXT_SCHEMA_VERSION_V2, type ItemPlaintextV2 } from "@okkey/types";

import { collectHttpAuthCandidates } from "./httpAuthMatch.ts";
import {
  canonicalHttpOrigin,
  formatHttpOriginForDisplay,
  httpOriginsEqual,
  loginItemMatchesHttpAuthOrigin,
} from "./httpAuthOrigin.ts";

function loginItem(
  urls: Array<{ url: string; urlAutofillScope?: "entire-site" | "exact-url" | "none" }>,
  extra?: Partial<ItemPlaintextV2>,
): ItemPlaintextV2 {
  return {
    schemaVersion: ITEM_PLAINTEXT_SCHEMA_VERSION_V2,
    itemId: "item_1",
    vaultId: "vault_1",
    title: "Router",
    categoryId: "login",
    createdAtMs: 1,
    updatedAtMs: 1,
    sections: [],
    fields: [
      {
        id: "login",
        type: "text",
        sectionId: "s",
        order: 0,
        value: { kind: "text", text: "ada" },
      },
      {
        id: "password",
        type: "password",
        sectionId: "s",
        order: 1,
        value: { kind: "password", password: "pw-do-not-log-9f3a" },
      },
      ...urls.map((entry, index) => ({
        id: `website-${index}`,
        type: "url" as const,
        sectionId: "s",
        order: index + 2,
        value: {
          kind: "url" as const,
          url: entry.url,
          ...(entry.urlAutofillScope ? { urlAutofillScope: entry.urlAutofillScope } : {}),
        },
      })),
    ],
    ...extra,
  };
}

describe("canonicalHttpOrigin", () => {
  it("normalizes default ports explicitly", () => {
    assert.equal(canonicalHttpOrigin("http://host"), "http://host:80");
    assert.equal(canonicalHttpOrigin("http://host:80/path"), "http://host:80");
    assert.equal(canonicalHttpOrigin("https://host"), "https://host:443");
    assert.equal(canonicalHttpOrigin("https://host:443/login"), "https://host:443");
    assert.equal(canonicalHttpOrigin("HTTP://Host"), "http://host:80");
  });

  it("keeps non-default ports and rejects scheme or port mismatches", () => {
    assert.equal(canonicalHttpOrigin("https://host:8443/secret"), "https://host:8443");
    assert.equal(httpOriginsEqual("https://host", "https://host:8443"), false);
    assert.equal(httpOriginsEqual("http://host", "https://host"), false);
    assert.equal(httpOriginsEqual("https://host", "https://host:443"), true);
    assert.equal(httpOriginsEqual("http://host", "http://host:80"), true);
    assert.equal(httpOriginsEqual("https://www.host", "https://host"), false);
  });

  it("drops userinfo, path, and non-http schemes", () => {
    assert.equal(canonicalHttpOrigin("https://user:secret@host/a?q=1#h"), "https://host:443");
    assert.equal(canonicalHttpOrigin("https://user:secret@host/a?q=1#h")?.includes("secret"), false);
    assert.equal(canonicalHttpOrigin("example.com"), null);
    assert.equal(canonicalHttpOrigin("ftp://host"), null);
    assert.equal(canonicalHttpOrigin(""), null);
  });

  it("treats IPv6 default ports as equal", () => {
    assert.equal(canonicalHttpOrigin("http://[::1]/admin"), "http://[::1]:80");
    assert.equal(httpOriginsEqual("http://[::1]", "http://[::1]:80"), true);
    assert.equal(httpOriginsEqual("http://[::1]", "http://[::1]:8080"), false);
    assert.equal(formatHttpOriginForDisplay("http://[::1]/admin"), "http://[::1]");
  });

  it("formats default ports without the explicit number", () => {
    assert.equal(formatHttpOriginForDisplay("https://127.0.0.1:443/x"), "https://127.0.0.1");
    assert.equal(formatHttpOriginForDisplay("https://127.0.0.1:8443/x"), "https://127.0.0.1:8443");
    assert.equal(formatHttpOriginForDisplay("http://127.0.0.1:8080/x"), "http://127.0.0.1:8080");
  });
});

describe("login item HTTP auth origin", () => {
  it("matches the same origin and ignores path", () => {
    const item = loginItem([{ url: "https://host/login", urlAutofillScope: "exact-url" }]);
    assert.equal(loginItemMatchesHttpAuthOrigin(item, "https://host/other"), true);
    assert.equal(loginItemMatchesHttpAuthOrigin(item, "https://host:443/other"), true);
  });

  it("does not use whole-site host matching", () => {
    const item = loginItem([{ url: "https://host", urlAutofillScope: "entire-site" }]);
    assert.equal(loginItemMatchesHttpAuthOrigin(item, "https://host:8443/"), false);
    assert.equal(loginItemMatchesHttpAuthOrigin(item, "http://host/"), false);
    assert.equal(loginItemMatchesHttpAuthOrigin(item, "https://www.host/"), false);
    assert.equal(loginItemMatchesHttpAuthOrigin(item, "https://other.example/"), false);
  });

  it("skips scope none, archived, deleted, and non-login items", () => {
    assert.equal(
      loginItemMatchesHttpAuthOrigin(
        loginItem([{ url: "https://host", urlAutofillScope: "none" }]),
        "https://host/",
      ),
      false,
    );
    assert.equal(
      loginItemMatchesHttpAuthOrigin(loginItem([{ url: "https://host" }], { archived: true }), "https://host/"),
      false,
    );
    assert.equal(
      loginItemMatchesHttpAuthOrigin(loginItem([{ url: "https://host" }], { deleted: true }), "https://host/"),
      false,
    );
    assert.equal(
      loginItemMatchesHttpAuthOrigin(
        loginItem([{ url: "https://host" }], { categoryId: "secure_note" }),
        "https://host/",
      ),
      false,
    );
  });

  it("collects a password only for an origin match", () => {
    const password = "pw-do-not-log-9f3a";
    const match = loginItem([{ url: "https://127.0.0.1" }]);
    const otherPort = loginItem([{ url: "https://127.0.0.1:8443" }]);
    const found = collectHttpAuthCandidates([match, otherPort], "https://127.0.0.1/secret");
    assert.equal(found.length, 1);
    assert.equal(found[0]?.password, password);
    assert.equal(found[0]?.itemId, "item_1");
    assert.deepEqual(
      collectHttpAuthCandidates([loginItem([{ url: "http://127.0.0.1:8080" }])], "https://127.0.0.1/"),
      [],
    );
  });
});
