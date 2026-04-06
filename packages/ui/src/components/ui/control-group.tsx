import * as React from "react";

import { cn } from "../../lib/utils.js";

/** Use on inputs / default select triggers that should share row width in a group. */
export const controlGroupItemGrowClassName = "min-w-0 flex-1";

/** Use on compact controls (icon button, icon select) so they do not stretch to full width. */
export const controlGroupItemFixedClassName = "w-auto shrink-0";

/**
 * Horizontal merge: no gap, shared outer radius, 0 radius at inner seams; inner seam uses 1px overlap (`-ml-px`), not `border-l-0`.
 * Place controls as direct children (Button, Input, Select + SelectTrigger, etc.).
 */
export const controlGroupClassName =
  "flex w-full min-w-0 flex-row items-stretch isolate " +
  "[&>*]:relative [&>*]:z-[1] " +
  "[&>*:hover]:z-[2] " +
  "[&>*:focus]:z-[3] [&>*:focus-visible]:z-[3] [&>*:active]:z-[3] " +
  "[&>*[data-state=open]]:z-[3] " +
  "[&>*]:rounded-none " +
  "[&>*:first-child]:rounded-l-md " +
  "[&>*:last-child]:rounded-r-md " +
  "[&>*:only-child]:rounded-md " +
  "[&>*:not(:first-child)]:-ml-px";

export type ControlGroupProps = React.ComponentProps<"div">;

const ControlGroup = React.forwardRef<HTMLDivElement, ControlGroupProps>(
  ({ className, role = "group", ...props }, ref) => (
    <div ref={ref} role={role} className={cn(controlGroupClassName, className)} {...props} />
  ),
);
ControlGroup.displayName = "ControlGroup";

export { ControlGroup };
