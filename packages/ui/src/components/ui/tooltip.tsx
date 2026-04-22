import * as React from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";

import { cn } from "../../lib/utils.js";

const TooltipProvider = TooltipPrimitive.Provider;

const Tooltip = TooltipPrimitive.Root;

const TooltipTrigger = TooltipPrimitive.Trigger;

export type TooltipContentProps = React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>;

const TooltipContent = React.forwardRef<React.ComponentRef<typeof TooltipPrimitive.Content>, TooltipContentProps>(
  ({ className, children, sideOffset = 4, ...props }, ref) => (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        ref={ref}
        sideOffset={sideOffset}
        className={cn(
          "z-50 max-w-xs overflow-hidden rounded-md border-0 bg-foreground px-3 py-1.5 text-sm text-background shadow-md",
          className,
        )}
        {...props}
      >
        {children}
        <TooltipPrimitive.Arrow className="-translate-y-px fill-foreground" width={11} height={5} />
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  ),
);
TooltipContent.displayName = TooltipPrimitive.Content.displayName;

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider };
