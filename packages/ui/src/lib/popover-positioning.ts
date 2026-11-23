/**
 * Shared Tailwind classes for date/time (and other tall) popover panels so
 * Radix collision handling can flip/shift and keep content inside the viewport.
 *
 * Consumers should prefer flexible `max-h` / `max-w` over fixed `h-*` / `w-*` so
 * the panel can shrink when available space is smaller than the preferred size.
 */

/** Horizontal/vertical inset matching Radix `collisionPadding` (16px ≈ 1rem). */
export const DATE_TIME_PICKER_VIEWPORT_MARGIN_PX = 16;

/**
 * Clamp a preferred popover size into the viewport with margins.
 * Mirrors CSS `max-w-[calc(100vw-2rem)]` / available-height max-height.
 */
export function clampDateTimePickerSize(
  preferredWidth: number,
  preferredHeight: number,
  viewportWidth: number,
  viewportHeight: number,
  margin: number = DATE_TIME_PICKER_VIEWPORT_MARGIN_PX,
): { width: number; height: number } {
  const maxWidth = Math.max(0, viewportWidth - margin * 2);
  const maxHeight = Math.max(0, viewportHeight - margin * 2);
  return {
    width: Math.min(preferredWidth, maxWidth),
    height: Math.min(preferredHeight, maxHeight),
  };
}

export const POPOVER_VIEWPORT_MAX_HEIGHT_CLASS =
  "max-h-[min(100dvh,var(--radix-popover-content-available-height,100dvh))]";

/** Keep wide date+time panels inside the viewport (e.g. 375px phones). */
export const POPOVER_VIEWPORT_MAX_WIDTH_CLASS = "max-w-[calc(100vw-2rem)]";

/** Preferred height budget for the calendar + time columns body (excludes footer). */
export const DATE_TIME_PICKER_BODY_MAX_HEIGHT_CLASS =
  "max-h-[min(22rem,calc(var(--radix-popover-content-available-height,100dvh)-3.5rem))]";

/**
 * Body row: stacks calendar above time columns on narrow viewports, side-by-side
 * from `sm` up. Calendar scrolls internally when height is constrained.
 */
export const DATE_TIME_PICKER_BODY_LAYOUT_CLASS =
  "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden sm:flex-row";

/**
 * Scrollable calendar host. On narrow (stacked) layouts keep a usable month-grid
 * min-height so the time column cannot collapse it to 0; from `sm` up, allow
 * flex shrink beside the time columns.
 */
export const DATE_TIME_PICKER_CALENDAR_SCROLL_CLASS =
  "min-h-[12rem] min-w-0 flex-1 overflow-x-hidden overflow-y-auto sm:min-h-0";

/**
 * Time columns host: capped height when stacked under the calendar so hour/minute
 * lists scroll instead of eating the popup; unrestricted beside the calendar from `sm`.
 */
export const DATE_TIME_PICKER_TIME_COLUMN_CLASS =
  "flex h-[9rem] min-h-0 w-full shrink-0 flex-col overflow-hidden border-t sm:h-auto sm:w-auto sm:min-w-[7rem] sm:border-l sm:border-t-0";

export const DATE_TIME_PICKER_POPOVER_CONTENT_CLASS = [
  "flex w-auto flex-col overflow-hidden p-0",
  POPOVER_VIEWPORT_MAX_WIDTH_CLASS,
  POPOVER_VIEWPORT_MAX_HEIGHT_CLASS,
].join(" ");
