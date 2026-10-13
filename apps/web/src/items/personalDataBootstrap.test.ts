import { beforeEach, describe, expect, it, vi } from "vitest";
import { englishKeyFormEditorMessages, PERSONAL_DATA_SECTION_ID } from "@okkey/vault-ui";
import type { ItemPlaintextV2 } from "@okkey/types";

import {
  buildPersonalDataBootstrapItem,
  hasPersonalDataItem,
  hasSoftDeletedPersonalDataItem,
  shouldSkipPersonalDataBootstrap,
} from "./personalDataBootstrap";
import {
  isPersonalDataBootstrapDismissed,
  markPersonalDataBootstrapDismissed,
  personalDataBootstrapDismissedStorageKey,
} from "./personalDataBootstrapDismissal";

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear() {
      map.clear();
    },
    getItem(key: string) {
      return map.has(key) ? map.get(key)! : null;
    },
    key(index: number) {
      return [...map.keys()][index] ?? null;
    },
    removeItem(key: string) {
      map.delete(key);
    },
    setItem(key: string, value: string) {
      map.set(key, value);
    },
  };
}

function textField(item: ItemPlaintextV2, fieldId: string): string {
  const field = item.fields.find((candidate) => candidate.id === fieldId);
  if (!field || field.value.kind !== "text") {
    return "";
  }
  return field.value.text;
}

const loginItem: ItemPlaintextV2 = {
  schemaVersion: 2,
  itemId: "login-1",
  vaultId: "vault-1",
  title: "Login",
  categoryId: "login",
  createdAtMs: 1,
  updatedAtMs: 1,
  sections: [],
  fields: [],
};

const activePersonalData: ItemPlaintextV2 = {
  schemaVersion: 2,
  itemId: "pd-1",
  vaultId: "vault-1",
  title: "Personal data",
  categoryId: "personal_data",
  createdAtMs: 1,
  updatedAtMs: 1,
  sections: [],
  fields: [],
};

const softDeletedPersonalData: ItemPlaintextV2 = {
  ...activePersonalData,
  deleted: true,
  deletedAtMs: 1,
};

describe("hasPersonalDataItem", () => {
  it("returns false when there is no personal_data item", () => {
    expect(hasPersonalDataItem([loginItem])).toBe(false);
  });

  it("treats soft-deleted personal_data as present (deliberate delete)", () => {
    expect(hasPersonalDataItem([softDeletedPersonalData])).toBe(true);
  });

  it("returns true when an active personal_data item exists", () => {
    expect(hasPersonalDataItem([activePersonalData])).toBe(true);
  });
});

describe("hasSoftDeletedPersonalDataItem", () => {
  it("returns true only for soft-deleted personal_data", () => {
    expect(hasSoftDeletedPersonalDataItem([softDeletedPersonalData])).toBe(true);
    expect(hasSoftDeletedPersonalDataItem([activePersonalData])).toBe(false);
    expect(hasSoftDeletedPersonalDataItem([loginItem])).toBe(false);
  });
});

describe("shouldSkipPersonalDataBootstrap", () => {
  it("skips when an active personal_data item exists", () => {
    expect(shouldSkipPersonalDataBootstrap([activePersonalData], false)).toBe(true);
  });

  it("skips when a soft-deleted personal_data item is still retained", () => {
    expect(shouldSkipPersonalDataBootstrap([softDeletedPersonalData], false)).toBe(true);
  });

  it("skips after purge when dismissed marker remains (post-purge case)", () => {
    // Retention filter removed the soft-deleted row; only the durable marker remains.
    expect(shouldSkipPersonalDataBootstrap([loginItem], true)).toBe(true);
    expect(shouldSkipPersonalDataBootstrap([], true)).toBe(true);
  });

  it("does not skip for a fresh workspace without marker", () => {
    expect(shouldSkipPersonalDataBootstrap([loginItem], false)).toBe(false);
    expect(shouldSkipPersonalDataBootstrap([], false)).toBe(false);
  });
});

describe("personalDataBootstrapDismissal storage", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", memoryStorage());
  });

  it("persists dismissed marker per user and workspace", () => {
    expect(isPersonalDataBootstrapDismissed("user-1", "ws-1")).toBe(false);
    markPersonalDataBootstrapDismissed("user-1", "ws-1");
    expect(isPersonalDataBootstrapDismissed("user-1", "ws-1")).toBe(true);
    expect(isPersonalDataBootstrapDismissed("user-1", "ws-2")).toBe(false);
    expect(isPersonalDataBootstrapDismissed("user-2", "ws-1")).toBe(false);
    expect(localStorage.getItem(personalDataBootstrapDismissedStorageKey("user-1", "ws-1"))).toBe(
      "1",
    );
  });
});

describe("buildPersonalDataBootstrapItem", () => {
  it("prefills first name, last name, and email in the personal-data section", () => {
    const item = buildPersonalDataBootstrapItem({
      itemId: "item-pd",
      vaultId: "vault-personal",
      title: "Personal data",
      messages: englishKeyFormEditorMessages,
      firstName: " Саша ",
      lastName: "Иванов",
      email: "sasha@example.com",
      nowMs: 42,
    });

    expect(item.categoryId).toBe("personal_data");
    expect(item.vaultId).toBe("vault-personal");
    expect(item.title).toBe("Personal data");
    expect(item.createdAtMs).toBe(42);
    expect(item.sections.some((section) => section.id === PERSONAL_DATA_SECTION_ID)).toBe(true);
    expect(textField(item, "first-name")).toBe("Саша");
    expect(textField(item, "last-name")).toBe("Иванов");
    expect(textField(item, "email")).toBe("sasha@example.com");
  });
});
