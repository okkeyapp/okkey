/**
 * Origin of the public Okkey docs site (okkey-docs).
 * Russian is the default locale and is not prefixed. English is under `/en/`.
 * The published docs line is v1.0 and is served at the site root.
 */
export const PUBLIC_DOCS_ORIGIN = "https://okkey.app";

export type PublicDocsLocale = "en" | "ru";

/** Topics linked from the web UI (Learn more controls and the sidebar footer). */
export const PUBLIC_DOCS_TOPICS = [
  "home",
  "roles",
  "members",
  "profiles",
  "workspaceVaults",
  "generator",
  "import",
  "export",
  "capsules",
] as const;

export type PublicDocsTopic = (typeof PUBLIC_DOCS_TOPICS)[number];

/**
 * Paths on okkey-docs v1.0.
 * `home` is the intro page (`slug: /`). There is no separate help article, so
 * sidebar Help uses the same page as Documentation.
 * Roles, members, profiles, and workspace vaults are sections of workspace
 * settings. Generator, import, and export are sections of tools.
 * Fragments are the heading slugs for that locale.
 */
const PUBLIC_DOCS_PATHS: Record<PublicDocsTopic, Record<PublicDocsLocale, string>> = {
  home: {
    ru: "/",
    en: "/en/",
  },
  roles: {
    ru: "/settings/workspace#роли",
    en: "/en/settings/workspace#roles",
  },
  members: {
    ru: "/settings/workspace#участники",
    en: "/en/settings/workspace#members",
  },
  profiles: {
    ru: "/settings/workspace#профили",
    en: "/en/settings/workspace#profiles",
  },
  workspaceVaults: {
    ru: "/settings/workspace#сейфы",
    en: "/en/settings/workspace#vaults",
  },
  generator: {
    ru: "/tools#генератор",
    en: "/en/tools#generator",
  },
  import: {
    ru: "/tools#импорт",
    en: "/en/tools#import",
  },
  export: {
    ru: "/tools#экспорт",
    en: "/en/tools#export",
  },
  capsules: {
    ru: "/capsules",
    en: "/en/capsules",
  },
};

/** Absolute docs URL for the UI locale. Opens off the vault origin. */
export function publicDocsUrl(topic: PublicDocsTopic, locale: PublicDocsLocale): string {
  const path = PUBLIC_DOCS_PATHS[topic][locale];
  return new URL(path, PUBLIC_DOCS_ORIGIN).href;
}
