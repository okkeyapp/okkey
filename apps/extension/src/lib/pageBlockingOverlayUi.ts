/**
 * Selectors for page UI that the autofill content-script must not disturb
 * (overlay paint, focus restore, scroll/resize reposition, query-driven updates).
 *
 * Notes:
 * - Radix Select Content does **not** set `data-radix-select-content`; the open
 *   portal exposes `data-radix-select-viewport` + `role="listbox"`.
 * - Calendar month/year (`CalendarMonthYearCaption`) are Radix Selects, often
 *   portaled outside `[data-key-field-date-picker-panel]` / Popover — e.g. birth
 *   date («дата рождения») in the personal-data item edit popup.
 * - Do **not** treat a generic `role="dialog"` as blocking: Okkey item edit and
 *   many login modals are dialogs, and autofill must still work inside them.
 * - While Select / datepicker / menu dropdowns are open, content-script overlay
 *   updates must be a full no-op (paint / focus / late query apply).
 */
export const BLOCKING_OVERLAY_UI_SELECTOR = [
  // Radix Select (month/year caption + ordinary Selects)
  "[data-radix-select-viewport]",
  "[data-radix-select-content]",
  '[role="listbox"][data-state="open"]',
  '[role="combobox"][data-state="open"]',
  '[role="combobox"][aria-expanded="true"]',
  '[aria-expanded="true"][aria-haspopup="listbox"]',
  'button[data-state="open"][aria-haspopup="listbox"]',
  'button[data-state="open"][role="combobox"]',
  // Radix Menu / Dropdown
  "[data-radix-menu-content]",
  "[data-radix-dropdown-menu-content]",
  '[role="menu"][data-state="open"]',
  '[aria-expanded="true"][aria-haspopup="menu"]',
  // Popover used by datepickers / floating calendars (not generic modal dialogs)
  "[data-radix-popover-content]",
  '[data-slot="popover-content"]',
  // Popper wrapper only when it hosts an open Select listbox/viewport
  "[data-radix-popper-content-wrapper]:has([data-radix-select-viewport])",
  "[data-radix-popper-content-wrapper]:has([role='listbox'])",
  // Key-field datepicker hosts Calendar + month/year Selects
  "[data-key-field-date-picker-panel]",
  // Native <select>
  "select:focus",
].join(",");

/** True when the focused element itself is part of an open Select / listbox / datepicker. */
export function activeElementIsBlockingOverlayUi(
  active: Element | null = typeof document !== "undefined" ? document.activeElement : null,
): boolean {
  if (!active || !(active instanceof Element)) {
    return false;
  }
  try {
    if (active.closest(BLOCKING_OVERLAY_UI_SELECTOR)) {
      return true;
    }
    if (active.closest("[data-key-field-date-picker-panel]")) {
      return true;
    }
    if (active.getAttribute("aria-expanded") === "true") {
      const hasPopup = active.getAttribute("aria-haspopup");
      if (hasPopup === "listbox" || hasPopup === "menu" || hasPopup === "true") {
        return true;
      }
      if (active.getAttribute("role") === "combobox") {
        return true;
      }
    }
    if (active.getAttribute("data-state") === "open") {
      const role = active.getAttribute("role");
      if (role === "combobox" || role === "listbox" || active.getAttribute("aria-haspopup") === "listbox") {
        return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}

/** True when Select / Menu / Popover / datepicker dropdown UI is open on the page. */
export function pageHasBlockingOverlayUi(root: ParentNode = document): boolean {
  try {
    if (root.querySelector(BLOCKING_OVERLAY_UI_SELECTOR)) {
      return true;
    }
    if (root === document || root === document.documentElement || root === document.body) {
      return activeElementIsBlockingOverlayUi();
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Hard freeze for content-script overlay work: paint, focus restore, and
 * applying late autofill query results. Prefer this over bare selector checks.
 */
export function shouldFreezeOverlayUpdates(root: ParentNode = document): boolean {
  return pageHasBlockingOverlayUi(root) || activeElementIsBlockingOverlayUi();
}
