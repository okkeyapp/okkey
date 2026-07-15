import * as React from "react";
import * as SelectPrimitive from "@radix-ui/react-select";
import type { VariantProps } from "class-variance-authority";

import { inputLikeControlClassName } from "../../lib/input-like-control-classes.js";
import { cn } from "../../lib/utils.js";
import { buttonVariants } from "./button.js";
import { CheckIcon, ChevronDownIcon, ChevronUpIcon } from "./select-icons.js";
import { ScrollArea } from "./scroll-area.js";

export type SelectVariant = "default" | "inline" | "button";

export type SelectProps = React.ComponentPropsWithoutRef<typeof SelectPrimitive.Root> & {
  variant?: SelectVariant;
  /** Used when `variant` is `"button"` — same `variant` / `size` as `Button`. */
  buttonVariant?: VariantProps<typeof buttonVariants>["variant"];
  buttonSize?: VariantProps<typeof buttonVariants>["size"];
};

type SelectUiContextValue = {
  triggerVariant: SelectVariant;
  buttonVariant: NonNullable<VariantProps<typeof buttonVariants>["variant"]>;
  buttonSize: NonNullable<VariantProps<typeof buttonVariants>["size"]>;
};

const SelectUiContext = React.createContext<SelectUiContextValue>({
  triggerVariant: "default",
  buttonVariant: "default",
  buttonSize: "default",
});

type SelectButtonVisualVariant = NonNullable<VariantProps<typeof buttonVariants>["variant"]>;

const SELECT_ICON_BUTTON_SIZES: ReadonlySet<string> = new Set(["icon", "iconSm", "iconLg"]);

function isSelectIconButtonSize(size: string): boolean {
  return SELECT_ICON_BUTTON_SIZES.has(size);
}

/** Open trigger = same look as Button `:focus` + `:hover` (ring/border + hover surface). */
function selectButtonOpenMatchesFocusAndHoverClassName(v: SelectButtonVisualVariant): string {
  const accentRing =
    "data-[state=open]:outline-none data-[state=open]:shadow-[0_0_0_2px_hsl(var(--accent)_/_0.4)] dark:data-[state=open]:shadow-[0_0_0_2px_hsl(var(--accent)_/_0.4)]";
  const accentRingIfHoveredWhileOpen =
    "data-[state=open]:hover:shadow-[0_0_0_2px_hsl(var(--accent)_/_0.4)] dark:data-[state=open]:hover:shadow-[0_0_0_2px_hsl(var(--accent)_/_0.4)]";

  switch (v) {
    case "default":
      return cn(accentRing, accentRingIfHoveredWhileOpen, "data-[state=open]:bg-primary/85");
    case "secondary":
      return cn(
        accentRing,
        accentRingIfHoveredWhileOpen,
        "data-[state=open]:bg-[color-mix(in_hsl,hsl(var(--secondary))_97%,hsl(var(--foreground))_3%)] dark:data-[state=open]:bg-[color-mix(in_hsl,hsl(var(--secondary))_97%,hsl(var(--foreground))_3%)]",
      );
    case "ghost":
      return cn(accentRing, accentRingIfHoveredWhileOpen, "data-[state=open]:bg-muted");
    case "link":
      return cn(accentRing, accentRingIfHoveredWhileOpen, "data-[state=open]:underline");
    case "destructive":
      return cn(
        "data-[state=open]:outline-none data-[state=open]:bg-destructive/85 data-[state=open]:text-destructive-foreground",
        "data-[state=open]:shadow-[0_0_0_2px_hsl(var(--destructive)_/_0.4)] dark:data-[state=open]:shadow-[0_0_0_2px_hsl(var(--destructive)_/_0.4)]",
        "data-[state=open]:hover:shadow-[0_0_0_2px_hsl(var(--destructive)_/_0.4)] dark:data-[state=open]:hover:shadow-[0_0_0_2px_hsl(var(--destructive)_/_0.4)]",
      );
    case "outline":
      return cn(
        accentRing,
        accentRingIfHoveredWhileOpen,
        "data-[state=open]:outline-none data-[state=open]:border-accent",
        "data-[state=open]:bg-muted data-[state=open]:text-foreground",
        "data-[state=open]:hover:border-accent dark:data-[state=open]:hover:border-accent",
      );
    default: {
      const _exhaustive: never = v;
      return _exhaustive;
    }
  }
}

