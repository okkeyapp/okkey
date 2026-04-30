import * as React from "react";

import { cn } from "../../lib/utils.js";
import { Button } from "./button.js";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./dropdown-menu.js";
import { ScrollArea } from "./scroll-area.js";

type PopupWidth = number | string;
const POPUP_ANIMATION_MS = 240;

export type PopupMenuItem = {
  id: string;
  label: React.ReactNode;
  icon?: React.ReactNode;
  active?: boolean;
  disabled?: boolean;
  onSelect?: () => void;
};

export type PopupMenu = {
  label?: React.ReactNode;
  items: readonly PopupMenuItem[];
  activeItemId?: string;
  onItemSelect?: (item: PopupMenuItem) => void;
  dropdownLabel?: React.ReactNode;
};

export type PopupProps = Omit<React.ComponentPropsWithoutRef<"div">, "title"> & {
  header: React.ReactNode;
  footer?: React.ReactNode;
  menu?: PopupMenu;
  width?: PopupWidth;
  onClose?: () => void;
  closeLabel?: string;
  panelClassName?: string;
  contentClassName?: string;
};

function popupWidthToCssValue(width: PopupWidth): string {
  return typeof width === "number" ? `${width}px` : width;
}

function isActiveMenuItem(menu: PopupMenu, item: PopupMenuItem) {
  return item.active ?? menu.activeItemId === item.id;
}

function PopupCloseIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden {...props}>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}

function PopupChevronDownIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden {...props}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function PopupHeader({ header }: { header: React.ReactNode }) {
  if (typeof header === "string") {
    return <h2 className="truncate text-lg font-semibold leading-7 text-foreground">{header}</h2>;
  }

  return <>{header}</>;
}

function PopupMenuItems({ menu, surface }: { menu: PopupMenu; surface: "sidebar" | "dropdown" }) {
  return (
    <>
      {menu.label ? (
        <div className={cn("h-8 min-w-0 px-2 text-xs font-medium leading-8 text-muted-foreground", surface === "sidebar" && "text-sidebar-foreground/50")}>
          <span className="block truncate">{menu.label}</span>
        </div>
      ) : null}
      <div className="flex min-w-0 flex-col gap-1">
        {menu.items.map((item) => {
          const active = isActiveMenuItem(menu, item);
          const content = (
            <>
              {item.icon ? <span className="flex size-4 shrink-0 items-center justify-center">{item.icon}</span> : null}
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
            </>
          );

          if (surface === "dropdown") {
            return (
              <DropdownMenuItem
                key={item.id}
                disabled={item.disabled}
                aria-selected={active}
                className={cn("h-8 gap-2 rounded-md px-2 py-0", active && "bg-secondary font-medium")}
                onSelect={() => {
                  item.onSelect?.();
                  menu.onItemSelect?.(item);
                }}
              >
                {content}
              </DropdownMenuItem>
            );
          }

          return (
            <button
              key={item.id}
              type="button"
              disabled={item.disabled}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex h-8 w-full min-w-0 items-center gap-2 rounded-md px-2 text-left text-sm text-sidebar-foreground outline-none transition-[background-color,color]",
                "hover:bg-[rgba(0,0,0,0.05)] focus-visible:ring-2 focus-visible:ring-sidebar-ring dark:hover:bg-[rgba(255,255,255,0.08)]",
                active && "bg-[rgba(0,0,0,0.05)] font-medium dark:bg-[rgba(255,255,255,0.08)]",
                item.disabled && "pointer-events-none opacity-50",
              )}
              onClick={() => {
                item.onSelect?.();
                menu.onItemSelect?.(item);
              }}
            >
              {content}
            </button>
          );
        })}
      </div>
    </>
  );
}

