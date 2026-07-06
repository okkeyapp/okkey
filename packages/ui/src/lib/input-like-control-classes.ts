/**
 * Shared surface styles for single-line controls (Input, Select trigger, etc.).
 * Matches outline-style field: border, shadow, hover border, focus ring.
 */
import { cn } from "./utils.js";

export const inputLikeControlClassName =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground transition-[color,box-shadow,border-color] " +
  "shadow-[0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_1px_2px_rgba(255,255,255,0.05)] " +
  "placeholder:text-muted-foreground " +
  "hover:border-[color-mix(in_hsl,hsl(var(--input))_82%,hsl(var(--accent))_18%)] hover:shadow-none " +
  "dark:hover:border-[color-mix(in_hsl,hsl(var(--input))_76%,hsl(var(--accent))_24%)] " +
  "focus:bg-background focus-visible:bg-background active:bg-background " +
  "focus:outline-none focus:shadow-[0_0_0_2px_hsl(var(--accent)_/_0.4)] focus-visible:outline-none focus-visible:shadow-[0_0_0_2px_hsl(var(--accent)_/_0.4)] " +
  "dark:focus:shadow-[0_0_0_2px_hsl(var(--accent)_/_0.4)] dark:focus-visible:shadow-[0_0_0_2px_hsl(var(--accent)_/_0.4)] " +
  "focus:hover:border-accent focus-visible:hover:border-accent dark:focus:hover:border-accent dark:focus-visible:hover:border-accent " +
  "focus:hover:shadow-[0_0_0_2px_hsl(var(--accent)_/_0.4)] focus-visible:hover:shadow-[0_0_0_2px_hsl(var(--accent)_/_0.4)] " +
  "dark:focus:hover:shadow-[0_0_0_2px_hsl(var(--accent)_/_0.4)] dark:focus-visible:hover:shadow-[0_0_0_2px_hsl(var(--accent)_/_0.4)] " +
  "focus:border-accent focus-visible:border-accent " +
  "disabled:cursor-not-allowed disabled:opacity-50";

/** Border and focus ring on KeyField / KeySection title row — matches {@link inputLikeControlClassName}. */
export const keyFormFieldSurfaceTransitionClassName =
  "shadow-none transition-[color,box-shadow,border-color]";

/** Accent focus ring for a KeyField / KeySection surface (use with focus-within: or state). */
export const keyFormFieldSurfaceFocusRingClassName =
  "border-x-accent !border-y-accent shadow-[0_0_0_2px_hsl(var(--accent)_/_0.4)]";

/** Destructive validation ring for a KeyField surface. */
export const keyFormFieldSurfaceErrorRingClassName =
  "border-x-destructive border-y-destructive shadow-[0_0_0_2px_hsl(var(--destructive)_/_0.4)]";

/** Opaque light hover — visual match for `slate-200/90` over `--secondary`. */
export const mutedSurfaceHoverBgLightClassName =
  "color-mix(in_srgb,#e2e8f0_90%,hsl(var(--secondary))_10%)";

/** Opaque dark hover — visual match for `muted/80` over `--secondary`. */
export const mutedSurfaceHoverBgDarkClassName =
  "color-mix(in_srgb,hsl(var(--muted))_80%,hsl(var(--secondary))_20%)";

/** Opaque dark open — visual match for `muted/90` over `--secondary`. */
export const mutedSurfaceOpenBgDarkClassName =
  "color-mix(in_srgb,hsl(var(--muted))_90%,hsl(var(--secondary))_10%)";

/** Hover background for tags, filters, and secondary list/key-form surfaces. */
export const mutedSurfaceHoverBgClassName =
  "hover:bg-[color-mix(in_srgb,#e2e8f0_90%,hsl(var(--secondary))_10%)] dark:hover:bg-[color-mix(in_srgb,hsl(var(--muted))_80%,hsl(var(--secondary))_20%)]";

/** Active/pressed background matching {@link mutedSurfaceHoverBgClassName}. */
export const mutedSurfaceActiveBgClassName =
  "bg-[color-mix(in_srgb,#e2e8f0_90%,hsl(var(--secondary))_10%)] dark:bg-[color-mix(in_srgb,hsl(var(--muted))_80%,hsl(var(--secondary))_20%)]";

/** {@link mutedSurfaceHoverBgClassName} with `!` to override component variants (e.g. ghost Button). */
export const mutedSurfaceHoverBgImportantClassName =
  "hover:!bg-[color-mix(in_srgb,#e2e8f0_90%,hsl(var(--secondary))_10%)] dark:hover:!bg-[color-mix(in_srgb,hsl(var(--muted))_80%,hsl(var(--secondary))_20%)]";

/** {@link mutedSurfaceActiveBgClassName} with `!` to override component variants. */
export const mutedSurfaceActiveBgImportantClassName =
  "!bg-[color-mix(in_srgb,#e2e8f0_90%,hsl(var(--secondary))_10%)] dark:!bg-[color-mix(in_srgb,hsl(var(--muted))_80%,hsl(var(--secondary))_20%)]";

/** Open menu/trigger background (dark uses 90% muted blend). */
export const mutedSurfaceOpenBgClassName =
  "data-[state=open]:bg-[color-mix(in_srgb,#e2e8f0_90%,hsl(var(--secondary))_10%)] dark:data-[state=open]:bg-[color-mix(in_srgb,hsl(var(--muted))_90%,hsl(var(--secondary))_10%)]";

/** {@link mutedSurfaceOpenBgClassName} with `!` to override component variants. */
export const mutedSurfaceOpenBgImportantClassName =
  "data-[state=open]:!bg-[color-mix(in_srgb,#e2e8f0_90%,hsl(var(--secondary))_10%)] dark:data-[state=open]:!bg-[color-mix(in_srgb,hsl(var(--muted))_90%,hsl(var(--secondary))_10%)]";

/** Divider on additional (gray) KeyForm sections — one step lighter than `--secondary`. */
export const keyFormAdditionalDividerBorderYClassName =
  "border-y-[color-mix(in_hsl,hsl(var(--secondary))_94%,hsl(var(--foreground))_6%)] dark:border-y-[color-mix(in_hsl,hsl(var(--secondary))_92%,hsl(var(--foreground))_8%)] focus-within:!border-y-accent";

export const keyFormAdditionalDividerBorderBClassName =
  "border-b-[color-mix(in_hsl,hsl(var(--secondary))_94%,hsl(var(--foreground))_6%)] dark:border-b-[color-mix(in_hsl,hsl(var(--secondary))_92%,hsl(var(--foreground))_8%)] focus-within:!border-b-accent";

export const keyFormAdditionalDividerBorderTClassName =
  "border-t-[color-mix(in_hsl,hsl(var(--secondary))_94%,hsl(var(--foreground))_6%)] dark:border-t-[color-mix(in_hsl,hsl(var(--secondary))_92%,hsl(var(--foreground))_8%)] focus-within:!border-t-accent focus-visible:!border-t-accent";

/** Borders between fields in additional sections — hides outer top/bottom on first/last row. */
export function keyFormAdditionalFieldBorderClassName(options: {
  isFirst: boolean;
  isLast: boolean;
  showTrailingBottomBorder?: boolean;
}): string {
  const { isFirst, isLast, showTrailingBottomBorder = false } = options;
  return cn(
    "border-x-transparent",
    keyFormAdditionalDividerBorderYClassName,
    isFirst && "!border-t-transparent",
    isFirst && "!mt-0",
    isLast && (showTrailingBottomBorder ? keyFormAdditionalDividerBorderBClassName : "!border-b-transparent"),
  );
}
