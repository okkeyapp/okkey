import { describe, expect, it } from "vitest";

import type { KeyFormEditorSection } from "../components/key-form/KeyFormEditor";
import { collectWebsiteUrlsFromSections } from "./domainRecordTitle";

describe("collectWebsiteUrlsFromSections", () => {
  it("keeps website URL fields in form order and skips other sections (QA favicon)", () => {
    const sections = [
      {
        id: "credentials",
        fields: [{ id: "password", type: "password", value: "secret" }],
      },
      {
        id: "websites",
        fields: [
          { id: "primary", type: "url", value: " https://app.example.com/login " },
          { id: "label", type: "text", value: "https://not-a-url-field.example" },
          { id: "secondary", type: "url", value: "https://cdn.example.com" },
          { id: "blank", type: "url", value: "   " },
        ],
      },
    ] as KeyFormEditorSection[];

    expect(collectWebsiteUrlsFromSections(sections)).toEqual([
      "https://app.example.com/login",
      "https://cdn.example.com",
    ]);
  });
});
