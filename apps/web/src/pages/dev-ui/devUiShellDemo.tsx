import type { ReactNode } from "react";

import {
  OkkeySidebarFoldersMenu,
  OkkeySidebarPlainLinksMenu,
  OkkeySidebarVaultsMenu,
  OkkeySidebarWorkspaceMenu,
  Sidebar,
  SidebarContent,
  SidebarProvider,
  TooltipProvider,
  type OkkeySidebarFolderTreeNode,
  type OkkeySidebarPlainLinkItem,
  type OkkeySidebarVaultItem,
  type OkkeySidebarWorkspaceNavItem,
} from "@okkey/ui";

import { devUiEmoji, DevUiDemoUsersIcon, DevUiFolderLeafIcon } from "./DevUiIcons";

export const devUiDropdownPanelClassName = "flex w-[min(100vw-2rem,280px)] min-w-56 flex-col overflow-hidden p-0";

export function DevUiSidebarMenuShell({ children }: { children: ReactNode }) {
  return (
    <TooltipProvider delayDuration={0}>
      <SidebarProvider defaultExpanded>
        <div className="h-[min(420px,55vh)] w-[280px] max-w-full shrink-0 overflow-hidden rounded-lg border border-border">
          <Sidebar className="h-full border-0 bg-sidebar">
            <SidebarContent className="overflow-y-auto p-0">
              <div className="flex flex-col gap-6 p-2">{children}</div>
            </SidebarContent>
          </Sidebar>
        </div>
      </SidebarProvider>
    </TooltipProvider>
  );
}

export const DEV_UI_WORKSPACE_NAV: OkkeySidebarWorkspaceNavItem[] = [
  {
    id: "w-all",
    icon: devUiEmoji("📋"),
    label: "All items",
    trailingPlus: true,
    addAriaLabel: "Add item",
  },
  {
    id: "w-cap",
    icon: devUiEmoji("💊"),
    label: "Capsules",
    trailingPlus: true,
    addAriaLabel: "Add capsule",
  },
  { id: "w-mon", icon: devUiEmoji("📊"), label: "Monitoring" },
];

export const DEV_UI_VAULT_ITEMS: OkkeySidebarVaultItem[] = [
  { id: "v-p", leading: devUiEmoji("🏠"), label: "Personal" },
  {
    id: "v-e",
    leading: devUiEmoji("💼"),
    label: "Engineering",
    rightIcon: <DevUiDemoUsersIcon />,
  },
  {
    id: "v-m",
    leading: devUiEmoji("🎨"),
    label: "Marketing",
    rightIcon: <DevUiDemoUsersIcon />,
  },
];

export const DEV_UI_FOLDER_TREE: OkkeySidebarFolderTreeNode[] = [
  {
    id: "my",
    label: "My folder",
    defaultOpen: true,
    children: [
      {
        id: "web",
        label: "Web",
        defaultOpen: true,
        children: [
          { id: "design", label: "Design" },
          { id: "frontend", label: "Frontend" },
        ],
      },
      { id: "ai", label: "AI" },
    ],
  },
  { id: "company", label: "Company" },
];

export const DEV_UI_PLAIN_LINKS: OkkeySidebarPlainLinkItem[] = [
  { id: "doc", icon: devUiEmoji("📖"), label: "Documentation" },
  { id: "help", icon: devUiEmoji("❓"), label: "Help" },
];

export function DevUiShellMenuBlocksDemo({
  vaultOpen,
  onVaultOpenChange,
}: {
  vaultOpen: boolean;
  onVaultOpenChange: (open: boolean) => void;
}) {
  return (
    <DevUiSidebarMenuShell>
      <OkkeySidebarWorkspaceMenu labelText="Workspace" items={DEV_UI_WORKSPACE_NAV} />
      <OkkeySidebarVaultsMenu
        surface="sidebar-expanded"
        sectionTitle="Vaults"
        collapsibleGroupName="dev-ui-vaults"
        open={vaultOpen}
        onOpenChange={onVaultOpenChange}
        items={DEV_UI_VAULT_ITEMS}
        showHeaderPlus
        headerPlusAriaLabel="Add vault"
      />
      <OkkeySidebarFoldersMenu
        surface="sidebar-expanded"
        sectionTitle="Folders"
        collapsibleGroupName="dev-ui-folders"
        tree={DEV_UI_FOLDER_TREE}
        leafIcon={<DevUiFolderLeafIcon />}
        showHeaderPlus
        headerPlusAriaLabel="Add folder"
      />
      <OkkeySidebarPlainLinksMenu items={DEV_UI_PLAIN_LINKS} />
    </DevUiSidebarMenuShell>
  );
}
