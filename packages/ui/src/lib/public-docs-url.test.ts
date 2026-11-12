import { describe, expect, it } from "vitest";

import { PUBLIC_DOCS_ORIGIN, PUBLIC_DOCS_TOPICS, publicDocsUrl } from "./public-docs-url.js";

const DECODED: Record<(typeof PUBLIC_DOCS_TOPICS)[number], { ru: string; en: string }> = {
  home: {
    ru: "https://docs.okkey.io/",
    en: "https://docs.okkey.io/en/",
  },
  roles: {
    ru: "https://docs.okkey.io/workspace/roles",
    en: "https://docs.okkey.io/en/workspace/roles",
  },
  members: {
    ru: "https://docs.okkey.io/workspace/members",
    en: "https://docs.okkey.io/en/workspace/members",
  },
  profiles: {
    ru: "https://docs.okkey.io/workspace/profiles",
    en: "https://docs.okkey.io/en/workspace/profiles",
  },
  workspaceVaults: {
    ru: "https://docs.okkey.io/workspace/vaults",
    en: "https://docs.okkey.io/en/workspace/vaults",
  },
  generator: {
    ru: "https://docs.okkey.io/tools/generator",
    en: "https://docs.okkey.io/en/tools/generator",
  },
  import: {
    ru: "https://docs.okkey.io/tools/import",
    en: "https://docs.okkey.io/en/tools/import",
  },
  export: {
    ru: "https://docs.okkey.io/tools/export",
    en: "https://docs.okkey.io/en/tools/export",
  },
  capsules: {
    ru: "https://docs.okkey.io/capsules",
    en: "https://docs.okkey.io/en/capsules",
  },
};

describe("publicDocsUrl", () => {
  it("uses the public docs origin", () => {
    expect(PUBLIC_DOCS_ORIGIN).toBe("https://docs.okkey.io");
  });

  it("points every topic at a locale page without a fragment", () => {
    for (const topic of PUBLIC_DOCS_TOPICS) {
      const ru = publicDocsUrl(topic, "ru");
      const en = publicDocsUrl(topic, "en");

      expect(ru).toBe(DECODED[topic].ru);
      expect(en).toBe(DECODED[topic].en);
      expect(ru.includes("/en/")).toBe(false);
      expect(ru).not.toBe(en);

      for (const href of [ru, en]) {
        const url = new URL(href);
        expect(url.protocol).toBe("https:");
        expect(url.origin).toBe(PUBLIC_DOCS_ORIGIN);
        expect(url.hash).toBe("");
      }
    }
  });
});
