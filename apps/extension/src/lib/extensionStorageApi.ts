/**
 * Resolve chrome.storage areas safely in every extension context.
 *
 * Root cause (content scripts): `@wxt-dev/browser` picks `globalThis.browser`
 * whenever `browser.runtime.id` is set. Some Chromium content worlds expose a
 * partial `browser` (runtime works, `storage` is undefined). Reading
 * `browser.storage.local` then throws and breaks page UI (e.g. Radix Select on
 * scroll while the autofill overlay repositions).
 *
 * Prefer whichever API actually exposes the storage area; never throw.
 */

type StorageAreaLike = {
  get: (keys?: string | string[] | null | Record<string, unknown>) => Promise<Record<string, unknown>>;
  set: (items: Record<string, unknown>) => Promise<void>;
  remove: (keys: string | string[]) => Promise<void>;
};

type ExtensionApiRoot = {
  storage?: {
    local?: StorageAreaLike;
    session?: StorageAreaLike;
  };
};

function apiCandidates(): ExtensionApiRoot[] {
  const g = globalThis as {
    chrome?: ExtensionApiRoot;
    browser?: ExtensionApiRoot;
  };
  // Prefer chrome first: complete MV3 surface in Chromium content scripts.
  const out: ExtensionApiRoot[] = [];
  if (g.chrome) out.push(g.chrome);
  if (g.browser && g.browser !== g.chrome) out.push(g.browser);
  return out;
}

function resolveArea(kind: "local" | "session"): StorageAreaLike | null {
  for (const api of apiCandidates()) {
    const area = api.storage?.[kind];
    if (area && typeof area.get === "function") {
      return area;
    }
  }
  return null;
}

export function extensionLocalStorage(): StorageAreaLike | null {
  return resolveArea("local");
}

export function extensionSessionStorage(): StorageAreaLike | null {
  return resolveArea("session");
}
