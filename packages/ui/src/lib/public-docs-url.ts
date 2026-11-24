/**
 * Origin of the public Okkey docs site.
 * Russian is the default locale and is not prefixed. English is under `/en/`.
 */
export const PUBLIC_DOCS_ORIGIN = "https://docs.okkey.io";

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
 * Paths on the public docs site.
 * `home` is the intro page (`/`). There is no separate help article.
 * Roles, members, profiles, and workspace vaults are separate workspace pages.
 * Generator, import, and export are separate tools pages.
 */
const PUBLIC_DOCS_PATHS: Record<PublicDocsTopic, Record<PublicDocsLocale, string>> = {
  home: {
    ru: "/",
    en: "/en/",
  },
  roles: {
    ru: "/workspace/roles",
    en: "/en/workspace/roles",
  },
  members: {
    ru: "/workspace/members",
    en: "/en/workspace/members",
  },
  profiles: {
    ru: "/workspace/profiles",
    en: "/en/workspace/profiles",
  },
  workspaceVaults: {
    ru: "/workspace/vaults",
    en: "/en/workspace/vaults",
  },
  generator: {
    ru: "/tools/generator",
    en: "/en/tools/generator",
  },
  import: {
    ru: "/tools/import",
    en: "/en/tools/import",
  },
  export: {
    ru: "/tools/export",
    en: "/en/tools/export",
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
