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

const collapsedFolderSubMenuDropdownItemClassName =
  "min-h-8 -translate-x-px cursor-pointer gap-2 rounded-lg py-1.5";

/** Tailwind `group/<name>` suffix, e.g. `collapsible` → `group/collapsible` + chevron `group-data-[state=closed]/collapsible:`. */
function collapsibleGroupClass(name: string) {
  return `group/${name}`;
}

function collapsibleChevronClass(name: string) {
  return `group-data-[state=closed]/${name}:-rotate-90`;
}

// —— Workspace ——————————————————————————————————————————————————

export type OkkeySidebarWorkspaceNavItem = {
  id: string;
  icon: React.ReactNode;
  label: string;
  trailingPlus?: boolean;
  addAriaLabel?: string;
  onAddPointerDown?: (event: React.PointerEvent<HTMLButtonElement>) => void;
};

export type OkkeySidebarWorkspaceMenuProps = {
  labelText: string;
  items: OkkeySidebarWorkspaceNavItem[];
};

export function OkkeySidebarWorkspaceMenu({ labelText, items }: OkkeySidebarWorkspaceMenuProps) {
  return (
    <SidebarGroup className="p-0">
      <SidebarGroupLabel>{labelText}</SidebarGroupLabel>
      <SidebarMenu>
        {items.map((item) => (
          <SidebarMenuItem key={item.id}>
            {item.trailingPlus ? (
              <div className="flex items-center gap-2">
                <SidebarMenuButton type="button" className="flex-1 pr-8">
                  {item.icon}
                  <span className="truncate">{item.label}</span>
                </SidebarMenuButton>
                <button
                  type="button"
                  className={sidebarSectionPlusButton()}
                  aria-label={item.addAriaLabel ?? "Add"}
                  onPointerDown={item.onAddPointerDown ?? ((e) => e.preventDefault())}
                >
                  <PlusMenuIcon />
                </button>
              </div>
            ) : (
              <SidebarMenuButton type="button">
                {item.icon}
                <span className="truncate">{item.label}</span>
              </SidebarMenuButton>
            )}
          </SidebarMenuItem>
        ))}
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
};

function VaultRowSidebar({ item }: { item: OkkeySidebarVaultItem }) {
  if (item.rightIcon) {
    return (
      <SidebarMenuItem>
        <div className="flex items-center gap-2">
          <SidebarMenuButton type="button" className="flex-1 pr-8">
            {item.leading}
            <span className="min-w-0 flex-1 truncate">{item.label}</span>
          </SidebarMenuButton>
          <div className="flex size-6 shrink-0 items-center justify-center text-muted-foreground" aria-hidden>
            {item.rightIcon}
          </div>
        </div>
      </SidebarMenuItem>
    );
  }
  return (
    <SidebarMenuItem>
      <SidebarMenuButton type="button">
        {item.leading}
        <span className="truncate">{item.label}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

function VaultRowDropdown({ item }: { item: OkkeySidebarVaultItem }) {
  if (item.rightIcon) {
    return (
      <DropdownMenuItem className="cursor-pointer justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2">
          {item.leading}
          <span className="truncate">{item.label}</span>
        </span>
        <span className="shrink-0 text-muted-foreground">{item.rightIcon}</span>
      </DropdownMenuItem>
    );
  }
  return (
    <DropdownMenuItem className="cursor-pointer gap-2">
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
}: OkkeySidebarVaultsMenuProps) {
  const gClass = collapsibleGroupClass(collapsibleGroupName);
  const chevronState = collapsibleChevronClass(collapsibleGroupName);

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
          <ChevronDownMenuIcon className={cn("size-4 shrink-0 transition", chevronState)} />
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
        <VaultRowSidebar key={item.id} item={item} />
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
              <VaultRowDropdown key={item.id} item={item} />
            ))}
          </div>
        </ScrollArea>
      </>
    );
  }

  return (
    <Collapsible open={open} defaultOpen={defaultOpen} onOpenChange={onOpenChange} className={gClass}>
      <SidebarGroup className="p-0">
        {headerRow}
        <CollapsibleContent>{sidebarList}</CollapsibleContent>
      </SidebarGroup>
    </Collapsible>
  );
}

// —— Folders (tree) ———————————————————————————————————————————————

export type OkkeySidebarFolderTreeNode = {
  id: string;
  label: string;
  defaultOpen?: boolean;
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
};

