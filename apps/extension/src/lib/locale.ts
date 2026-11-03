import type { WebLocale } from "@okkey/i18n";

import { extensionLocalStorage } from "./extensionStorageApi.ts";

/** Same key as the extension popup language switcher (chrome.storage.local + page mirror). */
export const EXTENSION_LOCALE_STORAGE_KEY = "okkey.extension.locale";

const DEFAULT_LOCALE: WebLocale = "ru";

/** Keep in sync with `@okkey/i18n` WEB_LOCALES (ru/en). Avoid runtime package import for node:test. */
function isWebLocale(value: unknown): value is WebLocale {
  return value === "ru" || value === "en";
}

function extensionPageLocalStorage(): Storage | null {
  try {
    const ls = (globalThis as { localStorage?: Storage }).localStorage;
    if (ls && typeof ls.getItem === "function" && typeof ls.setItem === "function") {
      return ls;
    }
  } catch {
    // ignore
  }
  return null;
}

function readLocalStorageMirror(): WebLocale | null {
  try {
    const raw = extensionPageLocalStorage()?.getItem(EXTENSION_LOCALE_STORAGE_KEY);
    return isWebLocale(raw) ? raw : null;
  } catch {
    return null;
  }
}

function writeLocalStorageMirror(locale: WebLocale): void {
  try {
    extensionPageLocalStorage()?.setItem(EXTENSION_LOCALE_STORAGE_KEY, locale);
  } catch {
    // ignore (content scripts / restricted contexts / node:test)
  }
}

/**
 * Sync read for popup / extension-page initial paint.
 * Prefers the extension-page localStorage mirror; defaults to Russian.
 * Content scripts must use {@link loadExtensionLocale} (chrome.storage).
 */
export function readStoredExtensionLocale(): WebLocale {
  return readLocalStorageMirror() ?? DEFAULT_LOCALE;
}

/**
 * Authoritative locale for all extension contexts (popup + content scripts).
 * Migrates a legacy localStorage-only value into chrome.storage.local once.
 */
export async function loadExtensionLocale(): Promise<WebLocale> {
  const area = extensionLocalStorage();
  if (area) {
    try {
      const bag = await area.get(EXTENSION_LOCALE_STORAGE_KEY);
      const stored = bag[EXTENSION_LOCALE_STORAGE_KEY];
      if (isWebLocale(stored)) {
        writeLocalStorageMirror(stored);
        return stored;
      }
    } catch {
      // fall through to mirror / default
    }
  }

  const legacy = readLocalStorageMirror() ?? DEFAULT_LOCALE;
  // Best-effort migrate so content scripts see the popup language choice.
  await writeStoredExtensionLocale(legacy);
  return legacy;
}

export async function writeStoredExtensionLocale(locale: WebLocale): Promise<void> {
  if (!isWebLocale(locale)) {
    return;
  }
  writeLocalStorageMirror(locale);
  const area = extensionLocalStorage();
  if (!area) {
    return;
  }
  try {
    await area.set({ [EXTENSION_LOCALE_STORAGE_KEY]: locale });
  } catch {
    // ignore
  }
}

type StorageChangeBag = Record<string, { newValue?: unknown; oldValue?: unknown }>;

type StorageChangedEvent = {
  addListener: (
    callback: (changes: StorageChangeBag, areaName: string) => void,
  ) => void;
  removeListener: (
    callback: (changes: StorageChangeBag, areaName: string) => void,
  ) => void;
};

function resolveStorageOnChanged(): StorageChangedEvent | null {
  const g = globalThis as {
    chrome?: { storage?: { onChanged?: StorageChangedEvent } };
    browser?: { storage?: { onChanged?: StorageChangedEvent } };
  };
  if (g.chrome?.storage?.onChanged) {
    return g.chrome.storage.onChanged;
  }
  if (g.browser?.storage?.onChanged) {
    return g.browser.storage.onChanged;
  }
  return null;
}

/** Live updates when the popup language switcher writes chrome.storage.local. */
export function subscribeExtensionLocale(
  onChange: (locale: WebLocale) => void,
): () => void {
  const event = resolveStorageOnChanged();
  if (!event) {
    return () => {};
  }
  const listener = (changes: StorageChangeBag, areaName: string) => {
    if (areaName !== "local") {
      return;
    }
    const change = changes[EXTENSION_LOCALE_STORAGE_KEY];
    if (!change || !isWebLocale(change.newValue)) {
      return;
    }
    writeLocalStorageMirror(change.newValue);
    onChange(change.newValue);
  };
  event.addListener(listener);
  return () => {
    try {
      event.removeListener(listener);
    } catch {
      // ignore
    }
  };
}
