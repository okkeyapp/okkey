import * as React from "react";
import { flushSync } from "react-dom";

import {
  getScrollAreaViewport,
  popupChromeSurfaceClassName,
  popupFooterShadowClassName,
  popupHeaderShadowClassName,
  readPopupScrollEdges,
  type PopupScrollEdges,
} from "../../lib/popup-scroll-shadow.js";
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
/** Any intentional downward drag dismisses the sheet on release. */
const MOBILE_SHEET_DRAG_DISMISS_PX = 4;

function PopupMobileSheetHandle({
  closeLabel,
  closeDisabled,
  onRequestClose,
  onDragStart,
  onDragMove,
  onDragEnd,
}: {
  closeLabel: string;
  closeDisabled: boolean;
  onRequestClose: () => void;
  onDragStart: () => void;
  onDragMove: (offset: number) => void;
  onDragEnd: (offset: number) => void;
}) {
  const dragStartYRef = React.useRef<number | null>(null);
  const dragOffsetRef = React.useRef(0);
  const didDragRef = React.useRef(false);

  const finishDrag = React.useCallback(
    (offset: number) => {
      dragStartYRef.current = null;
      dragOffsetRef.current = 0;
      if (closeDisabled) {
        onDragMove(0);
        onDragEnd(0);
        return;
      }
      onDragEnd(offset);
    },
    [closeDisabled, onDragEnd, onDragMove],
  );

  const handlePointerDown = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (closeDisabled) {
        return;
      }
      event.preventDefault();
      didDragRef.current = false;
      dragStartYRef.current = event.clientY;
      dragOffsetRef.current = 0;
      event.currentTarget.setPointerCapture(event.pointerId);
      onDragStart();
    },
    [closeDisabled, onDragStart],
  );

  const handlePointerMove = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (closeDisabled || dragStartYRef.current === null) {
        return;
      }
      if (!event.currentTarget.hasPointerCapture(event.pointerId)) {
        return;
      }
      event.preventDefault();
      const delta = Math.max(0, event.clientY - dragStartYRef.current);
      if (delta > 4) {
        didDragRef.current = true;
      }
      dragOffsetRef.current = delta;
      onDragMove(delta);
    },
    [closeDisabled, onDragMove],
  );

  const handlePointerUp = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!event.currentTarget.hasPointerCapture(event.pointerId)) {
        return;
      }
      event.currentTarget.releasePointerCapture(event.pointerId);
      finishDrag(dragOffsetRef.current);
    },
    [finishDrag],
  );

  const handlePointerCancel = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      didDragRef.current = false;
      dragStartYRef.current = null;
      dragOffsetRef.current = 0;
      onDragMove(0);
      onDragEnd(0);
    },
    [onDragEnd, onDragMove],
  );

  return (
    <div
      role="button"
      tabIndex={closeDisabled ? -1 : 0}
      aria-label={closeLabel}
      aria-disabled={closeDisabled}
      className={cn(
        "flex w-full shrink-0 cursor-grab touch-none select-none items-center justify-center py-2 active:cursor-grabbing md:hidden",
        closeDisabled && "pointer-events-none opacity-50",
      )}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onKeyDown={(event) => {
        if (closeDisabled) {
          return;
        }
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onRequestClose();
        }
      }}
      onClick={(event) => {
        event.stopPropagation();
        if (didDragRef.current) {
          didDragRef.current = false;
          return;
        }
        onRequestClose();
      }}
    >
      <span
        className="h-1 w-20 rounded-full bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.1)] dark:bg-white/90"
        aria-hidden
      />
    </div>
  );
}

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
  description?: React.ReactNode;
  footer?: React.ReactNode;
  menu?: PopupMenu;
  width?: PopupWidth;
  onClose?: () => void;
  /** Return false to keep the popup open (called before the close animation). */
  onCloseRequest?: () => boolean | void;
  closeLabel?: string;
  /** When true, overlay click and close button do nothing. */
  closeDisabled?: boolean;
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

function PopupDescription({ description }: { description: React.ReactNode }) {
  if (typeof description === "string") {
    return <p className="text-sm leading-5 text-muted-foreground">{description}</p>;
  }

  return <>{description}</>;
}

const popupHeaderPaddingClassName = (withMenu: boolean) =>
  cn(
    withMenu ? "px-4 pt-4 pb-4 md:pr-12" : "px-6 pt-6 pb-4 md:pr-12 max-md:px-4 max-md:pt-4 max-md:pb-4",
  );