function FolderSubTreeSidebar({
  nodes,
  leafIcon,
  branchGroupName,
}: {
  nodes: OkkeySidebarFolderTreeNode[];
  leafIcon: React.ReactNode;
  branchGroupName: string;
}) {
  return (
    <>
      {nodes.map((node) => {
        if (node.children?.length) {
          const gName = `${branchGroupName}-${node.id}`;
          const gClass = collapsibleGroupClass(gName);
          const ch = collapsibleChevronClass(gName);
          return (
            <SidebarMenuSubItem key={node.id}>
              <Collapsible defaultOpen={node.defaultOpen} className={gClass}>
                <CollapsibleTrigger asChild>
                  <SidebarMenuSubButton type="button" className="pr-2" onPointerDown={(e) => e.preventDefault()}>
                    <ChevronDownMenuIcon className={cn("size-4 shrink-0 transition", ch)} />
                    <span className="truncate">{node.label}</span>
                  </SidebarMenuSubButton>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <SidebarMenuSub>
                    <FolderSubTreeSidebar nodes={node.children} leafIcon={leafIcon} branchGroupName={gName} />
                  </SidebarMenuSub>
                </CollapsibleContent>
              </Collapsible>
            </SidebarMenuSubItem>
          );
        }
        return (
          <SidebarMenuSubItem key={node.id}>
            <SidebarMenuSubButton type="button">
              {leafIcon}
              <span className="truncate">{node.label}</span>
            </SidebarMenuSubButton>
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
}: {
  nodes: OkkeySidebarFolderTreeNode[];
  leafIcon: React.ReactNode;
  branchGroupName: string;
}) {
  return (
    <>
      {nodes.map((node) => {
        if (node.children?.length) {
          const gName = `${branchGroupName}-${node.id}`;
          const gClass = collapsibleGroupClass(gName);
          const ch = collapsibleChevronClass(gName);
          return (
            <SidebarMenuItem key={node.id}>
              <Collapsible defaultOpen={node.defaultOpen} className={gClass}>
                <CollapsibleTrigger asChild>
                  <SidebarMenuButton type="button" className="pr-2" onPointerDown={(e) => e.preventDefault()}>
                    <ChevronDownMenuIcon className={cn("size-4 shrink-0 transition", ch)} />
                    <span className="truncate">{node.label}</span>
                  </SidebarMenuButton>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <SidebarMenuSub>
                    <FolderSubTreeSidebar nodes={node.children} leafIcon={leafIcon} branchGroupName={gName} />
                  </SidebarMenuSub>
                </CollapsibleContent>
              </Collapsible>
            </SidebarMenuItem>
          );
        }
        return (
          <SidebarMenuItem key={node.id}>
            <SidebarMenuButton type="button">
              {leafIcon}
              <span className="truncate">{node.label}</span>
            </SidebarMenuButton>
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
}: {
  nodes: OkkeySidebarFolderTreeNode[];
  leafIcon: React.ReactNode;
  branchGroupName: string;
}) {
  return (
    <>
      {nodes.map((node) => {
        if (node.children?.length) {
          const gName = `${branchGroupName}-${node.id}`;
          const gClass = collapsibleGroupClass(gName);
          const ch = collapsibleChevronClass(gName);
          return (
            <SidebarMenuSubItem key={node.id}>
              <Collapsible defaultOpen={node.defaultOpen} className={gClass}>
                <CollapsibleTrigger asChild>
                  <SidebarMenuSubButton type="button" className="pr-2" onPointerDown={(e) => e.preventDefault()}>
                    <ChevronDownMenuIcon className={cn("size-4 shrink-0 transition", ch)} />
                    <span className="truncate">{node.label}</span>
                  </SidebarMenuSubButton>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <SidebarMenuSub>
                    <FolderSubTreeDropdown nodes={node.children} leafIcon={leafIcon} branchGroupName={gName} />
                  </SidebarMenuSub>
                </CollapsibleContent>
              </Collapsible>
            </SidebarMenuSubItem>
          );
        }
        return (
          <SidebarMenuSubItem key={node.id}>
            <DropdownMenuItem className={collapsedFolderSubMenuDropdownItemClassName}>
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
}: {
  nodes: OkkeySidebarFolderTreeNode[];
  leafIcon: React.ReactNode;
  branchGroupName: string;
}) {
  return (
    <div className="flex flex-col gap-0 px-2 py-1">
      {nodes.map((node) => {
        if (node.children?.length) {
          const gName = `${branchGroupName}-${node.id}`;
          const gClass = collapsibleGroupClass(gName);
          const ch = collapsibleChevronClass(gName);
          return (
            <Collapsible key={node.id} defaultOpen={node.defaultOpen} className={gClass}>
              <CollapsibleTrigger asChild>
                <SidebarMenuButton type="button" className="pr-2" onPointerDown={(e) => e.preventDefault()}>
                  <ChevronDownMenuIcon className={cn("size-4 shrink-0 transition", ch)} />
                  <span className="truncate">{node.label}</span>
                </SidebarMenuButton>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <SidebarMenuSub>
                  <FolderSubTreeDropdown nodes={node.children} leafIcon={leafIcon} branchGroupName={gName} />
                </SidebarMenuSub>
              </CollapsibleContent>
            </Collapsible>
          );
        }
        return (
          <DropdownMenuItem key={node.id} className="cursor-pointer gap-2">
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
}: OkkeySidebarFoldersMenuProps) {
  const gClass = collapsibleGroupClass(collapsibleGroupName);
  const chevronState = collapsibleChevronClass(collapsibleGroupName);

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
          <ChevronDownMenuIcon className={cn("size-4 shrink-0 transition", chevronState)} />
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
          <FolderTopTreeDropdown nodes={tree} leafIcon={leafIcon} branchGroupName="foldd" />
        </ScrollArea>
      </>
    );
  }

  return (
    <Collapsible defaultOpen className={gClass}>
      <SidebarGroup className="p-0">
        {headerRow}
        <CollapsibleContent>
          <SidebarMenu>
            <FolderTopTreeSidebar nodes={tree} leafIcon={leafIcon} branchGroupName="folds" />
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
