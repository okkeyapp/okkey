import { describe, expect, it } from "vitest";

import { PUBLIC_DOCS_ORIGIN, PUBLIC_DOCS_TOPICS, publicDocsUrl } from "./publicDocsUrl";

const DECODED: Record<(typeof PUBLIC_DOCS_TOPICS)[number], { ru: string; en: string }> = {
  home: {
    ru: "https://okkey.app/",
    en: "https://okkey.app/en/",
  },
  roles: {
    ru: "https://okkey.app/settings/workspace#роли",
    en: "https://okkey.app/en/settings/workspace#roles",
  },
  members: {
    ru: "https://okkey.app/settings/workspace#участники",
    en: "https://okkey.app/en/settings/workspace#members",
  },
  profiles: {
    ru: "https://okkey.app/settings/workspace#профили",
    en: "https://okkey.app/en/settings/workspace#profiles",
  },
  workspaceVaults: {
    ru: "https://okkey.app/settings/workspace#сейфы",
    en: "https://okkey.app/en/settings/workspace#vaults",
  },
  generator: {
    ru: "https://okkey.app/tools#генератор",
    en: "https://okkey.app/en/tools#generator",
  },
  import: {
    ru: "https://okkey.app/tools#импорт",
    en: "https://okkey.app/en/tools#import",
  },
  export: {
    ru: "https://okkey.app/tools#экспорт",
    en: "https://okkey.app/en/tools#export",
  },
  capsules: {
    ru: "https://okkey.app/capsules",
    en: "https://okkey.app/en/capsules",
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