function Select({
  variant = "default",
  buttonVariant = "default",
  buttonSize = "default",
  ...props
}: SelectProps) {
  const value = React.useMemo<SelectUiContextValue>(
    () => ({
      triggerVariant: variant,
      buttonVariant: buttonVariant ?? "default",
      buttonSize: buttonSize ?? "default",
    }),
    [variant, buttonVariant, buttonSize],
  );

  return (
    <SelectUiContext.Provider value={value}>
      <SelectPrimitive.Root {...props} />
    </SelectUiContext.Provider>
  );
}

const SelectGroup = SelectPrimitive.Group;

const SelectValue = SelectPrimitive.Value;

const selectTriggerValueSlot =
  "[&>span]:min-w-0 [&>span]:truncate [&_[data-placeholder]]:text-muted-foreground";

/** Placeholder inherits trigger text color (for primary / secondary button surfaces). */
const selectTriggerButtonValueSlot =
  "[&>span]:min-w-0 [&>span]:truncate [&_[data-placeholder]]:text-inherit [&_[data-placeholder]]:opacity-60";

/** Icon-only button trigger: keep SelectValue in DOM for a11y/Radix, hide label visually (truncate would keep text visible). */
const selectTriggerButtonIconValueSlot =
  "[&>span]:pointer-events-none [&>span]:sr-only [&>span]:min-w-0 [&_[data-placeholder]]:text-inherit [&_[data-placeholder]]:opacity-60";

const SelectTrigger = React.forwardRef<
  React.ComponentRef<typeof SelectPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>
