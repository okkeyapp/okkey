import { useSyncExternalStore } from "react";

/** `/items` master–detail list-only mode: viewport strictly below Tailwind `md` (768px). */
const ITEMS_MOBILE_LIST_VIEW_MQ = "(max-width: 767px)";

function subscribeItemsMobileListView(onStoreChange: () => void) {
  if (typeof window === "undefined") {
    return () => {};
  }
  const mq = window.matchMedia(ITEMS_MOBILE_LIST_VIEW_MQ);
  mq.addEventListener("change", onStoreChange);
  return () => mq.removeEventListener("change", onStoreChange);
}

function getItemsMobileListViewSnapshot() {
  if (typeof window === "undefined") {
    return false;
  }
  return window.matchMedia(ITEMS_MOBILE_LIST_VIEW_MQ).matches;
}

export function useItemsMobileListView(): boolean {
  return useSyncExternalStore(
    subscribeItemsMobileListView,
    getItemsMobileListViewSnapshot,
    () => false,
  );
}