function PopupMobileMenu({ menu }: { menu: PopupMenu }) {
  const activeItem = menu.items.find((item) => isActiveMenuItem(menu, item));
  const label = menu.dropdownLabel ?? activeItem?.label ?? menu.label ?? "Menu";

  return (
    <div className="hidden max-md:block">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="outline" className="w-full justify-between">
            <span className="truncate">{label}</span>
            <PopupChevronDownIcon className="size-4 opacity-70" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" sideOffset={6} className="w-[var(--radix-dropdown-menu-trigger-width)] min-w-0 p-1">
          <PopupMenuItems menu={menu} surface="dropdown" />
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export const Popup = React.forwardRef<HTMLDivElement, PopupProps>(
  (
    {
      className,
      panelClassName,
      contentClassName,
      header,
      footer,
      menu,
      width = 720,
      onClose,
      closeLabel = "Close popup",
      children,
      style,
      onClick,
      role = "dialog",
      ...props
    },
    ref,
  ) => {
    const [isClosing, setIsClosing] = React.useState(false);
    const closeTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const popupStyle = {
      "--okkey-popup-width": popupWidthToCssValue(width),
      ...style,
    } as React.CSSProperties;

    React.useEffect(() => {
      return () => {
        if (closeTimerRef.current) {
          clearTimeout(closeTimerRef.current);
        }
      };
    }, []);

    const requestClose = React.useCallback(() => {
      if (!onClose || isClosing) {
        return;
      }

      setIsClosing(true);
      closeTimerRef.current = setTimeout(() => {
        onClose();
      }, POPUP_ANIMATION_MS);
    }, [isClosing, onClose]);

    return (
      <div
        ref={ref}
        role={role}
        aria-modal={role === "dialog" ? true : undefined}
        data-state={isClosing ? "closing" : "open"}
        className={cn(
          "okkey-popup-overlay fixed inset-0 z-50 !m-0 flex items-center justify-center bg-black/30 p-3 text-foreground",
          "max-md:items-end max-md:p-0",
          className,
        )}
        onClick={(event) => {
          onClick?.(event);
          if (!event.defaultPrevented && event.target === event.currentTarget) {
            requestClose();
          }
        }}
        style={popupStyle}
        {...props}
      >
        <div className="pointer-events-none relative flex w-[min(var(--okkey-popup-width),calc(100vw-24px))] max-md:w-full">
          {onClose ? (
            <button
              type="button"
              aria-label={closeLabel}
              className={cn(
                "pointer-events-auto absolute z-[1] flex size-8 items-center justify-center rounded-md outline-none transition-[background-color,color]",
                "right-4 top-4 text-foreground/70 hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
                "max-md:left-1/2 max-md:right-auto max-md:top-0 max-md:-translate-x-1/2 max-md:-translate-y-10 max-md:text-white max-md:hover:bg-white/15 max-md:hover:text-white max-md:focus-visible:ring-white/50",
              )}
              onClick={requestClose}
            >
              <PopupCloseIcon className="size-4" />
            </button>
          ) : null}
          <div
            data-state={isClosing ? "closing" : "open"}
            className={cn(
              "okkey-popup-panel pointer-events-auto relative flex max-h-[calc(100vh-24px)] min-h-0 w-full overflow-hidden rounded-xl bg-background",
              "max-md:max-h-[calc(100dvh-40px)] max-md:w-full max-md:flex-col max-md:rounded-b-none",
              panelClassName,
            )}
            onClick={(event) => event.stopPropagation()}
          >
          {menu ? (
            <aside className="w-60 shrink-0 overflow-hidden bg-secondary p-2 max-md:hidden">
              <ScrollArea className="h-full">
                <PopupMenuItems menu={menu} surface="sidebar" />
              </ScrollArea>
            </aside>
          ) : null}

          <div className="flex min-h-0 flex-1 flex-col">
            {menu ? (
              <div className="px-4 pt-4 md:hidden">
                <PopupMobileMenu menu={menu} />
              </div>
            ) : null}

            <div className={cn("flex shrink-0 flex-col gap-3", menu ? "p-4 md:pr-12" : "p-6 pb-0 md:pr-12 max-md:p-4 max-md:pb-0")}>
              <div className="flex min-w-0 items-center gap-2.5">
                <div className="min-w-0 flex-1">
                  <PopupHeader header={header} />
                </div>
              </div>
            </div>

            <ScrollArea className="min-h-0 flex-1">
              <div className={cn(menu ? "pl-4 pr-4 pb-4" : "p-6 max-md:p-4", contentClassName)}>
                {children}
              </div>
            </ScrollArea>

            {footer ? (
              <div className={cn("flex shrink-0 items-center justify-end gap-2 px-6 pb-6 max-md:px-4 max-md:pb-4", menu && "px-4 pb-4")}>
                {footer}
              </div>
            ) : null}
          </div>
          </div>
        </div>
      </div>
    );
  },
);
Popup.displayName = "Popup";
