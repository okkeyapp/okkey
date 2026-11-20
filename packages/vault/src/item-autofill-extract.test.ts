import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ITEM_PLAINTEXT_SCHEMA_VERSION_V2, type ItemPlaintextV2 } from "@okkey/types";

import {
  categoriesForFieldKinds,
  extractAutofillEmailCandidates,
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
    assert.deepEqual(categoriesForFieldKinds(["loyalty-card-number"]), ["loyalty_card"]);
    assert.deepEqual(categoriesForFieldKinds(["vehicle-plate"]), ["vehicle"]);
    assert.deepEqual(categoriesForFieldKinds(["travel-booking-reference"]), ["travel_booking"]);
    assert.deepEqual(categoriesForFieldKinds(["db-server"]), ["database"]);
    assert.deepEqual(categoriesForFieldKinds(["crypto-address"]), ["crypto_wallet"]);
  });

  it("email primary never mixes credit_card/bank from sibling page kinds", () => {
    const emailNextToCard = categoriesForFieldKinds([
      "email",
      "cc-number",
      "cc-exp",
      "cc-csc",
    ]);
    assert.deepEqual(emailNextToCard, ["login", "personal_data"]);
    assert.ok(!emailNextToCard.includes("credit_card"));
    assert.ok(!emailNextToCard.includes("bank_account"));

    assert.deepEqual(categoriesForFieldKinds(["cc-number", "email", "cc-exp"]), ["credit_card"]);
    assert.deepEqual(categoriesForFieldKinds(["iban", "email"]), ["bank_account"]);
  });

  it("loyalty / vehicle / travel kinds never mix login or payment categories", () => {
    assert.deepEqual(categoriesForFieldKinds(["loyalty-card-number", "username", "password"]), [
      "loyalty_card",
    ]);
    assert.deepEqual(categoriesForFieldKinds(["vehicle-vin", "email"]), ["vehicle"]);
    assert.deepEqual(categoriesForFieldKinds(["travel-from", "password"]), ["travel_booking"]);
    assert.ok(!categoriesForFieldKinds(["username"]).includes("loyalty_card"));
    assert.ok(!categoriesForFieldKinds(["password"]).includes("vehicle"));
    assert.ok(!categoriesForFieldKinds(["cc-number"]).includes("loyalty_card"));
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
                apartment: "12",
                house: "1",
                street: "Tverskaya",
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
    assert.equal(suggestionSubtitleFromValues("personal_data", values, "given-name"), "Саша");
    assert.equal(suggestionSubtitleFromValues("personal_data", values, "email"), "a@example.com");
    assert.equal(suggestionSubtitleFromValues("personal_data", values), "a@example.com");
    assert.equal(values["street-address"], "Tverskaya");
    assert.equal(values["address-house"], "1");
    assert.equal(values["address-apartment"], "12");
    assert.equal(values["address-level2"], "Moscow");
    assert.equal(values["postal-code"], "101000");
    assert.equal(values.country, "RU");
    assert.equal(values.address, "Apt 12, 1 Tverskaya, Moscow, 101000, Russia");
    assert.equal(values.name, "Саша Иванов");

    const ruValues = extractAutofillValues(
      item({
        categoryId: "personal_data",
        fields: [
          {
            id: "address",
            type: "address",
            sectionId: "personal-data",
            order: 0,
            value: {
              kind: "unknown",
              declaredType: "address",
              raw: JSON.stringify({
                apartment: "187",
                house: "39A",
                street: "Октябрьская",
                city: "Москва",
                state: "Московская",
                postalCode: "909123",
                country: "RU",
              }),
            },
          },
        ],
      }),
      { locale: "ru" },
    );
    assert.equal(
      ruValues.address,
      "909123, Россия, Московская обл., г. Москва, ул. Октябрьская, д. 39A, кв. 187",
    );
  });

  it("maps nickname to username and prefers it in personal_data subtitle fallback", () => {
    const values = extractAutofillValues(
      item({
        categoryId: "personal_data",
        fields: [
          {
            id: "nickname",
            type: "text",
            sectionId: "personal-data",
            order: 0,
            value: { kind: "text", text: "sasha_n" },
          },
          {
            id: "email",
            type: "email",
            sectionId: "personal-data",
            order: 1,
            value: { kind: "text", text: "a@example.com" },
          },
          {
            id: "first-name",
            type: "text",
            sectionId: "personal-data",
            order: 2,
            value: { kind: "text", text: "Александр" },
          },
        ],
      }),
    );
    assert.equal(values.username, "sasha_n");
    assert.equal(values.email, "a@example.com");
    assert.equal(values["given-name"], "Александр");
    assert.equal(suggestionSubtitleFromValues("personal_data", values, "username"), "sasha_n");
    assert.equal(suggestionSubtitleFromValues("personal_data", values, "given-name"), "Александр");
  });

  it("collects standard + custom email fields as separate candidates", () => {
    const emails = extractAutofillEmailCandidates(
      item({
        categoryId: "personal_data",
        fields: [
          {
            id: "email",
            type: "email",
            sectionId: "personal-data",
            order: 0,
            value: { kind: "text", text: "a@example.com" },
          },
          {
            id: "fld_custom_1",
            type: "email",
            sectionId: "personal-data",
            order: 1,
            label: "emeil",
            value: { kind: "text", text: "work@okkey.app" },
          },
          {
            id: "fld_custom_2",
            type: "text",
            sectionId: "personal-data",
            order: 2,
            label: "Email secondary",
            value: { kind: "text", text: "extra@example.org" },
          },
          {
            id: "phone",
            type: "text",
            sectionId: "personal-data",
            order: 3,
            value: { kind: "text", text: "+79990001122" },
          },
        ],
      }),
    );
    assert.deepEqual(emails, ["a@example.com", "work@okkey.app", "extra@example.org"]);
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

  it("extracts loyalty_card without mapping card-number to cc-number", () => {
    const values = extractAutofillValues(
      item({
        categoryId: "loyalty_card",
        fields: [
          {
            id: "provider",
            type: "text",
            sectionId: "loyalty-card",
            order: 0,
            value: { kind: "text", text: "Aeroflot Bonus" },
          },
          {
            id: "card-number",
            type: "text",
            sectionId: "loyalty-card",
            order: 1,
            value: { kind: "text", text: "1234567890" },
          },
          {
            id: "barcode",
            type: "text",
            sectionId: "loyalty-card",
            order: 2,
            value: { kind: "text", text: "998877" },
          },
          {
            id: "expiry-date",
            type: "date",
            sectionId: "loyalty-card",
            order: 3,
            value: { kind: "text", text: "2030-12-31" },
          },
        ],
      }),
    );
    assert.equal(values["loyalty-provider"], "Aeroflot Bonus");
    assert.equal(values["loyalty-card-number"], "1234567890");
    assert.equal(values["loyalty-barcode"], "998877");
    assert.equal(values["loyalty-expiry"], "2030-12-31");
    assert.equal(values["cc-number"], undefined);
    assert.equal(values["passport-expiry"], undefined);
    assert.equal(values.password, undefined);
    assert.equal(suggestionSubtitleFromValues("loyalty_card", values), "1234567890");
  });

  it("extracts vehicle and travel_booking field ids", () => {
    const vehicle = extractAutofillValues(
      item({
        categoryId: "vehicle",
        fields: [
          {
            id: "make-model",
            type: "text",
            sectionId: "vehicle",
            order: 0,
            value: { kind: "text", text: "Toyota Camry" },
          },
          {
            id: "plate",
            type: "text",
            sectionId: "vehicle",
            order: 1,
            value: { kind: "text", text: "A123BC77" },
          },
          {
            id: "vin",
            type: "text",
            sectionId: "vehicle",
            order: 2,
            value: { kind: "text", text: "JTDBR32E720123456" },
          },
          {
            id: "insurance-policy-number",
            type: "text",
            sectionId: "vehicle-insurance",
            order: 3,
            value: { kind: "text", text: "XXX-001" },
          },
          {
            id: "insurer",
            type: "text",
            sectionId: "vehicle-insurance",
            order: 4,
            value: { kind: "text", text: "Ingospakh" },
          },
          {
            id: "insurance-valid-until",
            type: "date",
            sectionId: "vehicle-insurance",
            order: 5,
            value: { kind: "text", text: "2027-06-01" },
          },
        ],
      }),
    );
    assert.equal(vehicle["vehicle-make-model"], "Toyota Camry");
    assert.equal(vehicle["vehicle-plate"], "A123BC77");
    assert.equal(vehicle["vehicle-vin"], "JTDBR32E720123456");
    assert.equal(vehicle["vehicle-insurance-policy-number"], "XXX-001");
    assert.equal(vehicle["vehicle-insurer"], "Ingospakh");
    assert.equal(vehicle["vehicle-insurance-valid-until"], "2027-06-01");
    assert.equal(suggestionSubtitleFromValues("vehicle", vehicle), "A123BC77");

    const travel = extractAutofillValues(
      item({
        categoryId: "travel_booking",
        fields: [
          {
            id: "carrier",
            type: "text",
            sectionId: "travel-booking",
            order: 0,
            value: { kind: "text", text: "SU" },
          },
          {
            id: "trip-number",
            type: "text",
            sectionId: "travel-booking",
            order: 1,
            value: { kind: "text", text: "SU100" },
          },
          {
            id: "from",
            type: "text",
            sectionId: "travel-booking",
            order: 2,
            value: { kind: "text", text: "SVO" },
          },
          {
            id: "to",
            type: "text",
            sectionId: "travel-booking",
            order: 3,
            value: { kind: "text", text: "LED" },
          },
          {
            id: "booking-reference",
            type: "text",
            sectionId: "travel-booking",
            order: 4,
            value: { kind: "text", text: "ABC123" },
          },
        ],
      }),
    );
    assert.equal(travel["travel-carrier"], "SU");
    assert.equal(travel["travel-trip-number"], "SU100");
    assert.equal(travel["travel-from"], "SVO");
    assert.equal(travel["travel-to"], "LED");
    assert.equal(travel["travel-booking-reference"], "ABC123");
    assert.equal(suggestionSubtitleFromValues("travel_booking", travel), "ABC123");
  });
});
