import * as React from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";

import { inputLikeControlClassName } from "../../lib/input-like-control-classes.js";
import { cn } from "../../lib/utils.js";
import { Input } from "./input.js";
import { ScrollArea } from "./scroll-area.js";
import type { SelectVariant } from "./select.js";
import { CheckIcon, ChevronDownIcon, SearchIcon } from "./select-icons.js";

type SearchableSelectContextValue = {
  value: string;
  setValue: (next: string) => void;
  open: boolean;
  setOpen: (open: boolean) => void;
  disabled?: boolean;
  placeholder: string;
  variant: SelectVariant;
  listId: string;
  labelMap: Record<string, React.ReactNode>;
  registerItem: (value: string, label: React.ReactNode) => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  searchPlaceholder: string;
  searchInputId: string;
  searchEmptyMessage: string;
  selectedLabel?: React.ReactNode;
};

const SearchableSelectContext = React.createContext<SearchableSelectContextValue | null>(null);

export function useSearchableSelectContext(component: string): SearchableSelectContextValue {
  const ctx = React.useContext(SearchableSelectContext);
  if (!ctx) {
    throw new Error(`${component} must be used within <SearchableSelect>`);
  }
  return ctx;
}

export type SearchableSelectProps = {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  variant?: SelectVariant;
  searchPlaceholder?: string;
  searchEmptyMessage?: string;
  /** Label for current value when content items have not mounted yet. */
  selectedLabel?: React.ReactNode;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
};

function SearchableSelect({
  value: valueProp,
  defaultValue,
  onValueChange,
  placeholder = "Select item",
  disabled,
  variant = "default",
  searchPlaceholder = "Search...",
  searchEmptyMessage = "No items found",
  selectedLabel,
  onOpenChange,
  children,
}: SearchableSelectProps) {
  const [open, setOpenState] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [valueUncontrolled, setValueUncontrolled] = React.useState(defaultValue ?? "");
  const [labelMap, setLabelMap] = React.useState<Record<string, React.ReactNode>>({});
  const isControlled = valueProp !== undefined;
  const value = isControlled ? valueProp! : valueUncontrolled;
  const listId = React.useId();
  const searchInputId = React.useId();

  const setOpen = React.useCallback(
    (next: boolean) => {
      setOpenState(next);
      if (!next) {
        setSearchQuery("");
      }
      onOpenChange?.(next);
    },
    [onOpenChange],
  );

  const setValue = React.useCallback(
    (next: string) => {
      if (!isControlled) {
        setValueUncontrolled(next);
      }
      onValueChange?.(next);
      setOpen(false);
    },
    [isControlled, onValueChange, setOpen],
  );

  const registerItem = React.useCallback((itemValue: string, label: React.ReactNode) => {
    setLabelMap((prev) => ({ ...prev, [itemValue]: label }));
  }, []);

  const ctx = React.useMemo(
    () => ({
      value,
      setValue,
      open,
      setOpen,
      disabled,
      placeholder,
      variant,
      listId,
      labelMap,
      registerItem,
      searchQuery,
      setSearchQuery,
      searchPlaceholder,
      searchInputId,
      searchEmptyMessage,
      selectedLabel,
    }),
    [
      value,
      setValue,
      open,
      setOpen,
      disabled,
      placeholder,
      variant,
      listId,
      labelMap,
      registerItem,
      searchQuery,
      searchPlaceholder,
      searchInputId,
      searchEmptyMessage,
      selectedLabel,
    ],
  );

  return (
    <SearchableSelectContext.Provider value={ctx}>
      <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
        {children}
      </PopoverPrimitive.Root>
    </SearchableSelectContext.Provider>
  );
}

const SearchableSelectTrigger = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, forwardedRef) => {
    const ctx = useSearchableSelectContext("SearchableSelectTrigger");
    const selectedLabel = ctx.value ? (ctx.labelMap[ctx.value] ?? ctx.selectedLabel) : null;

    return (
      <PopoverPrimitive.Trigger asChild>
        <div
          ref={forwardedRef}
          role="combobox"
          aria-expanded={ctx.open}
          aria-haspopup="listbox"
          aria-controls={ctx.listId}
          aria-disabled={ctx.disabled ?? false}
          tabIndex={ctx.disabled ? -1 : 0}
          data-slot="searchable-select-trigger"
          className={cn(
            ctx.variant === "inline"
              ? cn(
                  "inline-flex h-auto min-h-0 w-auto max-w-full cursor-pointer items-center gap-1 border-0 bg-transparent p-0 text-left text-sm font-medium text-foreground shadow-none outline-none",
                  "transition-[color,opacity,box-shadow,border-color]",
                  "hover:border-transparent hover:shadow-none dark:hover:border-transparent",
                  "focus:border-transparent focus:shadow-none focus-visible:border-transparent focus-visible:shadow-none",
                  "data-[state=open]:border-transparent data-[state=open]:bg-transparent data-[state=open]:shadow-none",
                  "data-[state=open]:outline-none disabled:cursor-not-allowed disabled:opacity-50",
                )
              : cn(
                  inputLikeControlClassName,
                  "cursor-pointer !px-0 flex w-full items-center justify-between gap-2 text-left normal-case",
                  "data-[state=open]:border-accent data-[state=open]:bg-background data-[state=open]:outline-none data-[state=open]:shadow-[0_0_0_2px_hsl(var(--accent)_/_0.4)] dark:data-[state=open]:shadow-[0_0_0_2px_hsl(var(--accent)_/_0.4)]",
                ),
            className,
          )}
          {...props}
        >
          <span
            className={cn(
              "min-w-0 flex-1 truncate",
              ctx.variant === "inline" ? "" : "pl-3",
              selectedLabel ? "text-foreground" : "text-muted-foreground",
            )}
          >
            {selectedLabel ?? ctx.placeholder}
          </span>
          <span className={cn("flex shrink-0 items-center", ctx.variant === "inline" ? "" : "pr-3")}>
            <ChevronDownIcon className={cn("size-4 shrink-0", ctx.variant === "inline" ? "opacity-60" : "opacity-50")} />
          </span>
        </div>
      </PopoverPrimitive.Trigger>
    );
  },
);
SearchableSelectTrigger.displayName = "SearchableSelectTrigger";

