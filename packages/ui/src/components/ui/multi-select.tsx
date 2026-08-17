import * as React from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";

import { inputLikeControlClassName } from "../../lib/input-like-control-classes.js";
import { cn } from "../../lib/utils.js";
import type { SelectVariant } from "./select.js";

import { CheckIcon, ChevronDownIcon, SearchIcon } from "./select-icons.js";
import { Input } from "./input.js";
import { ScrollArea } from "./scroll-area.js";

function XIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}

export type MultiSelectDisplayMode = "chips" | "summary";

type MultiSelectSharedProps = {
  value?: string[];
  defaultValue?: string[];
  onValueChange?: (value: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
  variant?: SelectVariant;
  /** Search field above the list; items filter by `searchText` on each `MultiSelectItem`. */
  filterable?: boolean;
  searchPlaceholder?: string;
  /** Shown when `filterable`, query is non-empty, and no options match (e.g. i18n). */
  searchEmptyMessage?: React.ReactNode;
  /** Optional custom empty state that can submit the active search query. */
  renderSearchEmpty?: (query: string, submit: () => void) => React.ReactNode;
  /** Return `false` to keep the current query after submit. */
  onSearchSubmit?: (query: string) => boolean | void;
  onSearchQueryChange?: (query: string) => void;
  children: React.ReactNode;
};

export type MultiSelectProps = MultiSelectSharedProps &
  (
    | { displayMode?: "chips" }
    | { displayMode: "summary"; selectionCountLabel: string }
  );

type MultiSelectContextValue = {
  value: string[];
  setValue: (next: string[] | ((prev: string[]) => string[])) => void;
  open: boolean;
  setOpen: (open: boolean) => void;
  disabled?: boolean;
  placeholder: string;
  variant: SelectVariant;
  displayMode: MultiSelectDisplayMode;
  selectionCountLabel: string;
  listId: string;
  labelMap: Record<string, React.ReactNode>;
  registerItem: (value: string, labelForChip: React.ReactNode) => void;
  unregisterItem: (value: string) => void;
  toggleValue: (value: string) => void;
  removeValue: (value: string) => void;
  filterable: boolean;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  searchPlaceholder: string;
  searchInputId: string;
  searchEmptyMessage: React.ReactNode;
  renderSearchEmpty?: (query: string, submit: () => void) => React.ReactNode;
  submitSearch: () => void;
};

const MultiSelectContext = React.createContext<MultiSelectContextValue | null>(null);

function useMultiSelectContext(component: string): MultiSelectContextValue {
  const ctx = React.useContext(MultiSelectContext);
  if (!ctx) {
    throw new Error(`${component} must be used within <MultiSelect>`);
  }
  return ctx;
}

function MultiSelect(props: MultiSelectProps) {
  const {
    value: valueProp,
    defaultValue,
    onValueChange,
    placeholder = "Select items",
    disabled,
    variant = "default",
    filterable = false,
    searchPlaceholder = "Search…",
    searchEmptyMessage = "No items found",
    renderSearchEmpty,
    onSearchSubmit,
    onSearchQueryChange,
    children,
  } = props;
  const displayMode: MultiSelectDisplayMode = props.displayMode ?? "chips";
  const selectionCountLabel =
    displayMode === "summary" && "selectionCountLabel" in props ? props.selectionCountLabel : "";
  const [open, setOpenState] = React.useState(false);
  const [searchQuery, setSearchQueryState] = React.useState("");
  const searchInputId = React.useId();
  const setSearchQuery = React.useCallback(
    (query: string) => {
      setSearchQueryState(query);
      onSearchQueryChange?.(query);
    },
    [onSearchQueryChange],
  );

  const setOpen = React.useCallback((next: boolean) => {
    setOpenState(next);
    if (!next) setSearchQuery("");
  }, [setSearchQuery]);
  const [valueUncontrolled, setValueUncontrolled] = React.useState<string[]>(defaultValue ?? []);
  const isControlled = valueProp !== undefined;
  const value = isControlled ? valueProp! : valueUncontrolled;

  const setValue = React.useCallback(
    (next: string[] | ((prev: string[]) => string[])) => {
      const resolved = typeof next === "function" ? (next as (p: string[]) => string[])(value) : next;
      if (!isControlled) setValueUncontrolled(resolved);
      onValueChange?.(resolved);
    },
    [isControlled, onValueChange, value],
  );

  const [labelMap, setLabelMap] = React.useState<Record<string, React.ReactNode>>({});
  const selectedRef = React.useRef(value);
  selectedRef.current = value;

  const registerItem = React.useCallback((v: string, label: React.ReactNode) => {
    setLabelMap((prev) => ({ ...prev, [v]: label }));
  }, []);

  /** Popover unmounts items when closed; keep labels for chips still in `value`. */
  const unregisterItem = React.useCallback((v: string) => {
    if (selectedRef.current.includes(v)) return;
    setLabelMap((prev) => {
      if (!(v in prev)) return prev;
      const next = { ...prev };
      delete next[v];
      return next;
    });
  }, []);

  const pruneLabel = React.useCallback((v: string) => {
    setLabelMap((prev) => {
      if (!(v in prev)) return prev;
      const next = { ...prev };
      delete next[v];
      return next;
    });
  }, []);

  const toggleValue = React.useCallback(
    (v: string) => {
      if (disabled) return;
      setValue((prev) => {
        if (prev.includes(v)) {
          pruneLabel(v);
          return prev.filter((x) => x !== v);
        }
        return [...prev, v];
      });
    },
    [disabled, setValue, pruneLabel],
  );

  const removeValue = React.useCallback(
    (v: string) => {
      if (disabled) return;
      pruneLabel(v);
      setValue((prev) => prev.filter((x) => x !== v));
    },
    [disabled, setValue, pruneLabel],
  );

  const listId = React.useId();
  const submitSearch = React.useCallback(() => {
    const query = searchQuery.trim();
    if (!query || !onSearchSubmit) return;
    if (onSearchSubmit(query) !== false) {
      setSearchQuery("");
    }
  }, [onSearchSubmit, searchQuery]);

  const ctx = React.useMemo(
    () => ({
      value,
      setValue,
      open,
      setOpen,
      disabled,
      placeholder,
      variant,
      displayMode,
      selectionCountLabel,
      listId,
      labelMap,
      registerItem,
      unregisterItem,
      toggleValue,
      removeValue,
      filterable,
      searchQuery,
      setSearchQuery,
      searchPlaceholder,
      searchInputId,
      searchEmptyMessage,
      renderSearchEmpty,
      submitSearch,
    }),
    [
      value,
      setValue,
      open,
      setOpen,
      disabled,
      placeholder,
      variant,
      displayMode,
      selectionCountLabel,
      listId,
      labelMap,
      registerItem,
      unregisterItem,
      toggleValue,
      removeValue,
      filterable,
      searchQuery,
      searchPlaceholder,
      searchInputId,
      searchEmptyMessage,
      renderSearchEmpty,
      submitSearch,
    ],
  );

  return (
    <MultiSelectContext.Provider value={ctx}>
      <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
        {children}
      </PopoverPrimitive.Root>
    </MultiSelectContext.Provider>
  );
}

const MultiSelectTrigger = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, forwardedRef) => {
    const ctx = useMultiSelectContext("MultiSelectTrigger");
    const isSummary = ctx.displayMode === "summary";

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
          data-slot="multi-select-trigger"
          className={cn(
            ctx.variant === "inline"
              ? cn(
                  "inline-flex h-auto min-h-0 w-auto max-w-full cursor-pointer flex-wrap items-center gap-1 border-0 bg-transparent p-0 text-left text-sm font-medium text-foreground shadow-none outline-none normal-case",
                  "transition-[color,opacity,box-shadow,border-color]",
                  "hover:border-transparent hover:shadow-none dark:hover:border-transparent",
                  "focus:border-transparent focus:shadow-none focus-visible:border-transparent focus-visible:shadow-none",
                  "data-[state=open]:border-transparent data-[state=open]:bg-transparent data-[state=open]:shadow-none",
                  "data-[state=open]:outline-none",
                  "disabled:cursor-not-allowed disabled:opacity-50",
                )
              : cn(
                  inputLikeControlClassName,
                  "cursor-pointer",
                  /* Match Select horizontal inset (12px text) but frame pt/pb/pl = 3px; chevron column = pr-3 like Select */
                  "!h-auto min-h-9 !px-0 pt-[3px] pb-[3px] pl-[3px]",
                  "flex w-full items-center justify-between gap-2 text-left normal-case",
                  "data-[state=open]:border-accent data-[state=open]:bg-background data-[state=open]:outline-none data-[state=open]:shadow-[0_0_0_2px_hsl(var(--accent)_/_0.4)] dark:data-[state=open]:shadow-[0_0_0_2px_hsl(var(--accent)_/_0.4)] " +
                  "data-[state=open]:hover:border-accent dark:data-[state=open]:hover:border-accent data-[state=open]:hover:shadow-[0_0_0_2px_hsl(var(--accent)_/_0.4)] dark:data-[state=open]:hover:shadow-[0_0_0_2px_hsl(var(--accent)_/_0.4)]",
                ),
            className,
          )}
          {...props}
        >
          <div
            className={cn(
              "flex min-h-0 min-w-0 flex-1 flex-wrap content-center items-center gap-1 overflow-x-hidden overflow-y-visible",
              isSummary || ctx.value.length === 0 ? "pl-[12px]" : "pl-[3px]",
            )}
          >
            {isSummary ? (
              <span
                className="flex min-h-[28px] min-w-0 flex-1 items-center truncate text-sm text-foreground normal-case"
                aria-live="polite"
              >
                {ctx.selectionCountLabel}:{" "}
                <span className="tabular-nums">{ctx.value.length}</span>
              </span>
            ) : ctx.value.length === 0 ? (
              <span className="flex min-h-[28px] min-w-0 flex-1 items-center truncate text-sm text-muted-foreground normal-case">
                {ctx.placeholder}
              </span>
            ) : (
              ctx.value.map((v) => (
                <span
                  key={v}
                  data-ms-chip
                  className="box-border inline-flex min-h-[28px] min-w-0 max-w-full items-center gap-0.5 rounded-[6px] bg-secondary py-0.5 pl-2 pr-1 text-xs font-medium leading-normal text-secondary-foreground normal-case"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                >
                  <span className="min-w-0 max-w-full break-words leading-snug">{ctx.labelMap[v] ?? v}</span>
                  <button
                    type="button"
                    data-ms-chip-remove
                    aria-label={`Remove ${typeof ctx.labelMap[v] === "string" ? ctx.labelMap[v] : v}`}
                    disabled={ctx.disabled}
                    className={cn(
                      "inline-flex size-[22px] shrink-0 items-center justify-center rounded-[6px] text-secondary-foreground outline-none",
                      "hover:bg-secondary-foreground/15 focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                      "disabled:pointer-events-none disabled:opacity-50",
                    )}
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      ctx.removeValue(v);
                    }}
                  >
                    <XIcon className="size-3.5" />
                  </button>
                </span>
              ))
            )}
          </div>
          <div className={cn("flex shrink-0 items-center", ctx.variant === "inline" ? "" : "pr-3")}>
            <ChevronDownIcon
              className={cn("size-4 shrink-0", ctx.variant === "inline" ? "opacity-60" : "opacity-50")}
            />
          </div>
        </div>
      </PopoverPrimitive.Trigger>
    );
  },
);
MultiSelectTrigger.displayName = "MultiSelectTrigger";

