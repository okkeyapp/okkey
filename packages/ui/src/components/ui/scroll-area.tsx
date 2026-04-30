import * as React from "react";
import * as ScrollAreaPrimitive from "@radix-ui/react-scroll-area";

import { cn } from "../../lib/utils.js";

/**
 * Works with **max-height** on the root (e.g. `max-h-60` or arbitrary `max-h-[min(...)]`) — no fixed `h-*` needed.
 * The viewport uses `max-height: inherit` so it caps to the same limit while the root grows with short content.
 */
const ScrollArea = React.forwardRef<
  React.ComponentRef<typeof ScrollAreaPrimitive.ScrollArea>,
  React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.ScrollArea>
>(({ className, children, ...props }, ref) => (
  <ScrollAreaPrimitive.ScrollArea
    ref={ref}
    className={cn("relative w-full overflow-hidden", className)}
    {...props}
  >
    <ScrollAreaPrimitive.ScrollAreaViewport className="h-full max-h-[inherit] min-h-0 w-full rounded-[inherit] [&>div]:!block [&>div]:min-h-0 [&>div]:min-w-0">
      {children}
    </ScrollAreaPrimitive.ScrollAreaViewport>
    <ScrollBar />
    <ScrollAreaPrimitive.ScrollAreaCorner />
  </ScrollAreaPrimitive.ScrollArea>
));
ScrollArea.displayName = ScrollAreaPrimitive.ScrollArea.displayName;

const ScrollBar = React.forwardRef<
  React.ComponentRef<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>,
  React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>
>(({ className, orientation = "vertical", ...props }, ref) => (
  <ScrollAreaPrimitive.ScrollAreaScrollbar
    ref={ref}
    orientation={orientation}
    className={cn(
      "flex touch-none select-none transition-colors",
      orientation === "vertical" && "h-full w-2.5 border-l border-l-transparent p-px",
      orientation === "horizontal" && "h-2.5 flex-col border-t border-t-transparent p-px",
      className,
    )}
    {...props}
  >
    <ScrollAreaPrimitive.ScrollAreaThumb className="relative flex-1 rounded-full bg-[rgba(0,0,0,0.05)] dark:bg-[rgba(255,255,255,0.08)]" />
  </ScrollAreaPrimitive.ScrollAreaScrollbar>
));
ScrollBar.displayName = ScrollAreaPrimitive.ScrollAreaScrollbar.displayName;

export { ScrollArea, ScrollBar };
