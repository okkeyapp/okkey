import * as React from "react";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "./collapsible.js";
import { DropdownMenuItem } from "./dropdown-menu.js";
import { ScrollArea } from "./scroll-area.js";
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

/** Popover folder tree: same hover tint as sidebar rows (`SidebarMenuButton`), not `bg-secondary`. */
/** Chevron points down when open, right when closed; `group` lives on the CollapsibleTrigger surface. */
const folderTreeChevronClassName = "size-4 shrink-0 transition group-data-[state=closed]:-rotate-90";

const folderDropdownInteractiveRowClassName = cn(
  "group relative flex w-full min-w-0 cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-2 text-left text-sm text-foreground outline-none transition-[background-color,color]",
  sidebarRowHoverClassName,
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
);

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
                  <button
                    type="button"
                    className={sidebarSectionPlusButton()}
                    aria-label={item.addAriaLabel ?? "Add"}
                    onPointerDown={item.onAddPointerDown ?? ((e) => e.preventDefault())}
                  >
                    <PlusMenuIcon />
                  </button>
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
        <button
          type="button"
          className={sidebarSectionPlusButton()}
          aria-label={headerPlusAriaLabel ?? "Add"}
          onPointerDown={onHeaderPlusPointerDown ?? ((e) => e.preventDefault())}
        >
          <PlusMenuIcon />
        </button>
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
            <button
              type="button"
              className={sidebarSectionPlusButton()}
              aria-label={headerPlusAriaLabel ?? "Add"}
              onPointerDown={onHeaderPlusPointerDown ?? ((e) => e.preventDefault())}
            >
              <PlusMenuIcon />
            </button>
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
 * Tree for the Folders sidebar / dropdown. Branches use `children` only; leaves should set `to` + `isActive`
 * when integrated with routing (web: `itemsPathWithFolder` + current `folder` query param).
 */
export type OkkeySidebarFolderTreeNode = {
  id: string;
  label: string;
  defaultOpen?: boolean;
  /** Leaf navigation target (no `children`), e.g. `/items?folder=…`. */
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
  showHeaderPlus?: boolean;
  headerPlusAriaLabel?: string;
  onHeaderPlusPointerDown?: (event: React.PointerEvent<HTMLButtonElement>) => void;
  linkComponent?: OkkeyWorkspaceNavLinkComponent;
};

