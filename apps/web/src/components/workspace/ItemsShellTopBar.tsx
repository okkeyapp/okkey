import {
  Button,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  useOkkeyAppShellLayout,
} from "@okkey/ui";
import { useEffect, useMemo, useRef, type KeyboardEvent as ReactKeyboardEvent, type SVGProps } from "react";
import { useLocation, useSearchParams } from "react-router-dom";

import { useLocale } from "../../locale/LocaleContext";
import {
  FILTER_QUERY_PARAM,
  FOLDER_QUERY_PARAM,
  ITEMS_PATH,
  SEARCH_QUERY_PARAM,
  VAULT_QUERY_PARAM,
} from "../../routes/paths";

/** Same glyphs for every UI locale; platform picks modifier. */
const WORKSPACE_SEARCH_SHORTCUT_SEGMENTS_APPLE = ["⌘", "+", "K"] as const;
const WORKSPACE_SEARCH_SHORTCUT_SEGMENTS_WIN = ["Ctrl", "+", "K"] as const;

/** Screen reader hint for the global shortcut (not translated). */
const WORKSPACE_SEARCH_SHORTCUT_ARIA_APPLE = "Command+K";
const WORKSPACE_SEARCH_SHORTCUT_ARIA_WIN = "Ctrl+K";

function isAppleLikePlatform(): boolean {
  if (typeof navigator === "undefined") {
    return false;
  }
  return /Mac|iPhone|iPod|iPad/i.test(navigator.platform);
}

function shouldTriggerWorkspaceSearchShortcut(e: KeyboardEvent, isApple: boolean): boolean {
  if (e.repeat || e.key.toLowerCase() !== "k") {
    return false;
  }
  if (isApple) {
    return e.metaKey && !e.ctrlKey;
  }
  return e.ctrlKey && !e.metaKey;
}

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