const MultiSelectContent = React.forwardRef<
  React.ComponentRef<typeof PopoverPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>
>(({ className, children, align = "start", sideOffset = 2, ...props }, ref) => {
  const ctx = useMultiSelectContext("MultiSelectContent");
  const searchRef = React.useRef<HTMLInputElement>(null);
  const listboxRef = React.useRef<HTMLDivElement>(null);
  const [visibleOptionCount, setVisibleOptionCount] = React.useState<number | null>(null);

  const searchActive = ctx.filterable && ctx.searchQuery.trim().length > 0;
  React.useLayoutEffect(() => {
    if (!searchActive) {
      setVisibleOptionCount(null);
      return;
    }
    const root = listboxRef.current;
    if (!root) return;
    const options = Array.from(root.querySelectorAll('[role="option"]'));
    const n = options.filter((el) => (el as HTMLElement).offsetParent !== null).length;
    setVisibleOptionCount(n);
  }, [searchActive, ctx.searchQuery, children, ctx.open]);

  const showSearchEmpty = searchActive && visibleOptionCount === 0;

  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        ref={ref}
        align={align}
        sideOffset={sideOffset}
        className={cn(
          "relative z-50 flex max-h-96 flex-col overflow-hidden rounded-md border border-input bg-popover text-popover-foreground shadow-md",
          ctx.variant === "inline"
            ? "min-w-[180px] w-max"
            : "w-[var(--radix-popover-trigger-width)] min-w-[max(var(--radix-popover-trigger-width),180px)]",
          className,
        )}
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          if (ctx.filterable) {
            requestAnimationFrame(() => searchRef.current?.focus());
          }
        }}
        onCloseAutoFocus={(e) => e.preventDefault()}
        {...props}
      >
        {ctx.filterable ? (
          <>
            <div className="shrink-0 border-b border-border bg-popover p-2">
              <div className="relative">
                <SearchIcon
                  className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden
                />
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
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === "Enter") {
                      e.preventDefault();
                      ctx.submitSearch();
                    }
                  }}
                />
              </div>
            </div>
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <ScrollArea className="w-full min-h-0 max-h-[min(15rem,var(--radix-popover-content-available-height,100dvh))] shrink-0">
                <div
                  ref={listboxRef}
                  id={ctx.listId}
                  role="listbox"
                  aria-multiselectable="true"
                  className={cn("w-full overflow-x-hidden", showSearchEmpty ? "px-1 pt-1 pb-0" : "p-1")}
                >
                  {children}
                </div>
              </ScrollArea>
              {showSearchEmpty ? (
                <div
                  role="status"
                  aria-live="polite"
                  className="shrink-0 px-3 py-2 text-center text-sm leading-5 text-muted-foreground"
                >
                  {ctx.renderSearchEmpty
                    ? ctx.renderSearchEmpty(ctx.searchQuery.trim(), ctx.submitSearch)
                    : ctx.searchEmptyMessage}
                </div>
              ) : null}
            </div>
          </>
        ) : (
          <ScrollArea className="w-full max-h-[min(15rem,var(--radix-popover-content-available-height,100dvh))] shrink-0">
            <div id={ctx.listId} role="listbox" aria-multiselectable="true" className="w-full overflow-x-hidden p-1">
              {children}
            </div>
          </ScrollArea>
        )}
      </PopoverPrimitive.Content>
    </PopoverPrimitive.Portal>
  );
});
MultiSelectContent.displayName = "MultiSelectContent";

