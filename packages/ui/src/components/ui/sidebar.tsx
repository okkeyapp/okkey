import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "../../lib/utils.js";

type SidebarContextValue = {
  /** Full-width sidebar (labels, tree, actions). */
  expanded: boolean;
  setExpanded: (expanded: boolean) => void;
  toggleSidebar: () => void;
};

const SidebarContext = React.createContext<SidebarContextValue | null>(null);

export function useSidebar(): SidebarContextValue {
  const ctx = React.useContext(SidebarContext);
  if (!ctx) {
    throw new Error("useSidebar must be used within a SidebarProvider.");
  }
  return ctx;
}

export type SidebarProviderProps = React.PropsWithChildren<{
  defaultExpanded?: boolean;
  /**
   * When set, `expanded` is restored from `localStorage` on mount and saved on every change
   * (collapse/expand survives route remounts). Client-only; missing/invalid values fall back to `defaultExpanded`.
   */
  persistExpandedStorageKey?: string;
}>;

function readExpandedFromStorage(key: string | undefined, defaultExpanded: boolean): boolean {
  if (!key || typeof window === "undefined") {
    return defaultExpanded;
  }
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === "false" || raw === "0") {
      return false;
    }
    if (raw === "true" || raw === "1") {
      return true;
    }
  } catch {
    /* private mode / quota */
  }
  return defaultExpanded;
}

function writeExpandedToStorage(key: string | undefined, expanded: boolean) {
  if (!key || typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(key, expanded ? "true" : "false");
  } catch {
    /* ignore */
  }
}

export function SidebarProvider({
  defaultExpanded = true,
  children,
  persistExpandedStorageKey,
}: SidebarProviderProps) {
  const storageKey = persistExpandedStorageKey;
  const [expanded, setExpandedState] = React.useState(() =>
    readExpandedFromStorage(storageKey, defaultExpanded),
  );

  const setExpanded = React.useCallback(
    (value: boolean | ((prev: boolean) => boolean)) => {
      setExpandedState((prev) => {
        const next = typeof value === "function" ? (value as (p: boolean) => boolean)(prev) : value;
        writeExpandedToStorage(storageKey, next);
        return next;
      });
    },
    [storageKey],
  );

  const toggleSidebar = React.useCallback(() => {
    setExpanded((v) => !v);
  }, [setExpanded]);

  const value = React.useMemo(
    () => ({ expanded, setExpanded, toggleSidebar }),
    [expanded, setExpanded, toggleSidebar],
  );
  return <SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>;
}

const SidebarRoot = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<"div">>(
  ({ className, ...props }, ref) => {
    const { expanded } = useSidebar();
    return (
      <div
        ref={ref}
        data-sidebar="root"
        data-expanded={expanded ? "true" : "false"}
        className={cn(
          "flex h-full shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] duration-200 ease-out",
          expanded ? "w-[255px]" : "w-[52px]",
          className,
        )}
        {...props}
      />
    );
  },
);
SidebarRoot.displayName = "Sidebar";

export const Sidebar = SidebarRoot;

export const SidebarHeader = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<"div">>(
  ({ className, ...props }, ref) => (
    <div ref={ref} data-sidebar="header" className={cn("flex flex-col gap-0 p-2", className)} {...props} />
  ),
);
SidebarHeader.displayName = "SidebarHeader";

export const SidebarFooter = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<"div">>(
  ({ className, ...props }, ref) => (
    <div ref={ref} data-sidebar="footer" className={cn("flex flex-col gap-0 p-2", className)} {...props} />
  ),
);
SidebarFooter.displayName = "SidebarFooter";

export const SidebarContent = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<"div">>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      data-sidebar="content"
      className={cn("relative flex min-h-0 flex-1 flex-col overflow-hidden", className)}
      {...props}
    />
  ),
);
SidebarContent.displayName = "SidebarContent";

export const SidebarSeparator = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<"div">>(
  ({ className, ...props }, ref) => (
    <div ref={ref} role="separator" className={cn("mx-2 h-px shrink-0 bg-sidebar-border", className)} {...props} />
  ),
);
SidebarSeparator.displayName = "SidebarSeparator";

export const SidebarGroup = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<"div">>(
  ({ className, ...props }, ref) => (
    <div ref={ref} data-sidebar="group" className={cn("relative flex w-full min-w-0 flex-col p-2", className)} {...props} />
  ),
);
SidebarGroup.displayName = "SidebarGroup";

export const SidebarGroupLabel = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<"div">>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      data-sidebar="group-label"
      className={cn(
        "flex h-8 shrink-0 items-center px-2 text-xs font-medium leading-4 tracking-normal text-muted-foreground",
        className,
      )}
      {...props}
    />
  ),
);
SidebarGroupLabel.displayName = "SidebarGroupLabel";

export const SidebarGroupAction = React.forwardRef<
  HTMLButtonElement,
  React.ComponentPropsWithoutRef<"button"> & { asChild?: boolean }
>(({ className, asChild = false, ...props }, ref) => {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      ref={ref as never}
      data-sidebar="group-action"
      className={cn(
        "absolute right-3 top-3 z-10 flex size-6 items-center justify-center rounded-sm border border-transparent bg-secondary text-foreground outline-none ring-sidebar-ring transition hover:bg-muted focus-visible:ring-2",
        className,
      )}
      {...props}
    />
  );
});
SidebarGroupAction.displayName = "SidebarGroupAction";

