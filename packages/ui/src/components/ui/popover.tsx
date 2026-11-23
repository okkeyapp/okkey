import * as React from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";

import { POPOVER_VIEWPORT_MAX_HEIGHT_CLASS } from "../../lib/popover-positioning.js";
import { usePortalContainer } from "../../lib/portal-container.js";
import { cn } from "../../lib/utils.js";

const Popover = PopoverPrimitive.Root;

const PopoverTrigger = PopoverPrimitive.Trigger;

const PopoverAnchor = PopoverPrimitive.Anchor;

export type PopoverContentProps = React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>;

const PopoverContent = React.forwardRef<
  React.ComponentRef<typeof PopoverPrimitive.Content>,
  PopoverContentProps
>(
  (
    {
      className,
      align = "center",
      sideOffset = 4,
      collisionPadding = 16,
      avoidCollisions = true,
      ...props
    },
    ref,
  ) => {
    const portalContainer = usePortalContainer();
    return (
      <PopoverPrimitive.Portal container={portalContainer}>
        <PopoverPrimitive.Content
          ref={ref}
          align={align}
          sideOffset={sideOffset}
          collisionPadding={collisionPadding}
          avoidCollisions={avoidCollisions}
          className={cn(
            "z-floating flex w-auto flex-col overflow-hidden rounded-md bg-popover p-0 text-popover-foreground outline-none",
            POPOVER_VIEWPORT_MAX_HEIGHT_CLASS,
            "shadow-[0_4px_16px_hsl(var(--shadow)/0.1),0_0_0_1px_hsl(var(--shadow)/0.05)]",
            "dark:shadow-[0_8px_28px_rgba(0,0,0,0.45),0_0_0_3px_rgba(255,255,255,0.1)]",
            className,
          )}
          {...props}
          data-slot="popover-content"
        />
      </PopoverPrimitive.Portal>
    );
  },
);
PopoverContent.displayName = PopoverPrimitive.Content.displayName;

export { Popover, PopoverAnchor, PopoverContent, PopoverTrigger };
