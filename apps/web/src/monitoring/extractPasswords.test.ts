import { describe, expect, it } from "vitest";
import type { ItemPlaintextV2 } from "@okkey/types";
import { ITEM_PLAINTEXT_SCHEMA_VERSION_V2 } from "@okkey/types";

import { extractItemPasswordEntries } from "./extractPasswords";

function item(partial: Partial<ItemPlaintextV2> & Pick<ItemPlaintextV2, "itemId" | "fields">): ItemPlaintextV2 {
  return {
    schemaVersion: ITEM_PLAINTEXT_SCHEMA_VERSION_V2,
    vaultId: "vault-1",
    title: partial.title ?? "Item",
    categoryId: "login",
    createdAtMs: 1,
    updatedAtMs: partial.updatedAtMs ?? Date.now(),
    sections: [],
    ...partial,
  };
}

describe("extractItemPasswordEntries", () => {
  it("keeps only the standard login password field", () => {
    const entries = extractItemPasswordEntries([
      item({
        itemId: "login-1",
        fields: [
          {
            id: "password",
            type: "password",
            sectionId: "credentials",
            order: 1,
            value: { kind: "password", password: "LoginPass99!" },
          },
          {
            id: "custom-token",
            type: "password",
            sectionId: "credentials",
            order: 2,
            value: { kind: "password", password: "CustomTokenNotAPassword!" },
          },
        ],
      }),
    ]);
    expect(entries).toEqual([
      expect.objectContaining({ itemId: "login-1", fieldId: "password", password: "LoginPass99!" }),
    ]);
  });

  it("includes preset passwords for database, server, and wifi_router", () => {
    const entries = extractItemPasswordEntries([
      item({
        itemId: "db-1",
        categoryId: "database",
        fields: [
          {
            id: "db-password",
            type: "secret",
            sectionId: "database",
            order: 0,
            value: {
              kind: "unknown",
              declaredType: "secret",
              raw: { secretKind: "password", value: "DbPass99!" },
            },
          },
        ],
      }),
      item({
        itemId: "srv-1",
        categoryId: "server",
        fields: [
          {
            id: "server-password",
            type: "secret",
            sectionId: "server",
            order: 0,
            value: {
              kind: "unknown",
              declaredType: "secret",
              raw: { secretKind: "password", value: "ServerPass99!" },
            },
          },
          {
            id: "admin-console-password",
            type: "secret",
            sectionId: "admin-console",
            order: 0,
            value: {
              kind: "unknown",
              declaredType: "secret",
              raw: { secretKind: "password", value: "ConsolePass99!" },
            },
          },
        ],
      }),
      item({
        itemId: "wifi-1",
        categoryId: "wifi_router",
        fields: [
          {
            id: "wifi-station-password",
            type: "secret",
            sectionId: "wifi-router",
            order: 0,
            value: {
              kind: "unknown",
              declaredType: "secret",
              raw: { secretKind: "password", value: "StationPass99!" },
            },
          },
          {
            id: "wifi-network-password",
            type: "secret",
            sectionId: "wifi-router",
            order: 1,
            value: {
              kind: "unknown",
              declaredType: "secret",
              raw: { secretKind: "password", value: "NetworkPass99!" },
            },
          },
          {
            id: "wifi-connected-storage-password",
            type: "secret",
            sectionId: "wifi-router",
            order: 2,
            value: {
              kind: "unknown",
              declaredType: "secret",
              raw: { secretKind: "password", value: "StoragePass99!" },
            },
          },
        ],
      }),
    ]);

    expect(entries.map((e) => e.fieldId).sort()).toEqual([
      "admin-console-password",
      "db-password",
      "server-password",
      "wifi-connected-storage-password",
      "wifi-network-password",
      "wifi-station-password",
    ]);
  });

  it("skips credit card PIN, API secrets, and non-whitelisted fields", () => {
    const entries = extractItemPasswordEntries([
      item({
        itemId: "card-1",
        categoryId: "credit_card",
        fields: [
          {
            id: "card-pin",
            type: "pin",
            sectionId: "credit-card",
            order: 2,
            value: {
              kind: "unknown",
              declaredType: "secret",
              raw: { secretKind: "password", value: "1234" },
            },
          },
        ],
      }),
      item({
        itemId: "api-1",
        categoryId: "api_access",
        fields: [
          {
            id: "api-credentials",
            type: "secret",
            sectionId: "api-access",
            order: 0,
            value: {
              kind: "unknown",
              declaredType: "secret",
              raw: { secretKind: "single-line", value: "token-value" },
            },
          },
        ],
      }),
    ]);
    expect(entries).toEqual([]);
  });
});