const SearchableSelectContent = React.forwardRef<
  React.ComponentRef<typeof PopoverPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>
>(({ className, children, align = "start", sideOffset = 2, ...props }, ref) => {
  const ctx = useSearchableSelectContext("SearchableSelectContent");
  const searchRef = React.useRef<HTMLInputElement>(null);
  const listboxRef = React.useRef<HTMLDivElement>(null);
  const [visibleOptionCount, setVisibleOptionCount] = React.useState<number | null>(null);
  const searchActive = ctx.searchQuery.trim().length > 0;

  React.useLayoutEffect(() => {
    if (!searchActive) {
      setVisibleOptionCount(null);
      return;
    }
    const root = listboxRef.current;
    if (!root) return;
    const options = Array.from(root.querySelectorAll('[role="option"]'));
    setVisibleOptionCount(options.filter((el) => (el as HTMLElement).offsetParent !== null).length);
  }, [searchActive, ctx.searchQuery, children, ctx.open]);

  const showSearchEmpty = searchActive && visibleOptionCount === 0;

  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        ref={ref}
        align={align}
        sideOffset={sideOffset}
        className={cn(
          "relative z-50 flex max-h-[min(380px,var(--radix-popover-content-available-height,100dvh))] flex-col overflow-hidden rounded-md border border-input bg-popover text-popover-foreground shadow-md",
          ctx.variant === "inline"
            ? "min-w-[180px] w-max"
            : "w-[var(--radix-popover-trigger-width)] min-w-[max(var(--radix-popover-trigger-width),180px)]",
          className,
        )}
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          requestAnimationFrame(() => searchRef.current?.focus());
        }}
        onCloseAutoFocus={(e) => e.preventDefault()}
        {...props}
      >
        <div className="shrink-0 border-b border-border bg-popover p-2">
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={searchRef}
              id={ctx.searchInputId}
              type="search"
              role="searchbox"
              autoComplete="off"
              value={ctx.searchQuery}
              onChange={(e) => ctx.setSearchQuery(e.target.value)}
              placeholder={ctx.searchPlaceholder}
              className="h-8 pl-9"
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
            />
          </div>
        </div>
        <div className="min-h-0 overflow-hidden">
          <ScrollArea className="w-full max-h-[min(calc(380px-3.25rem),calc(var(--radix-popover-content-available-height,100dvh)-3.25rem))] shrink-0">
            <div
              ref={listboxRef}
              id={ctx.listId}
              role="listbox"
              className={cn("w-full overflow-x-hidden", showSearchEmpty ? "px-1 pt-1 pb-0" : "p-1")}
            >
              {children}
            </div>
          </ScrollArea>
          {showSearchEmpty ? (
            <div role="status" aria-live="polite" className="shrink-0 px-3 py-2 text-center text-sm leading-5 text-muted-foreground">
              {ctx.searchEmptyMessage}
            </div>
          ) : null}
        </div>
      </PopoverPrimitive.Content>
    </PopoverPrimitive.Portal>
  );
});
SearchableSelectContent.displayName = "SearchableSelectContent";

export type SearchableSelectItemProps = Omit<React.HTMLAttributes<HTMLDivElement>, "onSelect"> & {
  value: string;
  disabled?: boolean;
  label?: React.ReactNode;
  searchText?: string;
};

const SearchableSelectItem = React.forwardRef<HTMLDivElement, SearchableSelectItemProps>(
  ({ className, value, disabled: itemDisabled, label, searchText, children, ...props }, ref) => {
    const ctx = useSearchableSelectContext("SearchableSelectItem");
    const { registerItem, setValue } = ctx;
    const disabled = Boolean(ctx.disabled || itemDisabled);
    const selected = ctx.value === value;
    const labelForTrigger = label ?? children;
    const q = ctx.searchQuery.trim().toLowerCase();
    const haystack = (searchText ?? String(value)).toLowerCase();
    const matches = q.length === 0 || haystack.includes(q);

    React.useLayoutEffect(() => {
      registerItem(value, labelForTrigger);
    }, [value, labelForTrigger, registerItem]);

    return (
      <div
        ref={ref}
        role="option"
        aria-selected={selected}
        data-disabled={disabled ? "" : undefined}
        className={cn(
          "relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm text-foreground outline-none normal-case",
          "data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
          selected ? "bg-secondary/60 hover:bg-secondary hover:text-foreground" : "hover:bg-secondary hover:text-foreground",
          !matches && "!hidden",
          className,
        )}
        onClick={() => {
          if (disabled || !matches) return;
          registerItem(value, labelForTrigger);
          setValue(value);
        }}
        onKeyDown={(e) => {
          if (disabled || !matches) return;
          if (e.key === " " || e.key === "Enter") {
            e.preventDefault();
            registerItem(value, labelForTrigger);
            setValue(value);
          }
        }}
        tabIndex={disabled || !matches ? -1 : 0}
        {...props}
      >
        <span className="absolute left-2 flex size-3.5 items-center justify-center">
          {selected ? <CheckIcon className="size-4" /> : null}
        </span>
        {children}
      </div>
    );
  },
);
SearchableSelectItem.displayName = "SearchableSelectItem";

export { SearchableSelect, SearchableSelectTrigger, SearchableSelectContent, SearchableSelectItem };
