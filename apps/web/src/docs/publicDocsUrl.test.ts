import { describe, expect, it } from "vitest";

import { PUBLIC_DOCS_ORIGIN, PUBLIC_DOCS_TOPICS, publicDocsUrl } from "./publicDocsUrl";

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
  it("points every topic at the locale-matched public docs page", () => {
    for (const topic of PUBLIC_DOCS_TOPICS) {
      const ru = publicDocsUrl(topic, "ru");
      const en = publicDocsUrl(topic, "en");

      expect(decodeURI(ru)).toBe(DECODED[topic].ru);
      expect(en).toBe(DECODED[topic].en);
      expect(ru.startsWith(`${PUBLIC_DOCS_ORIGIN}/`)).toBe(true);
      expect(en.startsWith(`${PUBLIC_DOCS_ORIGIN}/en/`)).toBe(true);
      expect(ru.includes("/en/")).toBe(false);
      expect(ru).not.toBe(en);

      for (const href of [ru, en]) {
        expect(href.length).toBeGreaterThan(PUBLIC_DOCS_ORIGIN.length);
        expect(href.startsWith("#")).toBe(false);
        expect(href.includes("javascript:")).toBe(false);
        expect(href.endsWith("#")).toBe(false);
        expect(new URL(href).protocol).toBe("https:");
        expect(new URL(href).origin).toBe(PUBLIC_DOCS_ORIGIN);
      }
    }
  });
});
