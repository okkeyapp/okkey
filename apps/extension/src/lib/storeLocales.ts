import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export type ExtensionStoreLocalesConfig = {
  /** Manifest default_locale for the uploaded package. */
  defaultLocale: string;
  /** Package _locales folders plus store listing languages. */
  locales: readonly string[];
};

const CONFIG_RELATIVE = "store/locales.json";

/** Load the data-driven store locale list (add a locale without hardcoding tests). */
export function readExtensionStoreLocalesConfig(extensionRoot: string): ExtensionStoreLocalesConfig {
  const raw = JSON.parse(readFileSync(join(extensionRoot, CONFIG_RELATIVE), "utf8")) as unknown;
  if (raw === null || typeof raw !== "object") {
    throw new Error(`Invalid ${CONFIG_RELATIVE}`);
  }
  const obj = raw as { defaultLocale?: unknown; locales?: unknown };
  if (typeof obj.defaultLocale !== "string" || obj.defaultLocale.length === 0) {
    throw new Error(`${CONFIG_RELATIVE}: defaultLocale must be a non-empty string`);
  }
  if (!Array.isArray(obj.locales) || obj.locales.length === 0) {
    throw new Error(`${CONFIG_RELATIVE}: locales must be a non-empty array`);
  }
  const locales = obj.locales.map((code, index) => {
    if (typeof code !== "string" || code.length === 0) {
      throw new Error(`${CONFIG_RELATIVE}: locales[${index}] must be a non-empty string`);
    }
    return code;
  });
  if (!locales.includes(obj.defaultLocale)) {
    throw new Error(
      `${CONFIG_RELATIVE}: defaultLocale "${obj.defaultLocale}" must appear in locales`,
    );
  }
  return { defaultLocale: obj.defaultLocale, locales };
}

/** Discover Chromium/Firefox package locales under public/_locales. */
export function listPackageStoreLocaleDirs(extensionRoot: string): string[] {
  const root = join(extensionRoot, "public", "_locales");
  if (!existsSync(root)) {
    return [];
  }
  return readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .filter((code) => existsSync(join(root, code, "messages.json")))
    .sort();
}

/** Discover listing markdown files named LISTING.{locale}.md under store/. */
export function listStoreListingLocaleFiles(extensionRoot: string): string[] {
  const storeDir = join(extensionRoot, "store");
  if (!existsSync(storeDir)) {
    return [];
  }
  return readdirSync(storeDir)
    .map((name) => {
      const m = /^LISTING\.([a-z0-9-]+)\.md$/i.exec(name);
      return m?.[1]?.toLowerCase() ?? null;
    })
    .filter((code): code is string => code != null)
    .sort();
}

/**
 * Assert package _locales folders match the store locales config.
 * Adding a store language: update store/locales.json, add messages.json under
 * public/_locales/{locale}, and optionally LISTING.{locale}.md — no test hardcoding.
 */
export function assertStoreLocalesPackageAligned(extensionRoot: string): {
  config: ExtensionStoreLocalesConfig;
  packageLocales: string[];
  listingLocales: string[];
} {
  const config = readExtensionStoreLocalesConfig(extensionRoot);
  const packageLocales = listPackageStoreLocaleDirs(extensionRoot);
  const listingLocales = listStoreListingLocaleFiles(extensionRoot);
  const missingPackage = config.locales.filter((c) => !packageLocales.includes(c));
  if (missingPackage.length > 0) {
    throw new Error(
      `Missing public/_locales messages.json for: ${missingPackage.join(", ")}`,
    );
  }
  const missingListing = config.locales.filter((c) => !listingLocales.includes(c));
  if (missingListing.length > 0) {
    throw new Error(`Missing store/LISTING markdown for: ${missingListing.join(", ")}`);
  }
  return { config, packageLocales, listingLocales };
}
