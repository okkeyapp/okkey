export function captureCapsuleFragmentKey(
  capsuleId: string,
  locationValue: Pick<Location, "hash" | "pathname" | "search"> = window.location,
  historyValue: Pick<History, "replaceState"> = window.history,
  storage: Pick<Storage, "getItem" | "setItem"> = sessionStorage,
): string | null {
  const storageKey = `okkey:capsule-key:${capsuleId}`;
  const fragmentKey = new URLSearchParams(locationValue.hash.replace(/^#/u, "")).get("key");
  if (fragmentKey) {
    storage.setItem(storageKey, fragmentKey);
    historyValue.replaceState(null, "", `${locationValue.pathname}${locationValue.search}`);
    return fragmentKey;
  }
  return storage.getItem(storageKey);
}