function FolderSubTreeSidebar({
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
          return (
            <SidebarMenuSubItem key={node.id}>
              <Collapsible defaultOpen={false}>
                <CollapsibleTrigger asChild>
                  <SidebarMenuSubButton
                    type="button"
                    className="group cursor-pointer"
                    onPointerDown={(e) => e.preventDefault()}
                  >
                    <ChevronDownMenuIcon className={folderTreeChevronClassName} />
                    <span className="truncate">{node.label}</span>
                  </SidebarMenuSubButton>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <SidebarMenuSub>
                    <FolderSubTreeSidebar
                      nodes={node.children}
                      leafIcon={leafIcon}
                      branchGroupName={gName}
                      linkComponent={linkComponent}
                    />
                  </SidebarMenuSub>
                </CollapsibleContent>
              </Collapsible>
            </SidebarMenuSubItem>
          );
        }
        const href = node.to;
        const LinkC = typeof href === "string" && href.length > 0 && linkComponent ? linkComponent : null;
        const leafBody = (
          <>
            {leafIcon}
            <span className="truncate">{node.label}</span>
          </>
        );
        return (
          <SidebarMenuSubItem key={node.id}>
            {LinkC && href ? (
              <SidebarMenuSubButton asChild isActive={node.isActive} className="cursor-pointer">
                <LinkC to={href}>{leafBody}</LinkC>
              </SidebarMenuSubButton>
            ) : (
              <SidebarMenuSubButton type="button" className="cursor-pointer">
                {leafBody}
              </SidebarMenuSubButton>
            )}
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
          return (
            <SidebarMenuItem key={node.id}>
              <Collapsible defaultOpen={node.defaultOpen}>
                <CollapsibleTrigger asChild>
                  <SidebarMenuButton type="button" className="group cursor-pointer" onPointerDown={(e) => e.preventDefault()}>
                    <ChevronDownMenuIcon className={folderTreeChevronClassName} />
                    <span className="truncate">{node.label}</span>
                  </SidebarMenuButton>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <SidebarMenuSub>
                    <FolderSubTreeSidebar
                      nodes={node.children}
                      leafIcon={leafIcon}
                      branchGroupName={gName}
                      linkComponent={linkComponent}
                    />
                  </SidebarMenuSub>
                </CollapsibleContent>
              </Collapsible>
            </SidebarMenuItem>
          );
        }
        const href = node.to;
        const LinkC = typeof href === "string" && href.length > 0 && linkComponent ? linkComponent : null;
        const leafBody = (
          <>
            {leafIcon}
            <span className="truncate">{node.label}</span>
          </>
        );
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
          return (
            <SidebarMenuSubItem key={node.id}>
              <Collapsible defaultOpen={false}>
                <CollapsibleTrigger asChild>
                  <button
                    type="button"
                    className={folderDropdownInteractiveRowClassName}
                    onPointerDown={(e) => e.preventDefault()}
                  >
                    <ChevronDownMenuIcon className={folderTreeChevronClassName} />
                    <span className="truncate">{node.label}</span>
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <SidebarMenuSub>
                    <FolderSubTreeDropdown
                      nodes={node.children}
                      leafIcon={leafIcon}
                      branchGroupName={gName}
                      linkComponent={linkComponent}
                    />
                  </SidebarMenuSub>
                </CollapsibleContent>
              </Collapsible>
            </SidebarMenuSubItem>
          );
        }
        const href = node.to;
        const LinkC = typeof href === "string" && href.length > 0 && linkComponent ? linkComponent : null;
        const leafBody = (
          <>
            {leafIcon}
            <span className="truncate">{node.label}</span>
          </>
        );
        if (LinkC && href) {
          return (
            <SidebarMenuSubItem key={node.id}>
              <DropdownMenuItem asChild className={cn(folderDropdownMenuItemClassName, "p-0")}>
                <LinkC to={href} className="flex items-center gap-2 px-2 py-2">
                  {leafBody}
                </LinkC>
              </DropdownMenuItem>
            </SidebarMenuSubItem>
          );
        }
        return (
          <SidebarMenuSubItem key={node.id}>
            <DropdownMenuItem className={folderDropdownMenuItemClassName}>
              {leafIcon}
              <span className="truncate">{node.label}</span>
            </DropdownMenuItem>
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
    <div className="flex flex-col gap-0 px-2 py-1">
      {nodes.map((node) => {
        if (node.children?.length) {
          const gName = `${branchGroupName}-${node.id}`;
          return (
            <Collapsible key={node.id} defaultOpen={node.defaultOpen}>
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className={folderDropdownInteractiveRowClassName}
                  onPointerDown={(e) => e.preventDefault()}
                >
                  <ChevronDownMenuIcon className={folderTreeChevronClassName} />
                  <span className="truncate">{node.label}</span>
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <SidebarMenuSub>
                  <FolderSubTreeDropdown
                    nodes={node.children}
                    leafIcon={leafIcon}
                    branchGroupName={gName}
                    linkComponent={linkComponent}
                  />
                </SidebarMenuSub>
              </CollapsibleContent>
            </Collapsible>
          );
        }
        const href = node.to;
        const LinkC = typeof href === "string" && href.length > 0 && linkComponent ? linkComponent : null;
        const leafBody = (
          <>
            {leafIcon}
            <span className="truncate">{node.label}</span>
          </>
        );
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
  showHeaderPlus,
  headerPlusAriaLabel,
  onHeaderPlusPointerDown,
  linkComponent,
}: OkkeySidebarFoldersMenuProps) {
  const gClass = collapsibleGroupClass(collapsibleGroupName);
  const [folderSectionOpen, setFolderSectionOpen] = React.useState(true);

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
      {showHeaderPlus ? (
        <button
          type="button"
          className={sidebarSectionPlusButton()}
          aria-label={headerPlusAriaLabel ?? "Add"}
          onPointerDown={onHeaderPlusPointerDown ?? ((e) => e.preventDefault())}
        >
          <PlusMenuIcon />
        </button>
      ) : null}
    </div>
  );

  if (surface === "dropdown") {
    return (
      <>
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-3 py-2">
          <span className="text-xs font-medium leading-4 text-muted-foreground">{sectionTitle}</span>
          {showHeaderPlus ? (
            <button
              type="button"
              className={sidebarSectionPlusButton()}
              aria-label={headerPlusAriaLabel ?? "Add"}
              onPointerDown={onHeaderPlusPointerDown ?? ((e) => e.preventDefault())}
            >
              <PlusMenuIcon />
            </button>
          ) : null}
        </div>
        <ScrollArea className="max-h-[360px]">
          <FolderTopTreeDropdown nodes={tree} leafIcon={leafIcon} branchGroupName="foldd" linkComponent={linkComponent} />
        </ScrollArea>
      </>
    );
  }

  return (
    <Collapsible open={folderSectionOpen} onOpenChange={setFolderSectionOpen} className={gClass}>
      <SidebarGroup className="p-0">
        {headerRow}
        <CollapsibleContent>
          <SidebarMenu>
            <FolderTopTreeSidebar nodes={tree} leafIcon={leafIcon} branchGroupName="folds" linkComponent={linkComponent} />
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
