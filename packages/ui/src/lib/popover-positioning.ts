/**
 * Shared Tailwind classes for date/time (and other tall) popover panels so
 * Radix collision handling can flip/shift and keep content inside the viewport.
 *
 * Consumers should prefer flexible `max-h` / `max-w` over fixed `h-*` / `w-*` so
 * the panel can shrink when available space is smaller than the preferred size.
 */

/** Horizontal/vertical inset matching Radix `collisionPadding` (16px ≈ 1rem). */
export const DATE_TIME_PICKER_VIEWPORT_MARGIN_PX = 16;

/** Default gap between the trigger and the popover (Radix `sideOffset`). */
export const DATE_TIME_PICKER_SIDE_OFFSET_PX = 4;

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

export type DateTimePickerPlacementSide = "top" | "bottom";

export type DateTimePickerPlacement = {
  side: DateTimePickerPlacementSide;
  /** Usable height for the popover on the chosen side (already subtracts margin + offset). */
  availableHeight: number;
  /** Cap for popover height: min(preferred, available). */
  maxHeight: number;
};

/**
 * Prefer the vertical side with more free space and cap the popover height to it.
 * Mirrors Radix flip + `--radix-popover-content-available-height` for tests / hosts
 * that compute placement from an anchor rect.
 */
export function resolveDateTimePickerPlacement(
  anchor: { top: number; bottom: number },
  viewportHeight: number,
  preferredHeight: number,
  margin: number = DATE_TIME_PICKER_VIEWPORT_MARGIN_PX,
  sideOffset: number = DATE_TIME_PICKER_SIDE_OFFSET_PX,
): DateTimePickerPlacement {
  const spaceBelow = Math.max(0, viewportHeight - anchor.bottom - margin - sideOffset);
  const spaceAbove = Math.max(0, anchor.top - margin - sideOffset);
  const side: DateTimePickerPlacementSide = spaceBelow >= spaceAbove ? "bottom" : "top";
  const availableHeight = side === "bottom" ? spaceBelow : spaceAbove;
  return {
    side,
    availableHeight,
    maxHeight: Math.min(preferredHeight, availableHeight),
  };
}

export const POPOVER_VIEWPORT_MAX_HEIGHT_CLASS =
  "max-h-[min(100dvh,var(--radix-popover-content-available-height,100dvh))]";

/** Keep wide date+time panels inside the viewport (e.g. 375px phones). */
export const POPOVER_VIEWPORT_MAX_WIDTH_CLASS = "max-w-[calc(100vw-2rem)]";

/**
 * @deprecated Body is `flex-1` under the popover max-height; kept for export stability.
 * Prefer the body layout scroll class instead of a separate max-height on the body.
 */
export const DATE_TIME_PICKER_BODY_MAX_HEIGHT_CLASS =
  "max-h-[min(22rem,calc(var(--radix-popover-content-available-height,100dvh)-3.5rem))]";

/**
 * Body: single scroll container for calendar + time. Stacks on narrow viewports,
 * side-by-side from `sm`. Footer stays outside this node so Done remains visible.
 */
export const DATE_TIME_PICKER_BODY_LAYOUT_CLASS =
  "flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden overflow-y-auto sm:flex-row";

/**
 * Calendar host: natural height when stacked (body scrolls); from `sm` it can
 * shrink/scroll beside the time columns.
 */
export const DATE_TIME_PICKER_CALENDAR_SCROLL_CLASS =
  "min-w-0 shrink-0 sm:min-h-0 sm:flex-1 sm:overflow-y-auto";

/**
 * Time columns host: natural contribution when stacked (lists keep their own
 * internal scroll height); fill beside the calendar from `sm`.
 */
export const DATE_TIME_PICKER_TIME_COLUMN_CLASS =
  "flex min-h-0 w-full shrink-0 flex-col border-t sm:h-auto sm:min-h-0 sm:w-auto sm:min-w-[7rem] sm:self-stretch sm:border-l sm:border-t-0";

/** Hour/minute ScrollArea height: fixed when stacked, fill when beside calendar. */
export const DATE_TIME_PICKER_TIME_SCROLL_CLASS =
  "h-40 min-h-0 min-w-0 w-12 flex-1 sm:h-full sm:w-14";

export const DATE_TIME_PICKER_POPOVER_CONTENT_CLASS = [
  "flex w-auto flex-col overflow-hidden p-0",
  POPOVER_VIEWPORT_MAX_WIDTH_CLASS,
  POPOVER_VIEWPORT_MAX_HEIGHT_CLASS,
].join(" ");
