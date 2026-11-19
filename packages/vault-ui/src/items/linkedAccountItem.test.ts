import { describe, expect, it } from "vitest";
import type { ItemPlaintextV2 } from "@okkey/types";
import { ITEM_PLAINTEXT_SCHEMA_VERSION_V2 } from "@okkey/types";

import {
  NO_LINKED_ACCOUNT_VALUE,
  clearLinkedAccountItemId,
  normalizeLinkedAccountItemId,
  resolveLinkedAccountItem,
} from "./linkedAccountItem.js";

function loginItem(overrides: Partial<ItemPlaintextV2> = {}): ItemPlaintextV2 {
  return {
    schemaVersion: ITEM_PLAINTEXT_SCHEMA_VERSION_V2,
    itemId: "login-1",
    vaultId: "vault-1",
    title: "Google",
    categoryId: "login",
    createdAtMs: 1,
    updatedAtMs: 1,
    sections: [],
    fields: [],
    ...overrides,
  };
}

describe("resolveLinkedAccountItem", () => {
  it("returns none when the field is missing or blank", () => {
    expect(resolveLinkedAccountItem(undefined, () => undefined)).toEqual({ status: "none" });
    expect(resolveLinkedAccountItem("  ", () => undefined)).toEqual({ status: "none" });
  });

  it("returns ok for another present login item", () => {
    const target = loginItem({ itemId: "login-2", title: "SSO" });
    const result = resolveLinkedAccountItem("login-2", (id) => (id === "login-2" ? target : undefined));
    expect(result).toEqual({ status: "ok", item: target });
  });

  it("returns lost when the target is missing, deleted, or not a login", () => {
    expect(resolveLinkedAccountItem("gone", () => undefined)).toEqual({
      status: "lost",
      linkedAccountItemId: "gone",
    });
    expect(
      resolveLinkedAccountItem("login-2", () => loginItem({ itemId: "login-2", deleted: true })),
    ).toEqual({ status: "lost", linkedAccountItemId: "login-2" });
    expect(
      resolveLinkedAccountItem("note-1", () =>
        loginItem({ itemId: "note-1", categoryId: "secure_note", title: "Note" }),
      ),
    ).toEqual({ status: "lost", linkedAccountItemId: "note-1" });
  });
});

describe("clearLinkedAccountItemId", () => {
  it("removes the field and bumps updatedAtMs", () => {
    const item = loginItem({ linkedAccountItemId: "login-2", updatedAtMs: 10 });
    const cleared = clearLinkedAccountItemId(item, 99);
    expect(cleared.linkedAccountItemId).toBeUndefined();
    expect(cleared.updatedAtMs).toBe(99);
    expect(item.linkedAccountItemId).toBe("login-2");
  });

  it("is a no-op when the field is already absent", () => {
    const item = loginItem();
    expect(clearLinkedAccountItemId(item, 50)).toBe(item);
  });
});

describe("normalizeLinkedAccountItemId", () => {
  it("maps empty and sentinel values to undefined", () => {
    expect(normalizeLinkedAccountItemId(undefined)).toBeUndefined();
    expect(normalizeLinkedAccountItemId(null)).toBeUndefined();
    expect(normalizeLinkedAccountItemId("")).toBeUndefined();
    expect(normalizeLinkedAccountItemId(NO_LINKED_ACCOUNT_VALUE)).toBeUndefined();
    expect(normalizeLinkedAccountItemId("  ")).toBeUndefined();
  });

  it("trims a real item id", () => {
    expect(normalizeLinkedAccountItemId("  login-2  ")).toBe("login-2");
  });
});
