import * as React from "react";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "./collapsible.js";
import { DropdownMenuItem } from "./dropdown-menu.js";
import { ScrollArea } from "./scroll-area.js";
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip.js";
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "./sidebar.js";
import { cn } from "../../lib/utils.js";

export function SidebarSettingsMenuIcon({ className, ...props }: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      className={className}
      {...props}
    >
      <path
        d="M8.14667 1.33325H7.85333C7.49971 1.33325 7.16057 1.47373 6.91053 1.72378C6.66048 1.97382 6.52 2.31296 6.52 2.66659V2.78659C6.51976 3.0204 6.45804 3.25005 6.34103 3.45248C6.22401 3.65491 6.05583 3.82301 5.85333 3.93992L5.56667 4.10659C5.36398 4.22361 5.13405 4.28522 4.9 4.28522C4.66595 4.28522 4.43603 4.22361 4.23333 4.10659L4.13333 4.05325C3.82738 3.87676 3.46389 3.82888 3.12267 3.92012C2.78145 4.01137 2.49037 4.23428 2.31333 4.53992L2.16667 4.79325C1.99018 5.09921 1.9423 5.46269 2.03354 5.80392C2.12478 6.14514 2.34769 6.43622 2.65333 6.61325L2.75333 6.67992C2.95485 6.79626 3.12241 6.96331 3.23937 7.16447C3.35632 7.36563 3.4186 7.5939 3.42 7.82658V8.16658C3.42093 8.40153 3.35977 8.63255 3.2427 8.83626C3.12563 9.03996 2.95681 9.20911 2.75333 9.32658L2.65333 9.38658C2.34769 9.56362 2.12478 9.8547 2.03354 10.1959C1.9423 10.5371 1.99018 10.9006 2.16667 11.2066L2.31333 11.4599C2.49037 11.7656 2.78145 11.9885 3.12267 12.0797C3.46389 12.171 3.82738 12.1231 4.13333 11.9466L4.23333 11.8933C4.43603 11.7762 4.66595 11.7146 4.9 11.7146C5.13405 11.7146 5.36398 11.7762 5.56667 11.8933L5.85333 12.0599C6.05583 12.1768 6.22401 12.3449 6.34103 12.5474C6.45804 12.7498 6.51976 12.9794 6.52 13.2133V13.3333C6.52 13.6869 6.66048 14.026 6.91053 14.2761C7.16057 14.5261 7.49971 14.6666 7.85333 14.6666H8.14667C8.50029 14.6666 8.83943 14.5261 9.08948 14.2761C9.33953 14.026 9.48 13.6869 9.48 13.3333V13.2133C9.48024 12.9794 9.54196 12.7498 9.65898 12.5474C9.77599 12.3449 9.94418 12.1768 10.1467 12.0599L10.4333 11.8933C10.636 11.7762 10.866 11.7146 11.1 11.7146C11.3341 11.7146 11.564 11.7762 11.7667 11.8933L11.8667 11.9466C12.1726 12.1231 12.5361 12.171 12.8773 12.0797C13.2186 11.9885 13.5096 11.7656 13.6867 11.4599L13.8333 11.1999C14.0098 10.894 14.0577 10.5305 13.9665 10.1893C13.8752 9.84803 13.6523 9.55695 13.3467 9.37992L13.2467 9.32658C13.0432 9.20911 12.8744 9.03996 12.7573 8.83626C12.6402 8.63255 12.5791 8.40153 12.58 8.16658V7.83325C12.5791 7.5983 12.6402 7.36728 12.7573 7.16358C12.8744 6.95988 13.0432 6.79072 13.2467 6.67325L13.3467 6.61325C13.6523 6.43622 13.8752 6.14514 13.9665 5.80392C14.0577 5.46269 14.0098 5.09921 13.8333 4.79325L13.6867 4.53992C13.5096 4.23428 13.2186 4.01137 12.8773 3.92012C12.5361 3.82888 12.1726 3.87676 11.8667 4.05325L11.7667 4.10659C11.564 4.22361 11.3341 4.28522 11.1 4.28522C10.866 4.28522 10.636 4.22361 10.4333 4.10659L10.1467 3.93992C9.94418 3.82301 9.77599 3.65491 9.65898 3.45248C9.54196 3.25005 9.48024 3.0204 9.48 2.78659V2.66659C9.48 2.31296 9.33953 1.97382 9.08948 1.72378C8.83943 1.47373 8.50029 1.33325 8.14667 1.33325Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M8 9.99992C9.10457 9.99992 10 9.10449 10 7.99992C10 6.89535 9.10457 5.99992 8 5.99992C6.89543 5.99992 6 6.89535 6 7.99992C6 9.10449 6.89543 9.99992 8 9.99992Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PlusMenuIcon({ className, ...props }: React.SVGProps<SVGSVGElement>) {
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
        d="M3.33337 8.00004H12.6667M8.00004 3.33337V12.6667"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ChevronDownMenuIcon({ className, ...props }: React.SVGProps<SVGSVGElement>) {
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
        d="M4 6L8 10L12 6"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const sidebarRowHoverClassName =
  "hover:bg-[rgba(0,0,0,0.05)] dark:hover:bg-[rgba(255,255,255,0.08)]";

const sidebarSubtleControlSurfaceClassName =
  "bg-[rgba(0,0,0,0.05)] hover:bg-[rgba(0,0,0,0.1)] dark:bg-[rgba(255,255,255,0.08)] dark:hover:bg-[rgba(255,255,255,0.14)]";

function sidebarSectionPlusButton(className?: string) {
  return cn(
    "inline-flex size-6 shrink-0 items-center justify-center rounded-lg text-foreground outline-none ring-sidebar-ring transition focus-visible:ring-2",
    sidebarSubtleControlSurfaceClassName,
    className,
  );
}

function sidebarSectionSettingsButton(className?: string) {
  return cn(
    "inline-flex size-6 shrink-0 items-center justify-center rounded-lg text-muted-foreground outline-none ring-sidebar-ring transition hover:text-foreground focus-visible:ring-2",
    sidebarRowHoverClassName,
    className,
  );
}

/** Popover folder tree: same hover tint as sidebar rows (`SidebarMenuButton`), not `bg-secondary`. */
/** Chevron points down when open, right when closed; `group` lives on the CollapsibleTrigger surface. */
const folderTreeChevronClassName = "size-4 shrink-0 transition group-data-[state=closed]:-rotate-90";

/** Vertical stack spacing in folder tree (sibling rows). */
const folderTreeGapClassName = "gap-0";

const folderTreeCollapsibleClassName = cn("flex flex-col", folderTreeGapClassName);

const folderTreeSubMenuClassName = cn(folderTreeGapClassName, "py-0");

/** Pull nested rows back so label buttons align with the parent row while `SidebarMenuSub` keeps its left guide. */
const folderTreeSubMenuRowOutdentClassName =
  "-ml-[calc(0.875rem+7px+1px)] w-[calc(100%+0.875rem+7px+1px)] pl-[calc(0.875rem+7px+1px)]";

function folderTreeRowClassName(nestedInBranch: boolean) {
  return cn(
    "relative isolate flex h-8 min-w-0 w-full items-center",
    nestedInBranch && folderTreeSubMenuRowOutdentClassName,
  );
}

/** Split branch row: folder control tucks under chevron; hovered control stacks above. */
const folderTreeRowControlClassName = "relative z-[1] hover:z-[2] focus-visible:z-[2]";

const folderTreeChevronControlClassName = "relative z-[1] hover:z-[3] focus-visible:z-[3]";

const folderTreeLabelOverlapClassName = "-ml-[3px]";

function folderTreeSubRowLabelClassName(isActive?: boolean) {
  return cn(
    "h-8 min-w-0 flex-1 cursor-pointer",
    folderTreeRowControlClassName,
    folderTreeLabelOverlapClassName,
    isActive && "z-[2]",
  );
}

function folderTreeSubRowLeafLabelClassName(isActive?: boolean) {
  return cn("h-8 min-w-0 w-full cursor-pointer", folderTreeRowControlClassName, isActive && "z-[2]");
}

function folderTreeTopRowLabelClassName(isActive?: boolean) {
  return cn(
    "h-8 min-w-0 flex-1 cursor-pointer",
    folderTreeRowControlClassName,
    folderTreeLabelOverlapClassName,
    isActive && "z-[2]",
  );
}

function folderDropdownBranchLinkClassName(isActive?: boolean) {
  return cn(
    folderDropdownInteractiveRowClassName,
    "h-8 min-w-0 flex-1 py-0",
    folderTreeRowControlClassName,
    folderTreeLabelOverlapClassName,
    isActive && "z-[2]",
  );
}

function folderDropdownLeafLinkClassName(isActive?: boolean) {
  return cn(
    folderDropdownInteractiveRowClassName,
    "h-8 min-w-0 w-full py-0",
    folderTreeRowControlClassName,
    isActive && "z-[2]",
  );
}

/** Same surface as `SidebarMenuButton` / `SidebarMenuSubButton` rows. */
const folderTreeRowInteractiveClassName =
  "bg-transparent text-sidebar-foreground outline-none ring-sidebar-ring transition-[background-color,color] hover:bg-[rgba(0,0,0,0.05)] hover:text-sidebar-foreground focus-visible:ring-2 dark:hover:bg-[rgba(255,255,255,0.08)] dark:hover:text-sidebar-foreground";

const folderTreeChevronHoverClassName =
  "border border-transparent hover:border-input hover:bg-background hover:shadow-[0_1px_2px_rgba(0,0,0,0.05)] dark:hover:bg-background dark:hover:shadow-[0_1px_2px_rgba(255,255,255,0.05)]";

const folderTreeChevronButtonClassName = cn(
  "group inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-lg bg-transparent text-sidebar-foreground outline-none ring-sidebar-ring transition-[background-color,color,box-shadow,border-color] focus-visible:ring-2",
  folderTreeChevronControlClassName,
  folderTreeChevronHoverClassName,
  "ml-0.5",
);

function resolveFolderNavLink(
  node: OkkeySidebarFolderTreeNode,
  linkComponent?: OkkeyWorkspaceNavLinkComponent,
) {
  const href = node.to;
  const LinkC = typeof href === "string" && href.length > 0 && linkComponent ? linkComponent : null;
  return { href, LinkC };
}

function folderLeafBody(leafIcon: React.ReactNode, label: string, withIcon = true) {
  return (
    <>
      {withIcon ? leafIcon : null}
      <span className="truncate text-sm leading-5">{label}</span>
    </>
  );
}

const folderDropdownInteractiveRowClassName = cn(
  "group relative flex w-full min-w-0 cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-2 text-left text-sm text-foreground outline-none transition-[background-color,color]",
  sidebarRowHoverClassName,
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
);

const folderDropdownChevronButtonClassName = cn(
  "group inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-lg bg-transparent text-foreground outline-none transition-[background-color,color,box-shadow,border-color] focus-visible:ring-2 focus-visible:ring-ring",
  folderTreeChevronControlClassName,
  folderTreeChevronHoverClassName,
  "ml-0.5",
);

const folderDropdownBranchLinkActiveClassName =
  "bg-[rgba(0,0,0,0.05)] text-foreground dark:bg-[rgba(255,255,255,0.08)]";

/**
 * Radix menu only drives `data-[highlighted]` from pointer move when `pointerType === "mouse"` (`whenMouse` in @radix-ui/react-menu),
 * so trackpad / some browsers never get that attribute. `hover:` / `focus-visible:` mirror the same tint for all pointers + keyboard.
 */
const folderDropdownMenuItemClassName = cn(
  "cursor-pointer gap-2 outline-none",
  "data-[highlighted]:bg-[rgba(0,0,0,0.05)] data-[highlighted]:text-foreground dark:data-[highlighted]:bg-[rgba(255,255,255,0.08)]",
  "hover:bg-[rgba(0,0,0,0.05)] hover:text-foreground dark:hover:bg-[rgba(255,255,255,0.08)]",
  "focus-visible:bg-[rgba(0,0,0,0.05)] focus-visible:text-foreground dark:focus-visible:bg-[rgba(255,255,255,0.08)]",
);

function NavPlusControlTooltip({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Tooltip delayDuration={0}>
      <TooltipTrigger asChild>
        <span className="inline-flex shrink-0 items-center justify-center">{children}</span>
      </TooltipTrigger>
      <TooltipContent side="right" align="center">
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

/** Tailwind `group/<name>` on collapsible root (nested folder rows use `group` for chevrons). */
function collapsibleGroupClass(name: string) {
  return `group/${name}`;
}

// —— Workspace ——————————————————————————————————————————————————

export type OkkeySidebarWorkspaceNavItem = {
  id: string;
  icon: React.ReactNode;
  label: string;
  /** When set with {@link OkkeySidebarWorkspaceMenuProps.linkComponent}, row navigates client-side. */
  to?: string;
  /** Highlights the row (e.g. current route) when using a link. */
  isActive?: boolean;
  trailingPlus?: boolean;
  addAriaLabel?: string;
  onAddPointerDown?: (event: React.PointerEvent<HTMLButtonElement>) => void;
};

/** Must support ref for Radix `asChild` (menus, collapsible triggers). */
export type OkkeyWorkspaceNavLinkComponent = React.ForwardRefExoticComponent<
  React.PropsWithoutRef<{
    to: string;
    className?: string;
    children: React.ReactNode;
    "aria-current"?: React.ComponentProps<"a">["aria-current"];
  }> &
    React.RefAttributes<HTMLAnchorElement>
>;

export type OkkeySidebarWorkspaceMenuProps = {
  labelText: string;
  items: OkkeySidebarWorkspaceNavItem[];
  /** Required for navigation when items include `to`. */
  linkComponent?: OkkeyWorkspaceNavLinkComponent;
};

export function OkkeySidebarWorkspaceMenu({ labelText, items, linkComponent }: OkkeySidebarWorkspaceMenuProps) {
  return (
    <SidebarGroup className="p-0">
      <SidebarGroupLabel>{labelText}</SidebarGroupLabel>
      <SidebarMenu>
        {items.map((item) => {
          const href = item.to;
          const LinkC = typeof href === "string" && href.length > 0 && linkComponent ? linkComponent : null;
          const rowBody = (
            <>
              {item.icon}
              <span className="truncate">{item.label}</span>
            </>
          );

          if (item.trailingPlus) {
            return (
              <SidebarMenuItem key={item.id}>
                <div className="flex items-center gap-2">
                  {LinkC && href ? (
                    <SidebarMenuButton asChild isActive={item.isActive} className="flex-1 pr-8">
                      <LinkC to={href}>{rowBody}</LinkC>
                    </SidebarMenuButton>
                  ) : (
                    <SidebarMenuButton type="button" isActive={item.isActive} className="flex-1 pr-8">
                      {rowBody}
                    </SidebarMenuButton>
                  )}
                  <NavPlusControlTooltip label={item.addAriaLabel ?? "Add"}>
                    <button
                      type="button"
                      className={sidebarSectionPlusButton()}
                      aria-label={item.addAriaLabel ?? "Add"}
                      onPointerDown={item.onAddPointerDown ?? ((e) => e.preventDefault())}
                    >
                      <PlusMenuIcon />
                    </button>
                  </NavPlusControlTooltip>
                </div>
              </SidebarMenuItem>
            );
          }

          return (
            <SidebarMenuItem key={item.id}>
              {LinkC && href ? (
                <SidebarMenuButton asChild isActive={item.isActive}>
                  <LinkC to={href}>{rowBody}</LinkC>
                </SidebarMenuButton>
              ) : (
                <SidebarMenuButton type="button" isActive={item.isActive}>
                  {rowBody}
                </SidebarMenuButton>
              )}
            </SidebarMenuItem>
          );
        })}
      </SidebarMenu>
    </SidebarGroup>
  );
}

// —— Vaults ——————————————————————————————————————————————————————

export type OkkeySidebarVaultItem = {
  id: string;
  leading: React.ReactNode;
  label: string;
  rightIcon?: React.ReactNode;
  /** When set with {@link OkkeySidebarVaultsMenuProps.linkComponent}, row navigates (e.g. `/items?vault=…`). */
  to?: string;
  isActive?: boolean;
};

export type OkkeySidebarVaultsMenuProps = {
  surface: "sidebar-expanded" | "dropdown";
  sectionTitle: string;
  /** `group/<name>` name segment (e.g. `collapsible`). */
  collapsibleGroupName: string;
  items: OkkeySidebarVaultItem[];
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  showHeaderPlus?: boolean;
  headerPlusAriaLabel?: string;
  onHeaderPlusPointerDown?: (event: React.PointerEvent<HTMLButtonElement>) => void;
  linkComponent?: OkkeyWorkspaceNavLinkComponent;
};

function VaultRowSidebar({
  item,
  linkComponent,
}: {
  item: OkkeySidebarVaultItem;
  linkComponent?: OkkeyWorkspaceNavLinkComponent;
}) {
  const href = item.to;
  const LinkC = typeof href === "string" && href.length > 0 && linkComponent ? linkComponent : null;
  const labelEl = item.rightIcon ? (
    <span className="min-w-0 flex-1 truncate">{item.label}</span>
  ) : (
    <span className="truncate">{item.label}</span>
  );
  const rowInner = (
    <>
      {item.leading}
      {labelEl}
    </>
  );
  if (item.rightIcon) {
    return (
      <SidebarMenuItem>
        <div className="flex items-center gap-2">
          {LinkC && href ? (
            <SidebarMenuButton asChild isActive={item.isActive} className="flex-1 pr-8">
              <LinkC to={href}>{rowInner}</LinkC>
            </SidebarMenuButton>
          ) : (
            <SidebarMenuButton type="button" isActive={item.isActive} className="flex-1 pr-8">
              {rowInner}
            </SidebarMenuButton>
          )}
          <div className="flex size-6 shrink-0 items-center justify-center text-muted-foreground" aria-hidden>
            {item.rightIcon}
          </div>
        </div>
      </SidebarMenuItem>
    );
  }
  return (
    <SidebarMenuItem>
      {LinkC && href ? (
        <SidebarMenuButton asChild isActive={item.isActive}>
          <LinkC to={href}>{rowInner}</LinkC>
        </SidebarMenuButton>
      ) : (
        <SidebarMenuButton type="button" isActive={item.isActive}>
          {rowInner}
        </SidebarMenuButton>
      )}
    </SidebarMenuItem>
  );
}

function VaultRowDropdown({
  item,
  linkComponent,
}: {
  item: OkkeySidebarVaultItem;
  linkComponent?: OkkeyWorkspaceNavLinkComponent;
}) {
  const href = item.to;
  const LinkC = typeof href === "string" && href.length > 0 && linkComponent ? linkComponent : null;
  const rowClassName = cn(
    "flex min-w-0 items-center gap-2 rounded-sm px-2 py-2 text-sm text-foreground outline-none",
    item.rightIcon ? "w-full justify-between" : undefined,
    item.isActive
      ? "bg-[rgba(0,0,0,0.05)] text-foreground dark:bg-[rgba(255,255,255,0.08)]"
      : undefined,
  );
  const rowInner = (
    <>
      <span className={cn("flex min-w-0 items-center gap-2", item.rightIcon ? "flex-1" : undefined)}>
        {item.leading}
        <span className="truncate">{item.label}</span>
      </span>
      {item.rightIcon ? <span className="shrink-0 text-muted-foreground">{item.rightIcon}</span> : null}
    </>
  );
  if (LinkC && href) {
    return (
      <DropdownMenuItem asChild className={cn(folderDropdownMenuItemClassName, "p-0")}>
        <LinkC to={href} className={rowClassName} aria-current={item.isActive ? "page" : undefined}>
          {rowInner}
        </LinkC>
      </DropdownMenuItem>
    );
  }
  if (item.rightIcon) {
    return (
      <DropdownMenuItem
        className={cn(folderDropdownMenuItemClassName, "justify-between gap-2", item.isActive ? "bg-[rgba(0,0,0,0.05)] dark:bg-[rgba(255,255,255,0.08)]" : undefined)}
        aria-current={item.isActive ? "page" : undefined}
      >
        <span className="flex min-w-0 items-center gap-2">
          {item.leading}
          <span className="truncate">{item.label}</span>
        </span>
        <span className="shrink-0 text-muted-foreground">{item.rightIcon}</span>
      </DropdownMenuItem>
    );
  }
  return (
    <DropdownMenuItem
      className={cn(folderDropdownMenuItemClassName, "gap-2", item.isActive ? "bg-[rgba(0,0,0,0.05)] dark:bg-[rgba(255,255,255,0.08)]" : undefined)}
      aria-current={item.isActive ? "page" : undefined}
    >
      {item.leading}
      <span>{item.label}</span>
    </DropdownMenuItem>
  );
}

export function OkkeySidebarVaultsMenu({
  surface,
  sectionTitle,
  collapsibleGroupName,
  items,
  open,
  defaultOpen,
  onOpenChange,
  showHeaderPlus,
  headerPlusAriaLabel,
  onHeaderPlusPointerDown,
  linkComponent,
}: OkkeySidebarVaultsMenuProps) {
  const gClass = collapsibleGroupClass(collapsibleGroupName);
  const isControlled = open !== undefined;
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(defaultOpen ?? true);
  const sectionOpen = isControlled ? open : uncontrolledOpen;
  const handleSectionOpenChange = React.useCallback(
    (next: boolean) => {
      if (!isControlled) {
        setUncontrolledOpen(next);
      }
      onOpenChange?.(next);
    },
    [isControlled, onOpenChange],
  );

  const headerRow = (
    <div className="flex h-8 w-full shrink-0 items-center gap-2">
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex h-8 min-w-0 flex-1 items-center gap-2 rounded-lg px-2 pr-8 text-xs font-medium text-muted-foreground outline-none ring-sidebar-ring transition focus-visible:ring-2",
            sidebarRowHoverClassName,
          )}
        >
          <span className="truncate">{sectionTitle}</span>
          <ChevronDownMenuIcon
            className={cn("size-4 shrink-0 transition-transform duration-200", sectionOpen ? "rotate-180" : "rotate-0")}
          />
        </button>
      </CollapsibleTrigger>
      {showHeaderPlus ? (
        <NavPlusControlTooltip label={headerPlusAriaLabel ?? "Add"}>
          <button
            type="button"
            className={sidebarSectionPlusButton()}
            aria-label={headerPlusAriaLabel ?? "Add"}
            onPointerDown={onHeaderPlusPointerDown ?? ((e) => e.preventDefault())}
          >
            <PlusMenuIcon />
          </button>
        </NavPlusControlTooltip>
      ) : null}
    </div>
  );

  const sidebarList = (
    <SidebarMenu>
      {items.map((item) => (
        <VaultRowSidebar key={item.id} item={item} linkComponent={linkComponent} />
      ))}
    </SidebarMenu>
  );

  if (surface === "dropdown") {
    return (
      <>
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-3 py-2">
          <span className="text-xs font-medium leading-4 text-muted-foreground">{sectionTitle}</span>
          {showHeaderPlus ? (
            <NavPlusControlTooltip label={headerPlusAriaLabel ?? "Add"}>
              <button
                type="button"
                className={sidebarSectionPlusButton()}
                aria-label={headerPlusAriaLabel ?? "Add"}
                onPointerDown={onHeaderPlusPointerDown ?? ((e) => e.preventDefault())}
              >
                <PlusMenuIcon />
              </button>
            </NavPlusControlTooltip>
          ) : null}
        </div>
        <ScrollArea className="max-h-[360px]">
          <div className="p-1">
            {items.map((item) => (
              <VaultRowDropdown key={item.id} item={item} linkComponent={linkComponent} />
            ))}
          </div>
        </ScrollArea>
      </>
    );
  }

  return (
    <Collapsible
      open={sectionOpen}
      onOpenChange={handleSectionOpenChange}
      className={gClass}
    >
      <SidebarGroup className="p-0">
        {headerRow}
        <CollapsibleContent>{sidebarList}</CollapsibleContent>
      </SidebarGroup>
    </Collapsible>
  );
}

// —— Folders (tree) ———————————————————————————————————————————————

/**
 * Tree for the Folders sidebar / dropdown. Nodes with `children` expose a chevron to expand the subtree
 * and a separate label control; set `to` + `isActive` on any node when integrated with routing
 * (web: `itemsPathWithFolder` + current `folder` query param).
 */
export type OkkeySidebarFolderTreeNode = {
  id: string;
  label: string;
  defaultOpen?: boolean;
  /** Folder filter navigation target, e.g. `/items?folder=…`. */
  to?: string;
  isActive?: boolean;
  children?: OkkeySidebarFolderTreeNode[];
};

export type OkkeySidebarFoldersMenuProps = {
  surface: "sidebar-expanded" | "dropdown";
  sectionTitle: string;
  collapsibleGroupName: string;
  tree: OkkeySidebarFolderTreeNode[];
  leafIcon: React.ReactNode;
  /** Shown under the section header when `tree` is empty (host app supplies i18n). */
  emptyLabel?: string;
  showHeaderPlus?: boolean;
  headerPlusAriaLabel?: string;
  onHeaderPlusPointerDown?: (event: React.PointerEvent<HTMLButtonElement>) => void;
  headerActionIcon?: React.ReactNode;
  onHeaderActionClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  linkComponent?: OkkeyWorkspaceNavLinkComponent;
};

function FolderHeaderActionButton({
  ariaLabel,
  icon,
  onClick,
  onPointerDown,
  variant = "plus",
}: {
  ariaLabel: string;
  icon: React.ReactNode;
  onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  onPointerDown?: (event: React.PointerEvent<HTMLButtonElement>) => void;
  variant?: "plus" | "settings";
}) {
  return (
    <NavPlusControlTooltip label={ariaLabel}>
      <button
        type="button"
        className={variant === "settings" ? sidebarSectionSettingsButton() : sidebarSectionPlusButton()}
        aria-label={ariaLabel}
        onPointerDown={(event) => {
          event.preventDefault();
          onPointerDown?.(event);
        }}
        onClick={(event) => {
          event.stopPropagation();
          onClick?.(event);
        }}
      >
        {icon}
      </button>
    </NavPlusControlTooltip>
  );
}

function FolderSubTreeSidebar({
  nodes,
  leafIcon,
  branchGroupName,
  linkComponent,
  nestedInBranch = false,
}: {
  nodes: OkkeySidebarFolderTreeNode[];
  leafIcon: React.ReactNode;
  branchGroupName: string;
  linkComponent?: OkkeyWorkspaceNavLinkComponent;
  nestedInBranch?: boolean;
}) {
  return (
    <>
      {nodes.map((node) => {
        if (node.children?.length) {
          const gName = `${branchGroupName}-${node.id}`;
          const { href, LinkC } = resolveFolderNavLink(node, linkComponent);
          return (
            <SidebarMenuSubItem key={node.id}>
              <Collapsible defaultOpen={false} className={folderTreeCollapsibleClassName}>
                <div className={folderTreeRowClassName(nestedInBranch)}>
                  <CollapsibleTrigger asChild>
                    <button
                      type="button"
                      className={folderTreeChevronButtonClassName}
                      onPointerDown={(e) => e.preventDefault()}
                    >
                      <ChevronDownMenuIcon className={folderTreeChevronClassName} />
                    </button>
                  </CollapsibleTrigger>
                  {LinkC && href ? (
                    <SidebarMenuSubButton asChild isActive={node.isActive} className={folderTreeSubRowLabelClassName(node.isActive)}>
                      <LinkC to={href}>{folderLeafBody(leafIcon, node.label, false)}</LinkC>
                    </SidebarMenuSubButton>
                  ) : (
                    <SidebarMenuSubButton
                      type="button"
                      isActive={node.isActive}
                      className={folderTreeSubRowLabelClassName(node.isActive)}
                    >
                      {folderLeafBody(leafIcon, node.label, false)}
                    </SidebarMenuSubButton>
                  )}
                </div>
                <CollapsibleContent>
                  <SidebarMenuSub className={folderTreeSubMenuClassName}>
                    <FolderSubTreeSidebar
                      nodes={node.children}
                      leafIcon={leafIcon}
                      branchGroupName={gName}
                      linkComponent={linkComponent}
                      nestedInBranch
                    />
                  </SidebarMenuSub>
                </CollapsibleContent>
              </Collapsible>
            </SidebarMenuSubItem>
          );
        }
        const { href, LinkC } = resolveFolderNavLink(node, linkComponent);
        const leafBody = folderLeafBody(leafIcon, node.label);
        return (
          <SidebarMenuSubItem key={node.id}>
            <div className={folderTreeRowClassName(nestedInBranch)}>
              {LinkC && href ? (
                <SidebarMenuSubButton asChild isActive={node.isActive} className={folderTreeSubRowLeafLabelClassName(node.isActive)}>
                  <LinkC to={href}>{leafBody}</LinkC>
                </SidebarMenuSubButton>
              ) : (
                <SidebarMenuSubButton type="button" className={folderTreeSubRowLeafLabelClassName(node.isActive)}>
                  {leafBody}
                </SidebarMenuSubButton>
              )}
            </div>
          </SidebarMenuSubItem>
        );
      })}
    </>
  );
}

function FolderTopTreeSidebar({
  nodes,
  leafIcon,
  branchGroupName,
  linkComponent,
}: {
  nodes: OkkeySidebarFolderTreeNode[];
  leafIcon: React.ReactNode;
  branchGroupName: string;
  linkComponent?: OkkeyWorkspaceNavLinkComponent;
}) {
  return (
    <>
      {nodes.map((node) => {
        if (node.children?.length) {
          const gName = `${branchGroupName}-${node.id}`;
          const { href, LinkC } = resolveFolderNavLink(node, linkComponent);
          return (
            <SidebarMenuItem key={node.id}>
              <Collapsible defaultOpen={node.defaultOpen} className={folderTreeCollapsibleClassName}>
                <div className={folderTreeRowClassName(false)}>
                  <CollapsibleTrigger asChild>
                    <button
                      type="button"
                      className={folderTreeChevronButtonClassName}
                      onPointerDown={(e) => e.preventDefault()}
                    >
                      <ChevronDownMenuIcon className={folderTreeChevronClassName} />
                    </button>
                  </CollapsibleTrigger>
                  {LinkC && href ? (
                    <SidebarMenuButton asChild isActive={node.isActive} className={folderTreeTopRowLabelClassName(node.isActive)}>
                      <LinkC to={href}>{folderLeafBody(leafIcon, node.label, false)}</LinkC>
                    </SidebarMenuButton>
                  ) : (
                    <SidebarMenuButton
                      type="button"
                      isActive={node.isActive}
                      className={folderTreeTopRowLabelClassName(node.isActive)}
                    >
                      {folderLeafBody(leafIcon, node.label, false)}
                    </SidebarMenuButton>
                  )}
                </div>
                <CollapsibleContent>
                  <SidebarMenuSub className={folderTreeSubMenuClassName}>
                    <FolderSubTreeSidebar
                      nodes={node.children}
                      leafIcon={leafIcon}
                      branchGroupName={gName}
                      linkComponent={linkComponent}
                      nestedInBranch
                    />
                  </SidebarMenuSub>
                </CollapsibleContent>
              </Collapsible>
            </SidebarMenuItem>
          );
        }
        const { href, LinkC } = resolveFolderNavLink(node, linkComponent);
        const leafBody = folderLeafBody(leafIcon, node.label);
        return (
          <SidebarMenuItem key={node.id}>
            {LinkC && href ? (
              <SidebarMenuButton asChild isActive={node.isActive} className="cursor-pointer">
                <LinkC to={href}>{leafBody}</LinkC>
              </SidebarMenuButton>
            ) : (
              <SidebarMenuButton type="button" className="cursor-pointer">
                {leafBody}
              </SidebarMenuButton>
            )}
          </SidebarMenuItem>
        );
      })}
    </>
  );
}

function FolderSubTreeDropdown({
  nodes,
  leafIcon,
  branchGroupName,
  linkComponent,
  nestedInBranch = false,
}: {
  nodes: OkkeySidebarFolderTreeNode[];
  leafIcon: React.ReactNode;
  branchGroupName: string;
  linkComponent?: OkkeyWorkspaceNavLinkComponent;
  nestedInBranch?: boolean;
}) {
  return (
    <>
      {nodes.map((node) => {
        if (node.children?.length) {
          const gName = `${branchGroupName}-${node.id}`;
          const { href, LinkC } = resolveFolderNavLink(node, linkComponent);
          return (
            <SidebarMenuSubItem key={node.id}>
              <Collapsible defaultOpen={false} className={folderTreeCollapsibleClassName}>
                <div className={folderTreeRowClassName(nestedInBranch)}>
                  <CollapsibleTrigger asChild>
                    <button
                      type="button"
                      className={folderDropdownChevronButtonClassName}
                      onPointerDown={(e) => e.preventDefault()}
                    >
                      <ChevronDownMenuIcon className={folderTreeChevronClassName} />
                    </button>
                  </CollapsibleTrigger>
                  {LinkC && href ? (
                    <LinkC
                      to={href}
                      className={cn(
                        folderDropdownBranchLinkClassName(node.isActive),
                        node.isActive ? folderDropdownBranchLinkActiveClassName : undefined,
                      )}
                    >
                      {folderLeafBody(leafIcon, node.label, false)}
                    </LinkC>
                  ) : (
                    <button
                      type="button"
                      className={cn(
                        folderDropdownBranchLinkClassName(node.isActive),
                        node.isActive ? folderDropdownBranchLinkActiveClassName : undefined,
                      )}
                    >
                      {folderLeafBody(leafIcon, node.label, false)}
                    </button>
                  )}
                </div>
                <CollapsibleContent>
                  <SidebarMenuSub className={folderTreeSubMenuClassName}>
                    <FolderSubTreeDropdown
                      nodes={node.children}
                      leafIcon={leafIcon}
                      branchGroupName={gName}
                      linkComponent={linkComponent}
                      nestedInBranch
                    />
                  </SidebarMenuSub>
                </CollapsibleContent>
              </Collapsible>
            </SidebarMenuSubItem>
          );
        }
        const { href, LinkC } = resolveFolderNavLink(node, linkComponent);
        const leafBody = folderLeafBody(leafIcon, node.label);
        return (
          <SidebarMenuSubItem key={node.id}>
            <div className={folderTreeRowClassName(nestedInBranch)}>
              {LinkC && href ? (
                <LinkC
                  to={href}
                  className={cn(
                    folderDropdownLeafLinkClassName(node.isActive),
                    node.isActive ? folderDropdownBranchLinkActiveClassName : undefined,
                  )}
                >
                  {leafBody}
                </LinkC>
              ) : (
                <button type="button" className={folderDropdownLeafLinkClassName(node.isActive)}>
                  {leafBody}
                </button>
              )}
            </div>
          </SidebarMenuSubItem>
        );
      })}
    </>
  );
}

function FolderTopTreeDropdown({
  nodes,
  leafIcon,
  branchGroupName,
  linkComponent,
}: {
  nodes: OkkeySidebarFolderTreeNode[];
  leafIcon: React.ReactNode;
  branchGroupName: string;
  linkComponent?: OkkeyWorkspaceNavLinkComponent;
}) {
  return (
    <div className={cn("flex flex-col px-2 py-0", folderTreeGapClassName)}>
      {nodes.map((node) => {
        if (node.children?.length) {
          const gName = `${branchGroupName}-${node.id}`;
          const { href, LinkC } = resolveFolderNavLink(node, linkComponent);
          return (
            <Collapsible key={node.id} defaultOpen={node.defaultOpen} className={folderTreeCollapsibleClassName}>
              <div className={folderTreeRowClassName(false)}>
                <CollapsibleTrigger asChild>
                  <button
                    type="button"
                    className={folderDropdownChevronButtonClassName}
                    onPointerDown={(e) => e.preventDefault()}
                  >
                    <ChevronDownMenuIcon className={folderTreeChevronClassName} />
                  </button>
                </CollapsibleTrigger>
                {LinkC && href ? (
                  <LinkC
                    to={href}
                    className={cn(
                      folderDropdownBranchLinkClassName(node.isActive),
                      node.isActive ? folderDropdownBranchLinkActiveClassName : undefined,
                    )}
                  >
                    {folderLeafBody(leafIcon, node.label, false)}
                  </LinkC>
                ) : (
                  <button
                    type="button"
                    className={cn(
                      folderDropdownBranchLinkClassName(node.isActive),
                      node.isActive ? folderDropdownBranchLinkActiveClassName : undefined,
                    )}
                  >
                    {folderLeafBody(leafIcon, node.label, false)}
                  </button>
                )}
              </div>
              <CollapsibleContent>
                <SidebarMenuSub className={folderTreeSubMenuClassName}>
                  <FolderSubTreeDropdown
                    nodes={node.children}
                    leafIcon={leafIcon}
                    branchGroupName={gName}
                    linkComponent={linkComponent}
                    nestedInBranch
                  />
                </SidebarMenuSub>
              </CollapsibleContent>
            </Collapsible>
          );
        }
        const { href, LinkC } = resolveFolderNavLink(node, linkComponent);
        const leafBody = folderLeafBody(leafIcon, node.label);
        if (LinkC && href) {
          return (
            <DropdownMenuItem key={node.id} asChild className={cn(folderDropdownMenuItemClassName, "p-0")}>
              <LinkC to={href} className="flex items-center gap-2 px-2 py-2">
                {leafBody}
              </LinkC>
            </DropdownMenuItem>
          );
        }
        return (
          <DropdownMenuItem key={node.id} className={folderDropdownMenuItemClassName}>
            {leafIcon}
            <span className="truncate">{node.label}</span>
          </DropdownMenuItem>
        );
      })}
    </div>
  );
}

export function OkkeySidebarFoldersMenu({
  surface,
  sectionTitle,
  collapsibleGroupName,
  tree,
  leafIcon,
  emptyLabel = "No folders",
  showHeaderPlus,
  headerPlusAriaLabel,
  onHeaderPlusPointerDown,
  headerActionIcon,
  onHeaderActionClick,
  linkComponent,
}: OkkeySidebarFoldersMenuProps) {
  const gClass = collapsibleGroupClass(collapsibleGroupName);
  const [folderSectionOpen, setFolderSectionOpen] = React.useState(true);
  const isEmpty = tree.length === 0;
  const showHeaderAction = showHeaderPlus ?? Boolean(onHeaderActionClick);
  const headerActionAriaLabel = headerPlusAriaLabel ?? "Add";
  const headerActionNode =
    headerActionIcon ?? (onHeaderActionClick ? <SidebarSettingsMenuIcon /> : <PlusMenuIcon />);

  const headerRow = (
    <div className="flex h-8 w-full shrink-0 items-center gap-2">
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex h-8 min-w-0 flex-1 items-center gap-2 rounded-lg px-2 pr-8 text-xs font-medium text-muted-foreground outline-none ring-sidebar-ring transition focus-visible:ring-2",
            sidebarRowHoverClassName,
          )}
        >
          <span className="truncate">{sectionTitle}</span>
          <ChevronDownMenuIcon
            className={cn(
              "size-4 shrink-0 transition-transform duration-200",
              folderSectionOpen ? "rotate-180" : "rotate-0",
            )}
          />
        </button>
      </CollapsibleTrigger>
      {showHeaderAction ? (
        <FolderHeaderActionButton
          ariaLabel={headerActionAriaLabel}
          icon={headerActionNode}
          onClick={onHeaderActionClick}
          onPointerDown={onHeaderPlusPointerDown}
          variant={onHeaderActionClick ? "settings" : "plus"}
        />
      ) : null}
    </div>
  );

  if (surface === "dropdown") {
    return (
      <>
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-3 py-2">
          <span className="text-xs font-medium leading-4 text-muted-foreground">{sectionTitle}</span>
          {showHeaderAction ? (
            <FolderHeaderActionButton
              ariaLabel={headerActionAriaLabel}
              icon={headerActionNode}
              onClick={onHeaderActionClick}
              onPointerDown={onHeaderPlusPointerDown}
              variant={onHeaderActionClick ? "settings" : "plus"}
            />
          ) : null}
        </div>
        <ScrollArea className="max-h-[360px]">
          {isEmpty ? (
            <div className="px-3 py-3">
              <p className="text-xs leading-4 text-muted-foreground">{emptyLabel}</p>
            </div>
          ) : (
            <FolderTopTreeDropdown nodes={tree} leafIcon={leafIcon} branchGroupName="foldd" linkComponent={linkComponent} />
          )}
        </ScrollArea>
      </>
    );
  }

  return (
    <Collapsible open={folderSectionOpen} onOpenChange={setFolderSectionOpen} className={gClass}>
      <SidebarGroup className="p-0">
        {headerRow}
        <CollapsibleContent>
          <SidebarMenu className={folderTreeGapClassName}>
            {isEmpty ? (
              <SidebarMenuItem>
                <div className="px-2 py-2">
                  <p className="text-xs leading-4 text-muted-foreground">{emptyLabel}</p>
                </div>
              </SidebarMenuItem>
            ) : (
              <FolderTopTreeSidebar nodes={tree} leafIcon={leafIcon} branchGroupName="folds" linkComponent={linkComponent} />
            )}
          </SidebarMenu>
        </CollapsibleContent>
      </SidebarGroup>
    </Collapsible>
  );
}

// —— Plain links (no section label) —————————————————————————————————

export type OkkeySidebarPlainLinkItem = {
  id: string;
  icon: React.ReactNode;
  label: string;
};

export type OkkeySidebarPlainLinksMenuProps = {
  items: OkkeySidebarPlainLinkItem[];
};

export function OkkeySidebarPlainLinksMenu({ items }: OkkeySidebarPlainLinksMenuProps) {
  return (
    <div className="flex flex-col gap-0">
      <SidebarMenu>
        {items.map((item) => (
          <SidebarMenuItem key={item.id}>
            <SidebarMenuButton type="button">
              {item.icon}
              <span className="truncate">{item.label}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        ))}
      </SidebarMenu>
    </div>
  );
}
