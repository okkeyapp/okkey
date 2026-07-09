import { cn } from "@okkey/ui";

export const stickyHeaderSurfaceClassName = "sticky top-0 z-30 bg-background transition-shadow";

export function stickyHeaderShadowClassName(scrolled: boolean): string {
  return cn(
    scrolled && "shadow-[0_1px_3px_rgba(0,0,0,0.1)] dark:shadow-[0_1px_3px_rgba(0,0,0,0.35)]",
  );
}

export const stickyFooterSurfaceClassName = "relative z-10 shrink-0 bg-background transition-shadow";

export function stickyFooterShadowClassName(scrolled: boolean): string {
  return cn(
    scrolled && "shadow-[0_-1px_3px_rgba(0,0,0,0.1)] dark:shadow-[0_-1px_3px_rgba(0,0,0,0.35)]",
  );
}
