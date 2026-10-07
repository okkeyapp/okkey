/**
 * Selectors for page UI that the autofill content-script must not disturb
 * (overlay paint, focus restore, scroll/resize reposition).
 *
 * Notes:
 * - Radix Select Content does **not** set `data-radix-select-content`; the open
 *   portal exposes `data-radix-select-viewport` + `role="listbox"`.
 * - Calendar month/year (`CalendarMonthYearCaption`) are Radix Selects, often
 *   portaled outside `[data-key-field-date-picker-panel]` / Popover.
 * - Our Popover sets `data-slot="popover-content"` (no `data-radix-popover-content`).
 */
export const BLOCKING_OVERLAY_UI_SELECTOR = [
  // Radix Select (month/year caption + ordinary Selects)
  "[data-radix-select-viewport]",
  "[data-radix-select-content]",
  '[role="listbox"][data-state="open"]',
  '[role="combobox"][data-state="open"]',
  '[role="combobox"][aria-expanded="true"]',
  '[aria-expanded="true"][aria-haspopup="listbox"]',
  // Radix Menu / Dropdown
  "[data-radix-menu-content]",
  "[data-radix-dropdown-menu-content]",
  '[aria-expanded="true"][aria-haspopup="menu"]',
  // Popover / dialog (capsule calendar, etc.)
  "[data-radix-popover-content]",
  '[data-slot="popover-content"]',
  '[role="dialog"][data-state="open"]',
  "[data-radix-popper-content-wrapper]",
  // Key-field datepicker hosts Calendar + month/year Selects
  "[data-key-field-date-picker-panel]",
  // Native <select>
  "select:focus",
].join(",");

/** True when Select / Menu / Popover / datepicker dropdown UI is open on the page. */
export function pageHasBlockingOverlayUi(root: ParentNode = document): boolean {
  try {
    return Boolean(root.querySelector(BLOCKING_OVERLAY_UI_SELECTOR));
  } catch {
    return false;
  }
}
