import type { WebLocale } from "@okkey/i18n";

/**
 * Origin of the public Okkey docs site (okkey-docs).
 * Russian is the default locale and is not prefixed. English is under `/en/`.
 * The published docs line is v1.0 and is served at the site root.
 */
export const PUBLIC_DOCS_ORIGIN = "https://okkey.app";

/** Topics that have a Learn more control in the current web UI. */
export const PUBLIC_DOCS_TOPICS = [
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
 * Paths on okkey-docs v1.0. Roles, members, profiles, and workspace vaults are
 * sections of the workspace settings page. Generator, import, and export are
 * sections of the tools page. Capsules has its own page.
 * Fragments are the heading slugs for that locale.
 */
const PUBLIC_DOCS_PATHS: Record<PublicDocsTopic, Record<WebLocale, string>> = {
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
export function publicDocsUrl(topic: PublicDocsTopic, locale: WebLocale): string {
  const path = PUBLIC_DOCS_PATHS[topic][locale];
  return new URL(path, PUBLIC_DOCS_ORIGIN).href;
}