function PlusIcon({ className, ...props }: SVGProps<SVGSVGElement>) {
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
        d="M3.33337 8.00004H12.6667M8.00004 3.33337V12.6667"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function BellIcon({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      className={cn("size-4 shrink-0", className)}
      {...props}
    >
      <path
        d="M6.8667 13.9999C6.97829 14.2029 7.14233 14.3721 7.34169 14.49C7.54106 14.6079 7.76842 14.6701 8.00003 14.6701C8.23165 14.6701 8.45901 14.6079 8.65837 14.49C8.85773 14.3721 9.02178 14.2029 9.13337 13.9999M4 5.33325C4 4.27239 4.42143 3.25497 5.17157 2.50482C5.92172 1.75468 6.93913 1.33325 8 1.33325C9.06087 1.33325 10.0783 1.75468 10.8284 2.50482C11.5786 3.25497 12 4.27239 12 5.33325C12 9.99992 14 11.3333 14 11.3333H2C2 11.3333 4 9.99992 4 5.33325Z"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Workspace shell top bar (search, notifications, create) — same row as {@link OkkeyAppSidebarToolbar}.
 */
export default function ItemsShellTopBar() {
  const { t } = useLocale();
  const shell = useOkkeyAppShellLayout();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const isApple = useMemo(() => isAppleLikePlatform(), []);
  const isItemsRoute = location.pathname === ITEMS_PATH;
  const searchFromUrl = searchParams.get(SEARCH_QUERY_PARAM) ?? "";
  const shortcutSegments = isApple ? WORKSPACE_SEARCH_SHORTCUT_SEGMENTS_APPLE : WORKSPACE_SEARCH_SHORTCUT_SEGMENTS_WIN;
  const shortcutAriaLabel = isApple ? WORKSPACE_SEARCH_SHORTCUT_ARIA_APPLE : WORKSPACE_SEARCH_SHORTCUT_ARIA_WIN;

  const searchFieldLabel = t("web.items.searchPlaceholder");
  const createRecordLabel = t("web.items.createRecord");
  const notificationsLabel = t("web.items.notificationsTitle");

  useEffect(() => {
    if (!isItemsRoute) {
      return;
    }
    const el = searchInputRef.current;
    if (!el) {
      return;
    }
    if (document.activeElement === el) {
      return;
    }
    el.value = searchFromUrl;
  }, [isItemsRoute, searchFromUrl]);

  useEffect(() => {
    if (shell.isMobile) {
      return;
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (!shouldTriggerWorkspaceSearchShortcut(e, isApple)) {
        return;
      }
      e.preventDefault();
      const el = searchInputRef.current;
      if (!el) {
        return;
      }
      el.focus({ preventScroll: true });
      el.select();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isApple, shell.isMobile]);

  return (
    <div className="flex min-w-0 flex-1 flex-row items-center gap-2" data-testid="items-shell-topbar">
      <div className="flex min-w-0 flex-1 justify-center px-0 sm:px-1">
        <div
          className={cn(
            "flex h-9 w-full max-w-[420px] shrink-0 items-stretch rounded-md border border-transparent",
            "bg-[rgba(0,0,0,0.05)] text-sm text-foreground shadow-none transition-[color,box-shadow,border-color,background-color]",
            "dark:bg-white/[0.06]",
            "hover:border-[color-mix(in_hsl,hsl(var(--input))_82%,hsl(var(--accent))_18%)]",
            "dark:hover:border-[color-mix(in_hsl,hsl(var(--input))_76%,hsl(var(--accent))_24%)]",
            "focus-within:border-accent focus-within:bg-background focus-within:shadow-[0_0_0_2px_hsl(var(--accent)_/_0.4)]",
            "dark:focus-within:shadow-[0_0_0_2px_hsl(var(--accent)_/_0.4)]",
            "focus-within:hover:border-accent dark:focus-within:hover:border-accent",
            "focus-within:hover:shadow-[0_0_0_2px_hsl(var(--accent)_/_0.4)] dark:focus-within:hover:shadow-[0_0_0_2px_hsl(var(--accent)_/_0.4)]",
          )}
          data-testid="items-shell-search-wrap"
        >
          <div className="flex shrink-0 items-center ps-3 pe-2 py-1.5 text-muted-foreground">
            <SearchIcon />
          </div>
          <input
            ref={searchInputRef}
            type="text"
            role="searchbox"
            name="workspace-shell-search"
            id="workspace-shell-search"
            placeholder={searchFieldLabel}
            aria-label={searchFieldLabel}
            autoComplete="off"
            data-testid="items-shell-search"
            onKeyDown={(e: ReactKeyboardEvent<HTMLInputElement>) => {
              if (e.key !== "Enter" || !isItemsRoute) {
                return;
              }
              e.preventDefault();
              const raw = e.currentTarget.value.trim();
              setSearchParams(
                (prev) => {
                  const next = new URLSearchParams(prev);
                  if (raw) {
                    next.set(SEARCH_QUERY_PARAM, raw);
                    next.delete(VAULT_QUERY_PARAM);
                    next.delete(FOLDER_QUERY_PARAM);
                    next.delete(FILTER_QUERY_PARAM);
                  } else {
                    next.delete(SEARCH_QUERY_PARAM);
                  }
                  return next;
                },
                { replace: true },
              );
            }}
            className={cn(
              "min-w-0 flex-1 border-0 bg-transparent py-1.5 text-sm leading-5 text-foreground outline-none",
              "placeholder:text-muted-foreground",
              "focus-visible:outline-none",
            )}
          />
          <div className="hidden min-[991px]:flex shrink-0 items-center ps-1 pe-2.5">
            <kbd
              className={cn(
                "inline-flex items-center gap-1 rounded-[4px] bg-background px-[6px] py-0.5 text-xs leading-4 text-muted-foreground",
                "shadow-[0_0_0_1px_rgba(0,0,0,0.06)] dark:shadow-[0_0_0_1px_rgba(255,255,255,0.08)]",
              )}
              aria-label={shortcutAriaLabel}
            >
              {shortcutSegments.map((part, index) => (
                <span key={index} className="shrink-0" aria-hidden>
                  {part}
                </span>
              ))}
            </kbd>
          </div>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="relative size-9 min-h-9 min-w-9 shrink-0 rounded-lg bg-background"
              aria-label={notificationsLabel}
            >
              <BellIcon />
              <span
                className="pointer-events-none absolute top-px right-px size-2.5 rounded-full bg-red-500 ring-2 ring-background"
                aria-hidden
              />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" sideOffset={6} className="w-72 p-0">
            <div className="border-b border-border px-3 py-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {notificationsLabel}
              </p>
            </div>
            <DropdownMenuSeparator className="m-0" />
            <div className="px-3 py-4">
              <p className="okkey-small text-center text-muted-foreground">{t("web.items.notificationsEmpty")}</p>
            </div>
          </DropdownMenuContent>
        </DropdownMenu>

        <Button
          type="button"
          variant="default"
          className={cn(
            "h-9 shrink-0 rounded-lg text-sm font-medium",
            shell.isMobile ? "size-9 min-h-9 min-w-9 p-0" : "gap-[4px] px-4",
          )}
          aria-label={createRecordLabel}
        >
          <PlusIcon />
          {shell.isMobile ? null : createRecordLabel}
        </Button>
      </div>
    </div>
  );
}
