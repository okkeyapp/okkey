/**
 * MV3 permissions, split by browser.
 *
 * Chromium answers `webRequest.onAuthRequired` with `webRequest` +
 * `webRequestAuthProvider` (`asyncBlocking`). Regular Chrome MV3 rejects
 * `webRequestBlocking`, so it is not declared there.
 *
 * Firefox's `strict_min_version` is 121. `webRequestAuthProvider` landed in
 * Firefox 126 and `asyncBlocking` in Firefox 128, so the Firefox build uses
 * `webRequest` + `webRequestBlocking` and a Promise from a `blocking` listener
 * (supported in Firefox MV3, including 121). See store/PERMISSIONS.md.
 */
const SHARED_PERMISSIONS = [
  "storage",
  "tabs",
  "idle",
  "alarms",
  "clipboardRead",
  "clipboardWrite",
  "webRequest",
] as const;

const CHROMIUM_ONLY_PERMISSIONS = ["offscreen", "webRequestAuthProvider"] as const;

const FIREFOX_ONLY_PERMISSIONS = ["webRequestBlocking"] as const;

export function extensionManifestPermissions(browser: string): string[] {
  if (browser === "firefox") {
    return [...SHARED_PERMISSIONS, ...FIREFOX_ONLY_PERMISSIONS];
  }
  return [...SHARED_PERMISSIONS, ...CHROMIUM_ONLY_PERMISSIONS];
}
