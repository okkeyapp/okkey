import * as React from "react";
import type { KeyboardEvent as ReactKeyboardEvent, SVGProps } from "react";

import { cn } from "../../lib/utils.js";

function SearchIcon({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      className={cn("size-4 shrink-0", className)}
      {...props}
    >
      <path
        d="M7.33333 12.6667C10.2789 12.6667 12.6667 10.2789 12.6667 7.33333C12.6667 4.38781 10.2789 2 7.33333 2C4.38781 2 2 4.38781 2 7.33333C2 10.2789 4.38781 12.6667 7.33333 12.6667Z"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M14 14L11.1 11.1" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ClearIcon({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden className={cn("size-3.5 shrink-0", className)} {...props}>
      <path d="M4 4L12 12M12 4L4 12" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
    </svg>
  );
}

const searchWrapClassName = cn(
  "flex h-9 w-full max-w-[420px] shrink-0 items-stretch rounded-md border border-transparent",
  "bg-[rgba(0,0,0,0.05)] text-sm text-foreground shadow-none transition-[color,box-shadow,border-color,background-color]",
  "dark:bg-white/[0.06]",
  "hover:border-[color-mix(in_hsl,hsl(var(--input))_82%,hsl(var(--accent))_18%)]",
  "dark:hover:border-[color-mix(in_hsl,hsl(var(--input))_76%,hsl(var(--accent))_24%)]",
  "focus-within:border-accent focus-within:bg-background focus-within:shadow-[0_0_0_2px_hsl(var(--accent)_/_0.4)]",
  "dark:focus-within:shadow-[0_0_0_2px_hsl(var(--accent)_/_0.4)]",
  "focus-within:hover:border-accent dark:focus-within:hover:border-accent",
  "focus-within:hover:shadow-[0_0_0_2px_hsl(var(--accent)_/_0.4)] dark:focus-within:hover:shadow-[0_0_0_2px_hsl(var(--accent)_/_0.4)]",
);

const kbdClassName = cn(
  "inline-flex items-center gap-1 rounded-[4px] bg-background px-[6px] py-0.5 text-xs leading-4 text-muted-foreground",
  "shadow-[0_0_0_1px_rgba(0,0,0,0.06)] dark:shadow-[0_0_0_1px_rgba(255,255,255,0.08)]",
);

export type WorkspaceSearchFieldProps = {
  value?: string;
  defaultValue?: string;
  onChange: (value: string) => void;
  onSubmit?: (value: string) => void;
  placeholder: string;
  ariaLabel?: string;
  inputRef?: React.RefObject<HTMLInputElement | null>;
  showShortcutKbd?: boolean;
  shortcutSegments?: readonly string[];
  shortcutAriaLabel?: string;
  clearAriaLabel: string;
  className?: string;
  wrapClassName?: string;
  /** Prefix for `data-testid` attributes. Default `"items-shell"`. */
  testIdPrefix?: string;
};

/**
 * Shared workspace search chrome (icon + input + clear / shortcut kbd).
 * Used by web ItemsShellTopBar and extension VaultPopup.
 */
export function WorkspaceSearchField({
  value,
  defaultValue,
  onChange,
  onSubmit,
  placeholder,
  ariaLabel,
  inputRef: inputRefProp,
  showShortcutKbd = false,
  shortcutSegments,
  shortcutAriaLabel,
  clearAriaLabel,
  className,
  wrapClassName,
  testIdPrefix = "items-shell",
}: WorkspaceSearchFieldProps) {
  const isControlled = value !== undefined;
  const [uncontrolledValue, setUncontrolledValue] = React.useState(defaultValue ?? "");
  const internalRef = React.useRef<HTMLInputElement>(null);
  const inputRef = inputRefProp ?? internalRef;

  const currentValue = isControlled ? value : uncontrolledValue;
  const hasText = currentValue.trim().length > 0;
  const showKbd = !hasText && showShortcutKbd && shortcutSegments != null && shortcutSegments.length > 0;

  function setValue(next: string) {
    if (!isControlled) {
      setUncontrolledValue(next);
    }
    onChange(next);
  }

  function clearValue() {
    setValue("");
    const el = inputRef.current;
    if (el) {
      if (!isControlled) {
        el.value = "";
      }
      el.focus({ preventScroll: true });
    }
  }

  return (
    <div className={cn("flex min-w-0 flex-1 justify-center px-0 sm:px-1", wrapClassName)}>
      <div className={cn(searchWrapClassName, className)} data-testid={`${testIdPrefix}-search-wrap`}>
        <div className="flex shrink-0 items-center ps-3 pe-2 py-1.5 text-muted-foreground">
          <SearchIcon />
        </div>
        <input
          ref={inputRef as React.RefObject<HTMLInputElement>}
          type="text"
          role="searchbox"
          name={`${testIdPrefix}-search`}
          id={`${testIdPrefix}-search`}
          placeholder={placeholder}
          aria-label={ariaLabel ?? placeholder}
          autoComplete="off"
          data-testid={`${testIdPrefix}-search`}
          {...(isControlled ? { value: currentValue } : { defaultValue: defaultValue ?? "" })}
          onChange={(e) => {
            setValue(e.currentTarget.value);
          }}
          onKeyDown={(e: ReactKeyboardEvent<HTMLInputElement>) => {
            if (e.key !== "Enter") {
              return;
            }
            e.preventDefault();
            onSubmit?.(e.currentTarget.value);
          }}
          className={cn(
            "min-w-0 flex-1 border-0 bg-transparent py-1.5 text-sm leading-5 text-foreground outline-none",
            "placeholder:text-muted-foreground",
            "focus-visible:outline-none",
          )}
        />
        {hasText ? (
          <div className="flex shrink-0 items-center ps-1 pe-1.5">
            <button
              type="button"
              className={cn(
                "inline-flex size-6 items-center justify-center rounded-[4px] text-muted-foreground",
                "hover:bg-muted hover:text-foreground",
                "focus-visible:outline-none focus-visible:shadow-[0_0_0_2px_hsl(var(--accent)_/_0.4)]",
              )}
              aria-label={clearAriaLabel}
              data-testid={`${testIdPrefix}-search-clear`}
              onClick={clearValue}
            >
              <ClearIcon />
            </button>
          </div>
        ) : showKbd ? (
          <div className="hidden min-[991px]:flex shrink-0 items-center ps-1 pe-2.5">
            <kbd className={kbdClassName} aria-label={shortcutAriaLabel}>
              {shortcutSegments.map((part, index) => (
                <span key={index} className="shrink-0" aria-hidden>
                  {part}
                </span>
              ))}
            </kbd>
          </div>
        ) : null}
      </div>
    </div>
  );
}