export type MultiSelectItemProps = Omit<React.HTMLAttributes<HTMLDivElement>, "onSelect"> & {
  value: string;
  disabled?: boolean;
  /** Label shown on chips; list row still uses `children`. Defaults to `children`. */
  chipLabel?: React.ReactNode;
  /** Case-insensitive substring match when `MultiSelect` has `filterable`. */
  searchText?: string;
};

const MultiSelectItem = React.forwardRef<HTMLDivElement, MultiSelectItemProps>(
  ({ className, value, disabled: itemDisabled, chipLabel, searchText, children, ...props }, ref) => {
    const ctx = useMultiSelectContext("MultiSelectItem");
    const { registerItem, unregisterItem, toggleValue, value: selectedValues, disabled: rootDisabled } = ctx;
    const disabled = Boolean(rootDisabled || itemDisabled);
    const selected = selectedValues.includes(value);
    const labelForChip = chipLabel ?? children;
    const q = ctx.searchQuery.trim().toLowerCase();
    const haystack = (searchText ?? String(value)).toLowerCase();
    const matches = !ctx.filterable || q.length === 0 || haystack.includes(q);

    React.useLayoutEffect(() => {
      registerItem(value, labelForChip);
      return () => unregisterItem(value);
    }, [value, labelForChip, registerItem, unregisterItem]);

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
          /* `hidden` attr loses to Tailwind `flex`; use important so filter actually hides rows */
          !matches && "!hidden",
          className,
        )}
        onClick={() => {
          if (disabled || !matches) return;
          registerItem(value, labelForChip);
          toggleValue(value);
        }}
        onKeyDown={(e) => {
          if (disabled || !matches) return;
          if (e.key === " " || e.key === "Enter") {
            e.preventDefault();
            registerItem(value, labelForChip);
            toggleValue(value);
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
MultiSelectItem.displayName = "MultiSelectItem";

export { MultiSelect, MultiSelectTrigger, MultiSelectContent, MultiSelectItem };
