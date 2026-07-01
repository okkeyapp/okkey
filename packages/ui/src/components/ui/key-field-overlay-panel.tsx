import * as React from "react";

import { cn } from "../../lib/utils.js";

export type KeyFieldOverlayPanelProps = React.ComponentPropsWithoutRef<"div">;

export const keyFieldOverlayPanelClassName = cn("absolute left-0 top-full z-50 mt-2");

const keyFieldOverlayPanelSurfaceClassName = cn(
  "relative overflow-hidden rounded-md bg-popover p-3 text-popover-foreground",
  "shadow-[0_4px_16px_rgba(0,0,0,0.1),0_0_0_1px_rgba(0,0,0,0.05)]",
  "dark:shadow-[0_8px_28px_rgba(0,0,0,0.45),0_0_0_1px_rgba(255,255,255,0.1)]",
);

export function KeyFieldOverlayPanel({ className, children, ...props }: KeyFieldOverlayPanelProps) {
  return (
    <div
      className={keyFieldOverlayPanelClassName}
      onPointerDown={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      {...props}
    >
      <span
        className="absolute -top-1.5 left-4 z-10 size-3 rotate-45 bg-popover shadow-[-1px_-1px_0_rgba(0,0,0,0.05)] dark:shadow-[-1px_-1px_0_rgba(255,255,255,0.1)]"
        aria-hidden
      />
      <div className={cn(keyFieldOverlayPanelSurfaceClassName, className)}>{children}</div>
    </div>
  );
}
