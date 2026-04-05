import * as React from "react";
import * as SelectPrimitive from "@radix-ui/react-select";

import { inputLikeControlClassName } from "../../lib/input-like-control-classes.js";
import { cn } from "../../lib/utils.js";
import { CheckIcon, ChevronDownIcon, ChevronUpIcon } from "./select-icons.js";
import { ScrollArea } from "./scroll-area.js";

export type SelectVariant = "default" | "inline";

export type SelectProps = React.ComponentPropsWithoutRef<typeof SelectPrimitive.Root> & {
  variant?: SelectVariant;
};

const SelectVariantContext = React.createContext<SelectVariant>("default");

function Select({ variant = "default", ...props }: SelectProps) {
  return (
    <SelectVariantContext.Provider value={variant}>
      <SelectPrimitive.Root {...props} />
    </SelectVariantContext.Provider>
  );
}

const SelectGroup = SelectPrimitive.Group;

const SelectValue = SelectPrimitive.Value;

const selectTriggerValueSlot =
  "[&>span]:min-w-0 [&>span]:truncate [&_[data-placeholder]]:text-muted-foreground";

const SelectTrigger = React.forwardRef<
  React.ComponentRef<typeof SelectPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>
>(({ className, children, ...props }, ref) => {
  const selectVariant = React.useContext(SelectVariantContext);

  return (
    <SelectPrimitive.Trigger
      ref={ref}
      className={cn(
        selectVariant === "inline"
          ? cn(
              "inline-flex h-auto w-auto max-w-full items-center gap-1 border-0 bg-transparent p-0 text-left text-sm font-medium text-foreground shadow-none outline-none",
              "transition-[color,opacity]",
              selectTriggerValueSlot,
              "hover:border-transparent hover:shadow-none dark:hover:border-transparent",
              "focus:border-transparent focus:shadow-none focus-visible:border-transparent focus-visible:shadow-none",
              "active:bg-transparent data-[state=open]:border-transparent data-[state=open]:bg-transparent data-[state=open]:shadow-none",
              "disabled:cursor-not-allowed disabled:opacity-50",
            )
          : cn(
              inputLikeControlClassName,
              "flex items-center justify-between gap-2 text-left",
              selectTriggerValueSlot,
              "data-[state=open]:border-accent data-[state=open]:bg-background data-[state=open]:outline-none data-[state=open]:shadow-[0_0_0_2px_hsl(var(--accent)/0.4)]",
            ),
        className,
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon asChild>
        <ChevronDownIcon
          className={cn("size-4 shrink-0", selectVariant === "inline" ? "opacity-60" : "opacity-50")}
        />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
});
SelectTrigger.displayName = SelectPrimitive.Trigger.displayName;

const SelectScrollUpButton = React.forwardRef<
  React.ComponentRef<typeof SelectPrimitive.ScrollUpButton>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollUpButton>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.ScrollUpButton
    ref={ref}
    className={cn("flex cursor-default items-center justify-center py-1 text-muted-foreground", className)}
    {...props}
  >
    <ChevronUpIcon className="size-4" />
  </SelectPrimitive.ScrollUpButton>
));
SelectScrollUpButton.displayName = SelectPrimitive.ScrollUpButton.displayName;

const SelectScrollDownButton = React.forwardRef<
  React.ComponentRef<typeof SelectPrimitive.ScrollDownButton>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollDownButton>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.ScrollDownButton
    ref={ref}
    className={cn("flex cursor-default items-center justify-center py-1 text-muted-foreground", className)}
    {...props}
  >
    <ChevronDownIcon className="size-4" />
  </SelectPrimitive.ScrollDownButton>
));
SelectScrollDownButton.displayName = SelectPrimitive.ScrollDownButton.displayName;

const SelectContent = React.forwardRef<
  React.ComponentRef<typeof SelectPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content>
>(({ className, children, position = "popper", ...props }, ref) => {
  const selectVariant = React.useContext(SelectVariantContext);

  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        ref={ref}
        className={cn(
          "relative z-50 max-h-96 overflow-hidden rounded-md border border-input bg-popover p-0 text-popover-foreground shadow-md",
          selectVariant === "inline"
            ? "min-w-[220px] w-max"
            : "w-[var(--radix-select-trigger-width)] min-w-[var(--radix-select-trigger-width)]",
          className,
        )}
        position={position}
        sideOffset={2}
        {...props}
      >
        <ScrollArea className="w-full max-h-[min(15rem,var(--radix-select-content-available-height,80vh))] shrink-0">
          <SelectPrimitive.Viewport
            className="w-full overflow-x-hidden p-1"
            /* Let ScrollArea own scrolling; Radix defaults would double-scroll */
            style={{ flex: "none", overflow: "visible" }}
          >
            {children}
          </SelectPrimitive.Viewport>
        </ScrollArea>
    </SelectPrimitive.Content>
  </SelectPrimitive.Portal>
  );
});
SelectContent.displayName = SelectPrimitive.Content.displayName;

const SelectLabel = React.forwardRef<
  React.ComponentRef<typeof SelectPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Label>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.Label ref={ref} className={cn("py-1.5 pl-8 pr-2 text-sm font-semibold", className)} {...props} />
));
SelectLabel.displayName = SelectPrimitive.Label.displayName;

const SelectItem = React.forwardRef<
  React.ComponentRef<typeof SelectPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Item
    ref={ref}
    className={cn(
      "relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm text-foreground outline-none data-[highlighted]:bg-secondary data-[highlighted]:text-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
      className,
    )}
    {...props}
  >
    <span className="absolute left-2 flex size-3.5 items-center justify-center">
      <SelectPrimitive.ItemIndicator>
        <CheckIcon className="size-4" />
      </SelectPrimitive.ItemIndicator>
    </span>
    <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
  </SelectPrimitive.Item>
));
SelectItem.displayName = SelectPrimitive.Item.displayName;

const SelectSeparator = React.forwardRef<
  React.ComponentRef<typeof SelectPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.Separator ref={ref} className={cn("-mx-1 my-1 h-px bg-muted", className)} {...props} />
));
SelectSeparator.displayName = SelectPrimitive.Separator.displayName;

export {
  Select,
  SelectGroup,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectLabel,
  SelectItem,
  SelectSeparator,
  SelectScrollUpButton,
  SelectScrollDownButton,
};
