import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ITEM_PLAINTEXT_SCHEMA_VERSION_V2, type ItemPlaintextV2 } from "@okkey/types";

import {
  categoriesForFieldKinds,
  extractAutofillValues,
  suggestionSubtitleFromValues,
} from "./item-autofill-extract.ts";

function item(partial: Partial<ItemPlaintextV2> & Pick<ItemPlaintextV2, "categoryId" | "fields">): ItemPlaintextV2 {
  return {
    schemaVersion: ITEM_PLAINTEXT_SCHEMA_VERSION_V2,
    itemId: "item_1",
    vaultId: "vault_1",
    title: "Test",
    createdAtMs: 1,
    updatedAtMs: 1,
    sections: [],
    ...partial,
  };
}

describe("categoriesForFieldKinds", () => {
  it("maps page kinds to vault categories", () => {
    assert.deepEqual(categoriesForFieldKinds(["cc-number"]), ["credit_card"]);
    assert.ok(categoriesForFieldKinds(["email"]).includes("login"));
    assert.ok(categoriesForFieldKinds(["email"]).includes("personal_data"));
    assert.ok(categoriesForFieldKinds(["street-address"]).includes("personal_data"));
    assert.deepEqual(categoriesForFieldKinds(["iban"]), ["bank_account"]);
    assert.ok(categoriesForFieldKinds(["passport-number"]).includes("passport"));
    assert.deepEqual(categoriesForFieldKinds(["db-server"]), ["database"]);
    assert.deepEqual(categoriesForFieldKinds(["crypto-address"]), ["crypto_wallet"]);
  });
});

describe("extractAutofillValues", () => {
  it("extracts personal data + address JSON", () => {
    const values = extractAutofillValues(
      item({
        categoryId: "personal_data",
        fields: [
          {
            id: "first-name",
            type: "text",
            sectionId: "personal-data",
            order: 0,
            value: { kind: "text", text: "Саша" },
          },
          {
            id: "last-name",
            type: "text",
            sectionId: "personal-data",
            order: 1,
            value: { kind: "text", text: "Иванов" },
          },
          {
            id: "email",
            type: "email",
            sectionId: "personal-data",
            order: 2,
            value: { kind: "text", text: "a@example.com" },
          },
          {
            id: "address",
            type: "address",
            sectionId: "personal-data",
            order: 3,
            value: {
              kind: "unknown",
              declaredType: "address",
              raw: JSON.stringify({
                street: "Tverskaya 1",
                city: "Moscow",
                state: "",
                postalCode: "101000",
                country: "RU",
              }),
            },
          },
        ],
      }),
    );
    assert.equal(values["given-name"], "Саша");
    assert.equal(values["family-name"], "Иванов");
    assert.equal(values.email, "a@example.com");
    assert.equal(values["street-address"], "Tverskaya 1");
    assert.equal(values["address-level2"], "Moscow");
    assert.equal(values["postal-code"], "101000");
    assert.equal(values.country, "RU");
    assert.equal(values.name, "Саша Иванов");
  });

  it("extracts credit card and bank fields", () => {
    const card = extractAutofillValues(
      item({
        categoryId: "credit_card",
        fields: [
          {
            id: "card-number",
            type: "card",
            sectionId: "credit-card",
            order: 0,
            value: { kind: "text", text: "4111111111111111" },
          },
          {
            id: "card-expiry",
            type: "card-expiry",
            sectionId: "credit-card",
            order: 1,
            value: { kind: "text", text: "12/30" },
          },
          {
            id: "card-pin",
            type: "pin",
            sectionId: "credit-card",
            order: 2,
            value: {
              kind: "unknown",
              declaredType: "secret",
              raw: { secretKind: "password", value: "123" },
            },
          },
        ],
      }),
    );
    assert.equal(card["cc-number"], "4111111111111111");
    assert.equal(card["cc-exp"], "12/30");
    assert.equal(card["cc-csc"], "123");
    assert.equal(suggestionSubtitleFromValues("credit_card", card), "•••• 1111");

    const bank = extractAutofillValues(
      item({
        categoryId: "bank_account",
        fields: [
          {
            id: "bank-iban",
            type: "text",
            sectionId: "bank-account",
            order: 0,
            value: { kind: "text", text: "DE89370400440532013000" },
          },
        ],
      }),
    );
    assert.equal(bank.iban, "DE89370400440532013000");
  });
});