export const SidebarMenu = React.forwardRef<HTMLUListElement, React.ComponentPropsWithoutRef<"ul">>(
  ({ className, ...props }, ref) => (
    <ul ref={ref} data-sidebar="menu" className={cn("flex w-full min-w-0 flex-col gap-0", className)} {...props} />
  ),
);
SidebarMenu.displayName = "SidebarMenu";

export const SidebarMenuItem = React.forwardRef<HTMLLIElement, React.ComponentPropsWithoutRef<"li">>(
  ({ className, ...props }, ref) => (
    <li ref={ref} data-sidebar="menu-item" className={cn("group/menu-item relative", className)} {...props} />
  ),
);
SidebarMenuItem.displayName = "SidebarMenuItem";

const sidebarMenuButtonVariants = cva(
  "peer/menu-button flex w-full items-center gap-2 overflow-hidden rounded-lg px-2 text-left text-sm outline-none ring-sidebar-ring transition-[background-color,color,box-shadow] focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-50 [&>svg]:size-4 [&>svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-transparent text-sidebar-foreground hover:bg-[rgba(0,0,0,0.05)] hover:text-sidebar-foreground dark:hover:bg-[rgba(255,255,255,0.08)] dark:hover:text-sidebar-foreground",
        outline:
          "bg-background shadow-[0_1px_2px_rgba(0,0,0,0.05)] hover:bg-[rgba(0,0,0,0.05)] hover:text-sidebar-foreground dark:shadow-[0_1px_2px_rgba(255,255,255,0.05)] dark:hover:bg-[rgba(255,255,255,0.08)]",
      },
      size: {
        default: "h-8 min-h-8 py-0",
        sm: "h-7 min-h-7 text-xs",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export type SidebarMenuButtonProps = React.ComponentPropsWithoutRef<"button"> &
  VariantProps<typeof sidebarMenuButtonVariants> & {
    asChild?: boolean;
    isActive?: boolean;
  };

export const SidebarMenuButton = React.forwardRef<HTMLButtonElement, SidebarMenuButtonProps>(
  ({ asChild = false, isActive = false, variant = "default", size = "default", className, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        ref={ref as never}
        data-sidebar="menu-button"
        data-active={isActive}
        className={cn(
          sidebarMenuButtonVariants({ variant, size }),
          isActive &&
            "bg-[rgba(0,0,0,0.05)] font-medium text-sidebar-foreground dark:bg-[rgba(255,255,255,0.08)] dark:text-sidebar-foreground",
          className,
        )}
        {...props}
      />
    );
  },
);
SidebarMenuButton.displayName = "SidebarMenuButton";

export const SidebarMenuAction = React.forwardRef<
  HTMLButtonElement,
  React.ComponentPropsWithoutRef<"button"> & {
    asChild?: boolean;
    showOnHover?: boolean;
  }
>(({ className, asChild = false, showOnHover = false, ...props }, ref) => {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      ref={ref as never}
      data-sidebar="menu-action"
      className={cn(
        "absolute right-1 top-1 z-10 flex size-6 items-center justify-center rounded-sm bg-secondary text-foreground outline-none ring-sidebar-ring transition hover:bg-muted focus-visible:ring-2",
        showOnHover &&
          "opacity-0 group-hover/menu-item:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100",
        className,
      )}
      {...props}
    />
  );
});
SidebarMenuAction.displayName = "SidebarMenuAction";

export const SidebarMenuSub = React.forwardRef<HTMLUListElement, React.ComponentPropsWithoutRef<"ul">>(
  ({ className, ...props }, ref) => (
    <ul
      ref={ref}
      data-sidebar="menu-sub"
      className={cn(
        "ml-3.5 mr-0 flex min-w-0 translate-x-px flex-col gap-0 border-l border-sidebar-border py-0.5 pl-2.5 pr-0",
        className,
      )}
      {...props}
    />
  ),
);
SidebarMenuSub.displayName = "SidebarMenuSub";

export const SidebarMenuSubItem = React.forwardRef<HTMLLIElement, React.ComponentPropsWithoutRef<"li">>(
  ({ ...props }, ref) => <li ref={ref} {...props} />,
);
SidebarMenuSubItem.displayName = "SidebarMenuSubItem";

export const SidebarMenuSubButton = React.forwardRef<
  HTMLButtonElement,
  React.ComponentPropsWithoutRef<"button"> & {
    asChild?: boolean;
    size?: "sm" | "md";
    isActive?: boolean;
  }
>(({ asChild = false, size = "md", isActive = false, className, type = "button", ...props }, ref) => {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      ref={ref as never}
      type={asChild ? undefined : type}
      data-sidebar="menu-sub-button"
      data-size={size}
      data-active={isActive}
      className={cn(
        "flex h-8 min-w-0 w-full -translate-x-px items-center gap-2 overflow-hidden rounded-lg px-2 text-left text-sm text-sidebar-foreground outline-none ring-sidebar-ring transition-[background-color,color] hover:bg-[rgba(0,0,0,0.05)] hover:text-sidebar-foreground focus-visible:ring-2 dark:hover:bg-[rgba(255,255,255,0.08)] dark:hover:text-sidebar-foreground [&>svg]:size-4 [&>svg]:shrink-0",
        size === "sm" && "text-xs",
        isActive &&
          "bg-[rgba(0,0,0,0.05)] font-medium text-sidebar-foreground dark:bg-[rgba(255,255,255,0.08)] dark:text-sidebar-foreground",
        className,
      )}
      {...props}
    />
  );
});
SidebarMenuSubButton.displayName = "SidebarMenuSubButton";
