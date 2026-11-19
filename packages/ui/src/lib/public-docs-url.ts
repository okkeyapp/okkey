import { docsPathPrefix, FALLBACK_LOCALE, type AppLocale } from "@okkey/i18n";

/**
 * Origin of the public Okkey docs site.
 * Russian is the default locale and is not prefixed. English is under `/en/`.
 * Prefixes come from `@okkey/i18n` locale manifest (`docsPathPrefix`).
 */
export const PUBLIC_DOCS_ORIGIN = "https://docs.okkey.io";

/** Any app locale; unknown codes fall back to English docs paths. */
export type PublicDocsLocale = AppLocale | string;

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
 * Locale-independent path slugs on the public docs site.
 * `home` is the intro page (`/`). There is no separate help article.
 * Roles, members, profiles, and workspace vaults are separate workspace pages.
 * Generator, import, and export are separate tools pages.
 */
const PUBLIC_DOCS_SLUGS: Record<PublicDocsTopic, string> = {
  home: "/",
  roles: "/workspace/roles",
  members: "/workspace/members",
  profiles: "/workspace/profiles",
  workspaceVaults: "/workspace/vaults",
  generator: "/tools/generator",
  import: "/tools/import",
  export: "/tools/export",
  capsules: "/capsules",
};

function docsPathForTopic(topic: PublicDocsTopic, locale: PublicDocsLocale): string {
  const prefix = docsPathPrefix(typeof locale === "string" ? locale : FALLBACK_LOCALE);
  const slug = PUBLIC_DOCS_SLUGS[topic];
  if (topic === "home") {
    return prefix === "" ? "/" : `${prefix}/`;
  }
  return `${prefix}${slug}`;
}

/** Absolute docs URL for the UI locale. Opens off the vault origin. Falls back to English paths. */
export function publicDocsUrl(topic: PublicDocsTopic, locale: PublicDocsLocale): string {
  const path = docsPathForTopic(topic, locale);
  return new URL(path, PUBLIC_DOCS_ORIGIN).href;
}
