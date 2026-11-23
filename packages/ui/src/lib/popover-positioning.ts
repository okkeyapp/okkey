/**
 * Shared Tailwind classes for date/time (and other tall) popover panels so
 * Radix collision handling can flip/shift and keep content inside the viewport.
 *
 * Consumers should prefer flexible `max-h` over fixed `h-*` so the panel can
 * shrink when `--radix-popover-content-available-height` is smaller than the
 * preferred size.
 */
export const POPOVER_VIEWPORT_MAX_HEIGHT_CLASS =
  "max-h-[min(100dvh,var(--radix-popover-content-available-height,100dvh))]";

/** Preferred height budget for the calendar + time columns body (excludes footer). */
export const DATE_TIME_PICKER_BODY_MAX_HEIGHT_CLASS =
  "max-h-[min(22rem,calc(var(--radix-popover-content-available-height,100dvh)-3.5rem))]";

export const DATE_TIME_PICKER_POPOVER_CONTENT_CLASS = [
  "flex w-auto flex-col overflow-hidden p-0",
  POPOVER_VIEWPORT_MAX_HEIGHT_CLASS,
].join(" ");