>(({ className, children, ...props }, ref) => {
  const { triggerVariant, buttonVariant, buttonSize } = React.useContext(SelectUiContext);

  const chevronOpacity = triggerVariant === "inline" ? "opacity-60" : "opacity-50";

  return (
    <SelectPrimitive.Trigger
      ref={ref}
      className={cn(
        triggerVariant === "inline"
          ? cn(
              "inline-flex h-auto w-auto max-w-full items-center gap-1 border-0 bg-transparent p-0 text-left text-sm font-medium text-foreground shadow-none outline-none",
              "transition-[color,opacity]",
              selectTriggerValueSlot,
              "hover:border-transparent hover:text-accent hover:shadow-none dark:hover:border-transparent",
              "focus:border-transparent focus:shadow-none focus-visible:border-transparent focus-visible:shadow-none",
              "active:bg-transparent data-[state=open]:border-transparent data-[state=open]:bg-transparent data-[state=open]:text-accent data-[state=open]:shadow-none",
              "disabled:cursor-not-allowed disabled:opacity-50",
            )
          : triggerVariant === "button"
            ? cn(
                buttonVariants({ variant: buttonVariant, size: buttonSize }),
                isSelectIconButtonSize(buttonSize)
                  ? selectTriggerButtonIconValueSlot
                  : selectTriggerButtonValueSlot,
                selectButtonOpenMatchesFocusAndHoverClassName(buttonVariant),
                "max-w-full",
                !isSelectIconButtonSize(buttonSize) &&
                  (buttonSize === "sm" ? "!gap-1 !pr-2" : "!pr-3"),
              )
            : cn(
                inputLikeControlClassName,
                "flex items-center justify-between gap-2 text-left",
                selectTriggerValueSlot,
                "data-[state=open]:border-accent data-[state=open]:bg-background data-[state=open]:outline-none data-[state=open]:shadow-[0_0_0_2px_hsl(var(--accent)_/_0.4)] dark:data-[state=open]:shadow-[0_0_0_2px_hsl(var(--accent)_/_0.4)] " +
                  "data-[state=open]:hover:border-accent dark:data-[state=open]:hover:border-accent data-[state=open]:hover:shadow-[0_0_0_2px_hsl(var(--accent)_/_0.4)] dark:data-[state=open]:hover:shadow-[0_0_0_2px_hsl(var(--accent)_/_0.4)]",
              ),
        className,
      )}
      {...props}
    >
      {children}
      {!(triggerVariant === "button" && isSelectIconButtonSize(buttonSize)) ? (
        <SelectPrimitive.Icon asChild>
          <ChevronDownIcon className={cn("size-4 shrink-0", chevronOpacity)} />
        </SelectPrimitive.Icon>
      ) : null}
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
>(({ className, children, position = "popper", onWheel, ...props }, ref) => {
  const { triggerVariant } = React.useContext(SelectUiContext);
  const [contentNode, setContentNode] = React.useState<React.ComponentRef<typeof SelectPrimitive.Content> | null>(
    null,
  );
  const onWheelRef = React.useRef(onWheel);
  onWheelRef.current = onWheel;

  const setContentRef = React.useCallback(
    (node: React.ComponentRef<typeof SelectPrimitive.Content> | null) => {
      setContentNode(node);
      if (typeof ref === "function") {
        ref(node);
      } else if (ref) {
        (ref as React.MutableRefObject<React.ComponentRef<typeof SelectPrimitive.Content> | null>).current = node;
      }
    },
    [ref],
  );

  React.useEffect(() => {
    const host = contentNode;
    if (!host) {
      return undefined;
    }

    function handleWheel(event: WheelEvent) {
      onWheelRef.current?.(event as unknown as React.WheelEvent<HTMLDivElement>);
      if (event.defaultPrevented) {
        return;
      }
      const viewport = host!.querySelector<HTMLElement>("[data-radix-scroll-area-viewport]");
      if (!viewport) {
        return;
      }
      const before = viewport.scrollTop;
      viewport.scrollTop += event.deltaY;
      if (viewport.scrollTop !== before) {
        event.preventDefault();
      }
    }

    host.addEventListener("wheel", handleWheel, { passive: false });
    return () => host.removeEventListener("wheel", handleWheel);
  }, [contentNode]);

  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        ref={setContentRef}
        className={cn(
          "relative z-[100] overflow-hidden rounded-md border border-input bg-popover p-0 text-popover-foreground shadow-md",
          triggerVariant === "inline"
            ? "min-w-[180px] w-max"
            : "w-[var(--radix-select-trigger-width)] min-w-[max(var(--radix-select-trigger-width),180px)]",
          className,
        )}
        position={position}
        sideOffset={2}
        collisionPadding={16}
        {...props}
      >
        <ScrollArea className="w-full max-h-[min(15rem,var(--radix-select-content-available-height,80vh))] shrink-0">
          <SelectPrimitive.Viewport
            className="w-full overflow-x-hidden p-1"
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
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item> & {
    description?: React.ReactNode;
  }
>(({ className, children, description, ...props }, ref) => (
  <SelectPrimitive.Item
    ref={ref}
    className={cn(
      "relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm text-foreground outline-none data-[highlighted]:bg-secondary data-[highlighted]:text-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
      description && "items-start py-2.5",
      className,
    )}
    {...props}
  >
    <span className="absolute left-2 top-1/2 flex size-3.5 -translate-y-1/2 items-center justify-center">
      <SelectPrimitive.ItemIndicator>
        <CheckIcon className="size-4" />
      </SelectPrimitive.ItemIndicator>
    </span>
    {description ? (
      <div className="flex min-w-0 flex-col gap-0.5">
        <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
        <span className="whitespace-normal break-words text-xs leading-snug text-muted-foreground">
          {description}
        </span>
      </div>
    ) : (
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    )}
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
