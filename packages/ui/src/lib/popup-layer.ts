/**
 * Stack of open Popup overlays so Escape only dismisses the topmost layer.
 * Nested selects / menus / comboboxes are detected separately so their own
 * Escape handling wins over the popup.
 */

export type PopupLayerEntry = {
  id: symbol;
  /** Invoked when Escape targets this layer (even if the popup chooses to ignore it). */
  onEscape: () => void;
};

const popupLayerStack: PopupLayerEntry[] = [];

/** Open Radix / combobox surfaces that consume Escape before a Popup should. */
export const OPEN_NESTED_DISMISS_LAYER_SELECTOR = [
  "[data-radix-select-viewport]",
  "[data-slot='popover-content']",
  "[data-radix-popover-content]",
  "[data-radix-menu-content]",
  "[data-radix-dropdown-menu-content]",
  '[role="listbox"][data-state="open"]',
  '[role="menu"][data-state="open"]',
  '[role="combobox"][data-state="open"]',
  '[aria-expanded="true"][aria-haspopup="listbox"]',
  '[aria-expanded="true"][aria-haspopup="menu"]',
].join(",");

export function pageHasOpenNestedDismissLayer(): boolean {
  try {
    return typeof document !== "undefined" && Boolean(document.querySelector(OPEN_NESTED_DISMISS_LAYER_SELECTOR));
  } catch {
    return false;
  }
}

export function getPopupLayerStackSizeForTests(): number {
  return popupLayerStack.length;
}

export function clearPopupLayerStackForTests(): void {
  popupLayerStack.length = 0;
  detachEscapeListener();
}

export function registerPopupLayer(entry: PopupLayerEntry): () => void {
  popupLayerStack.push(entry);
  attachEscapeListener();
  return () => {
    const index = popupLayerStack.findIndex((item) => item.id === entry.id);
    if (index >= 0) {
      popupLayerStack.splice(index, 1);
    }
    if (popupLayerStack.length === 0) {
      detachEscapeListener();
    }
  };
}

function handleDocumentKeyDown(event: KeyboardEvent): void {
  if (event.key !== "Escape") {
    return;
  }
  // Nested overlays (combobox, select, menu) own Escape first.
  if (pageHasOpenNestedDismissLayer()) {
    return;
  }
  if (event.defaultPrevented) {
    return;
  }

  const top = popupLayerStack[popupLayerStack.length - 1];
  if (!top) {
    return;
  }

  event.preventDefault();
  top.onEscape();
}

let escapeListenerAttached = false;

function attachEscapeListener(): void {
  if (escapeListenerAttached || typeof document === "undefined") {
    return;
  }
  document.addEventListener("keydown", handleDocumentKeyDown);
  escapeListenerAttached = true;
}

function detachEscapeListener(): void {
  if (!escapeListenerAttached || typeof document === "undefined") {
    return;
  }
  document.removeEventListener("keydown", handleDocumentKeyDown);
  escapeListenerAttached = false;
}
