import * as React from "react";
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";

import { cn } from "../../lib/utils.js";

const DropdownMenu = DropdownMenuPrimitive.Root;

const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;

const DropdownMenuGroup = DropdownMenuPrimitive.Group;

const DropdownMenuPortal = DropdownMenuPrimitive.Portal;

export type DropdownMenuContentProps = React.ComponentPropsWithoutRef<
  typeof DropdownMenuPrimitive.Content
> & {
  /**
   * Radix Menu types omit this, but Content forwards it. Avoid `preventDefault()` here: Radix
   * composes handlers so that blocks moving focus into the menu surface, the focus trap does
   * not engage, and Tab will leave the menu for the rest of the page. Default behavior focuses
   * the menu panel (not the first item); use ArrowDown / hover to highlight items.
   */
  onOpenAutoFocus?: (event: Event) => void;
};

const DropdownMenuContent = React.forwardRef<
  React.ComponentRef<typeof DropdownMenuPrimitive.Content>,
  DropdownMenuContentProps
>(({ className, sideOffset = 4, collisionPadding = 16, onOpenAutoFocus, ...props }, ref) => (
  <DropdownMenuPrimitive.Portal>
    <DropdownMenuPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      collisionPadding={collisionPadding}
      className={cn(
        "z-[100] min-w-[10rem] overflow-visible rounded-md bg-popover p-0 text-popover-foreground",
        "shadow-[0_4px_16px_rgba(0,0,0,0.1),0_0_0_1px_rgba(0,0,0,0.05)]",
        "dark:shadow-[0_8px_28px_rgba(0,0,0,0.45),0_0_0_1px_rgba(255,255,255,0.1)]",
        className,
      )}
      {...props}
      // Runtime prop; omitted from Radix Menu Content .d.ts (private MenuContentImpl).
      {...(onOpenAutoFocus !== undefined ? { onOpenAutoFocus } : {})}
    />
  </DropdownMenuPrimitive.Portal>
));
DropdownMenuContent.displayName = DropdownMenuPrimitive.Content.displayName;

const DropdownMenuItem = React.forwardRef<
  React.ComponentRef<typeof DropdownMenuPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Item>
>(({ className, onFocus, onBlur, "aria-selected": ariaSelectedProp, ...props }, ref) => {
  const [isActive, setIsActive] = React.useState(false);

  return (
    <DropdownMenuPrimitive.Item
      ref={ref}
      className={cn(
        "relative flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-2 text-sm text-foreground outline-none",
        "data-[highlighted]:bg-secondary data-[highlighted]:text-foreground",
        "data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        className,
      )}
      {...props}
      aria-selected={ariaSelectedProp ?? isActive}
      onFocus={(event) => {
        onFocus?.(event);
        setIsActive(true);
      }}
      onBlur={(event) => {
        onBlur?.(event);
        setIsActive(false);
      }}
    />
  );
});
DropdownMenuItem.displayName = DropdownMenuPrimitive.Item.displayName;

const DropdownMenuSeparator = React.forwardRef<
  React.ComponentRef<typeof DropdownMenuPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <DropdownMenuPrimitive.Separator ref={ref} className={cn("-mx-1 my-1 h-px bg-muted", className)} {...props} />
));
DropdownMenuSeparator.displayName = DropdownMenuPrimitive.Separator.displayName;

const DropdownMenuSub = DropdownMenuPrimitive.Sub;

const DropdownMenuSubTrigger = React.forwardRef<
  React.ComponentRef<typeof DropdownMenuPrimitive.SubTrigger>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.SubTrigger>
>(({ className, ...props }, ref) => (
  <DropdownMenuPrimitive.SubTrigger
    ref={ref}
    className={cn(
      "relative flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-2 text-sm text-foreground outline-none",
      "data-[highlighted]:bg-secondary data-[highlighted]:text-foreground data-[state=open]:bg-secondary",
      className,
    )}
    {...props}
  />
));
DropdownMenuSubTrigger.displayName = DropdownMenuPrimitive.SubTrigger.displayName;

const DropdownMenuSubContent = React.forwardRef<
  React.ComponentRef<typeof DropdownMenuPrimitive.SubContent>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.SubContent>
>(({ className, sideOffset = 6, collisionPadding = 16, ...props }, ref) => (
  <DropdownMenuPrimitive.SubContent
    ref={ref}
    sideOffset={sideOffset}
    collisionPadding={collisionPadding}
    className={cn(
      "z-[100] min-w-[10rem] overflow-hidden rounded-md bg-popover p-0 text-popover-foreground",
      "shadow-[0_4px_16px_rgba(0,0,0,0.1),0_0_0_1px_rgba(0,0,0,0.05)]",
      "dark:shadow-[0_8px_28px_rgba(0,0,0,0.45),0_0_0_1px_rgba(255,255,255,0.1)]",
      className,
    )}
    {...props}
  />
));
DropdownMenuSubContent.displayName = DropdownMenuPrimitive.SubContent.displayName;

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuGroup,
  DropdownMenuPortal,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
};
