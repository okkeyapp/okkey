import { describe, expect, it } from "vitest";

import type { KeyFormEditorField } from "../components/key-form/KeyFormEditor";
import { keyFormSectionsToItemPlaintext } from "./keyFormToItemPlaintext";
import { itemPlaintextToKeyFormSections } from "./itemPlaintextToKeyFormSections";
import {
  appendSelectOptionsEditorLineAtEnd,
  normalizeSelectOptionsEditorText,
  parseSelectFieldValueFromItem,
  serializeSelectFieldValue,
} from "./keyFormSelectField";

describe("keyFormSelectField", () => {
  it("limits trailing blank lines like recovery codes editor", () => {
    expect(normalizeSelectOptionsEditorText("one\n\ntwo")).toBe("one\n\ntwo");
    expect(normalizeSelectOptionsEditorText("one\n")).toBe("one\n");
    expect(normalizeSelectOptionsEditorText("one\n\n")).toBe("one\n");
    expect(normalizeSelectOptionsEditorText("one\n\n\n")).toBe("one\n");
    expect(normalizeSelectOptionsEditorText("one\n\n\n\n")).toBe("one\n");
  });

  it("appends at most one trailing newline on enter", () => {
    expect(appendSelectOptionsEditorLineAtEnd("one")).toBe("one\n");
    expect(appendSelectOptionsEditorLineAtEnd("one\n")).toBe("one\n");
    expect(appendSelectOptionsEditorLineAtEnd("")).toBe("");
    expect(appendSelectOptionsEditorLineAtEnd("one\n\n")).toBe("one\n");
  });

  it("serializes select value and options into unknown raw payload", () => {
    const field: KeyFormEditorField = {
      id: "custom-select",
      type: "select",
      label: "Priority",
      value: "high",
      selectOptions: [
        { value: "high", label: "High" },
        { value: "low", label: "Low" },
      ],
    };

    expect(serializeSelectFieldValue(field)).toEqual({
      kind: "unknown",
      declaredType: "select",
      raw: {
        value: "high",
        options: [
          { value: "high", label: "High" },
          { value: "low", label: "Low" },
        ],
      },
    });
  });

  it("round-trips select fields through item plaintext", () => {
    const sections = [
      {
        id: "api-access",
        variant: "primary" as const,
        fields: [
          {
            id: "api-type",
            type: "select",
            label: "Type",
            value: "custom-type",
            selectOptions: [
              { value: "custom-type", label: "Custom type" },
              { value: "legacy", label: "Legacy" },
            ],
          },
          {
            id: "field-2",
            type: "select",
            label: "Custom select",
            value: "one",
            selectOptions: [
              { value: "one", label: "One" },
              { value: "two", label: "Two" },
            ],
          },
        ],
      },
    ];

    const item = keyFormSectionsToItemPlaintext({
      sections,
      itemId: "item-1",
      vaultId: "vault-1",
      title: "API key",
      categoryId: "api_access",
      nowMs: 1,
    });

    const apiTypeField = item.fields.find((field) => field.id === "api-type");
    expect(apiTypeField?.type).toBe("select");
    expect(parseSelectFieldValueFromItem(apiTypeField!)).toEqual({
      value: "custom-type",
      selectOptions: [
        { value: "custom-type", label: "Custom type" },
        { value: "legacy", label: "Legacy" },
      ],
    });

    const restored = itemPlaintextToKeyFormSections(item);
    const restoredApiType = restored[0]?.fields.find((field) => field.id === "api-type");
    const restoredCustomSelect = restored[0]?.fields.find((field) => field.id === "field-2");

    expect(restoredApiType?.value).toBe("custom-type");
    expect(restoredApiType?.selectOptions).toEqual([
      { value: "custom-type", label: "Custom type" },
      { value: "legacy", label: "Legacy" },
    ]);
    expect(restoredCustomSelect?.value).toBe("one");
    expect(restoredCustomSelect?.selectOptions).toEqual([
      { value: "one", label: "One" },
      { value: "two", label: "Two" },
    ]);
  });
});
