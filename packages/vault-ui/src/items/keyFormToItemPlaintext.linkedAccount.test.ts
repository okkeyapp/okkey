import { describe, expect, it } from "vitest";
import { normalizeItemPlaintextV2, parseAndNormalizeItemPlaintextUtf8 } from "@okkey/types";

import { keyFormSectionsToItemPlaintext } from "./keyFormToItemPlaintext.js";

const loginSections = [
  {
    id: "credentials",
    variant: "primary" as const,
    fields: [
      {
        id: "login",
        type: "text" as const,
        label: "login",
        value: "user@example.com",
        required: true,
      },
      {
        id: "password",
        type: "password" as const,
        label: "password",
        value: "secret",
        secret: true,
        required: true,
      },
    ],
  },
  {
    id: "websites",
    variant: "primary" as const,
    fields: [
      {
        id: "website-1",
        type: "url" as const,
        label: "website URL",
        value: "https://example.com",
        required: true,
        urlAutofillScope: "entire-site" as const,
      },
    ],
  },
];

describe("keyFormSectionsToItemPlaintext linkedAccountItemId", () => {
  it("encodes linkedAccountItemId into the plaintext payload", () => {
    const item = keyFormSectionsToItemPlaintext({
      sections: loginSections,
      itemId: "item-1",
      vaultId: "vault-1",
      title: "Example",
      categoryId: "login",
      nowMs: 100,
      linkedAccountItemId: "login-sso",
    });

    expect(item.linkedAccountItemId).toBe("login-sso");

    const bytes = new TextEncoder().encode(JSON.stringify(item));
    const back = parseAndNormalizeItemPlaintextUtf8(bytes);
    expect(back?.linkedAccountItemId).toBe("login-sso");
  });

  it("omits linkedAccountItemId when unset so older clients stay compatible", () => {
    const item = keyFormSectionsToItemPlaintext({
      sections: loginSections,
      itemId: "item-1",
      vaultId: "vault-1",
      title: "Example",
      categoryId: "login",
      nowMs: 100,
    });

    expect(item.linkedAccountItemId).toBeUndefined();
    expect("linkedAccountItemId" in item).toBe(false);

    const legacy = normalizeItemPlaintextV2({
      schemaVersion: 2,
      itemId: "item-1",
      vaultId: "vault-1",
      title: "Legacy",
      categoryId: "login",
      createdAtMs: 1,
      updatedAtMs: 1,
      sections: [{ id: "credentials", title: "General", order: 0 }],
      fields: [
        {
          id: "login",
          type: "text",
          sectionId: "credentials",
          order: 0,
          value: { kind: "text", text: "a" },
        },
      ],
    });
    expect(legacy?.linkedAccountItemId).toBeUndefined();
  });

  it("ignores blank linkedAccountItemId on encode", () => {
    const item = keyFormSectionsToItemPlaintext({
      sections: loginSections,
      itemId: "item-1",
      vaultId: "vault-1",
      title: "Example",
      categoryId: "login",
      nowMs: 100,
      linkedAccountItemId: "   ",
    });
    expect(item.linkedAccountItemId).toBeUndefined();
  });
});