const popupDescriptionPaddingClassName = (withMenu: boolean) =>
  cn(withMenu ? "px-4 md:pr-12" : "px-6 max-md:px-4 md:pr-12", "pb-6");

const popupContentPaddingClassName = (withMenu: boolean, hasDescription: boolean) =>
  cn(
    withMenu ? "px-4" : "px-6 max-md:px-4",
    hasDescription ? "pb-4 pt-0" : "py-4",
  );

const popupFooterPaddingClassName = (withMenu: boolean) =>
  withMenu ? "px-4 pt-4 pb-4 max-md:pt-3" : "px-6 pt-4 pb-6 max-md:px-4 max-md:pt-3 max-md:pb-4";

function PopupTitleSection({
  header,
  withMenu,
  showScrollShadow,
  className,
}: {
  header: React.ReactNode;
  withMenu: boolean;
  showScrollShadow: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        popupChromeSurfaceClassName,
        popupHeaderShadowClassName(showScrollShadow),
        popupHeaderPaddingClassName(withMenu),
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <div className="min-w-0 flex-1">
          <PopupHeader header={header} />
        </div>
      </div>
    </div>
  );
}

function PopupDescriptionSection({
  description,
  withMenu,
  className,
}: {
  description: React.ReactNode;
  withMenu: boolean;
  className?: string;
}) {
  return (
    <div className={cn(popupDescriptionPaddingClassName(withMenu), className)}>
      <PopupDescription description={description} />
    </div>
  );
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

function usePopupScrollEdges(scrollAreaRef: React.RefObject<HTMLElement | null>): PopupScrollEdges {
  const [edges, setEdges] = React.useState<PopupScrollEdges>({ fromTop: false, fromBottom: false });

  React.useEffect(() => {
    const root = scrollAreaRef.current;
    if (!root) {
      return;
    }

    const viewport = getScrollAreaViewport(root);
    if (!viewport) {
      return;
    }

    const update = () => {
      setEdges(readPopupScrollEdges(viewport));
    };

    update();
    viewport.addEventListener("scroll", update, { passive: true });

    const resizeObserver = typeof ResizeObserver !== "undefined" ? new ResizeObserver(update) : null;
    resizeObserver?.observe(viewport);

    return () => {
      viewport.removeEventListener("scroll", update);
      resizeObserver?.disconnect();
    };
  }, [scrollAreaRef]);

  return edges;
}

export const Popup = React.forwardRef<HTMLDivElement, PopupProps>(
  (
    {
      className,
      panelClassName,
      contentClassName,
      header,
      description,
      footer,
      menu,
      width = 720,
      onClose,
      onCloseRequest,
      closeLabel = "Close popup",
      closeDisabled = false,
      children,
      style,
      onClick,
      role = "dialog",
      ...props
    },
    ref,
  ) => {
    const [isClosing, setIsClosing] = React.useState(false);
    const [sheetDragOffset, setSheetDragOffset] = React.useState(0);
    const [isSheetDragging, setIsSheetDragging] = React.useState(false);
    const closeTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const contentScrollAreaRef = React.useRef<HTMLDivElement>(null);
    const scrollEdges = usePopupScrollEdges(contentScrollAreaRef);
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
      if (!onClose || isClosing || closeDisabled) {
        return;
      }
      if (onCloseRequest?.() === false) {
        return;
      }

      setIsClosing(true);
      closeTimerRef.current = setTimeout(() => {
        onClose();
      }, POPUP_ANIMATION_MS);
    }, [closeDisabled, isClosing, onClose, onCloseRequest]);

    const handleSheetDragMove = React.useCallback((offset: number) => {
      setSheetDragOffset(offset);
    }, []);

    const handleSheetDragStart = React.useCallback(() => {
      flushSync(() => {
        setIsSheetDragging(true);
        setSheetDragOffset(0);
      });
    }, []);

    const handleSheetDragEnd = React.useCallback(
      (offset: number) => {
        setIsSheetDragging(false);
        if (offset > MOBILE_SHEET_DRAG_DISMISS_PX) {
          requestClose();
          return;
        }
        setSheetDragOffset(0);
      },
      [requestClose],
    );

    const hasMenu = Boolean(menu);
    const hasDescription = Boolean(description);

    return (
      <div
        ref={ref}
        role={role}
        aria-modal={role === "dialog" ? true : undefined}
        data-state={isClosing ? "closing" : "open"}
        className={cn(
          "okkey-popup-overlay fixed inset-0 z-50 !m-0 flex items-center justify-center overflow-hidden bg-black/30 p-4 text-foreground",
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
        <div className="pointer-events-none relative flex max-h-[calc(100dvh-32px)] w-[min(var(--okkey-popup-width),calc(100vw-32px))] max-md:max-h-none max-md:w-full">
          <div
            data-state={isClosing ? "closing" : "open"}
            className={cn(
              "okkey-popup-sheet pointer-events-auto flex w-full min-h-0 flex-col max-md:w-full max-md:min-h-[88dvh] max-md:max-h-[calc(100dvh-16px)]",
              (isSheetDragging || sheetDragOffset > 0) && "max-md:[animation:none]",
              sheetDragOffset > 0 && !isClosing && "max-md:transition-none",
            )}
            style={{
              ...((isSheetDragging || sheetDragOffset > 0) && !isClosing ? { animation: "none" } : {}),
              ...(sheetDragOffset > 0 && !isClosing
                ? { transform: `translateY(${sheetDragOffset}px)` }
                : isClosing && sheetDragOffset > 0
                  ? { "--okkey-sheet-drag-y": `${sheetDragOffset}px` }
                  : {}),
            }}
          >
            {onClose ? (
              <PopupMobileSheetHandle
                closeLabel={closeLabel}
                closeDisabled={closeDisabled || isClosing}
                onRequestClose={requestClose}
                onDragStart={handleSheetDragStart}
                onDragMove={handleSheetDragMove}
                onDragEnd={handleSheetDragEnd}
              />
            ) : null}
            <div
              data-state={isClosing ? "closing" : "open"}
              className={cn(
                "okkey-popup-panel relative flex min-h-0 w-full max-h-[calc(100dvh-32px)] flex-col overflow-hidden rounded-xl bg-background",
                menu && "md:flex-row",
                "max-md:w-full max-md:min-h-0 max-md:flex-1 max-md:max-h-none max-md:flex-col max-md:rounded-b-none max-md:rounded-t-xl",
                panelClassName,
              )}
              onClick={(event) => event.stopPropagation()}
            >
              {onClose ? (
                <button
                  type="button"
                  aria-label={closeLabel}
                  className={cn(
                    "absolute z-20 flex size-8 items-center justify-center rounded-md outline-none transition-[background-color,color]",
                    "right-4 top-4 text-foreground/70 hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
                    "max-md:hidden",
                  )}
                  onClick={requestClose}
                >
                  <PopupCloseIcon className="size-4" />
                </button>
              ) : null}
          {menu ? (
            <aside className="hidden w-60 min-h-0 shrink-0 overflow-hidden bg-secondary p-2 md:block">
              <ScrollArea className="h-full max-h-[inherit]">
                <PopupMenuItems menu={menu} surface="sidebar" />
              </ScrollArea>
            </aside>
          ) : null}

          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <PopupTitleSection
              header={header}
              withMenu={hasMenu}
              showScrollShadow={scrollEdges.fromTop}
              className="shrink-0 max-md:hidden"
            />

            <ScrollArea ref={contentScrollAreaRef} className="min-h-0 flex-1 max-h-full">
              {menu ? (
                <div className="px-4 pt-4 md:hidden">
                  <PopupMobileMenu menu={menu} />
                </div>
              ) : null}

              <PopupTitleSection
                header={header}
                withMenu={hasMenu}
                showScrollShadow={false}
                className="md:hidden"
              />

              {description ? <PopupDescriptionSection description={description} withMenu={hasMenu} /> : null}

              <div className={cn(popupContentPaddingClassName(hasMenu, hasDescription), contentClassName)}>{children}</div>
            </ScrollArea>

            {footer ? (
              <div
                className={cn(
                  popupChromeSurfaceClassName,
                  popupFooterShadowClassName(scrollEdges.fromBottom),
                  "flex shrink-0 items-center justify-end gap-2",
                  popupFooterPaddingClassName(hasMenu),
                )}
              >
                {footer}
              </div>
            ) : null}
          </div>
          </div>
          </div>
        </div>
      </div>
    );
  },
);
Popup.displayName = "Popup";
