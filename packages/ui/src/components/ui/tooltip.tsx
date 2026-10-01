import * as React from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";

import { cn } from "../../lib/utils.js";

type TooltipProviderProps = React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Provider>;

/**
 * Defaults `disableHoverableContent` so leaving the trigger closes immediately —
 * pointer-events-none alone is not enough; Radix otherwise keeps the tooltip open
 * while the pointer moves onto the content.
 */
function TooltipProvider({ disableHoverableContent = true, ...props }: TooltipProviderProps) {
  return <TooltipPrimitive.Provider disableHoverableContent={disableHoverableContent} {...props} />;
}

type TooltipProps = React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Root>;

function Tooltip({ disableHoverableContent = true, ...props }: TooltipProps) {
  return <TooltipPrimitive.Root disableHoverableContent={disableHoverableContent} {...props} />;
}

const TooltipTrigger = TooltipPrimitive.Trigger;

export type TooltipContentProps = React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>;

const TooltipContent = React.forwardRef<React.ComponentRef<typeof TooltipPrimitive.Content>, TooltipContentProps>(
  ({ className, children, sideOffset = 4, ...props }, ref) => (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        ref={ref}
        sideOffset={sideOffset}
        className={cn(
          // Pass-through so tooltips never block clicks / hover on elements underneath.
          "pointer-events-none z-tooltip max-w-xs overflow-hidden rounded-md border-0 bg-foreground px-3 py-1.5 text-sm text-background shadow-md",
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
