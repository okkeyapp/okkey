import { useState } from "react";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  OkkeyAppSidebar,
  OkkeyAppSidebarToolbar,
  OkkeySidebarFoldersMenu,
  OkkeySidebarVaultsMenu,
} from "@okkey/ui";

import { BodyGradient } from "../../components/BodyGradient";
import {
  DEV_UI_FOLDER_TREE,
  DEV_UI_VAULT_ITEMS,
  devUiDropdownPanelClassName,
  DevUiShellMenuBlocksDemo,
} from "./devUiShellDemo";
import { DevUiFolderLeafIcon } from "./DevUiIcons";

export default function DevUISidebarPage() {
  const [devUiVaultOpen, setDevUiVaultOpen] = useState(true);

  return (
    <div className="mx-auto max-w-4xl space-y-10">
      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-medium">Sidebar</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Primitives follow the shadcn/ui sidebar pattern (
            <code className="rounded bg-muted px-1 py-0.5 text-xs">SidebarProvider</code>,{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">OkkeyAppSidebarToolbar</code> in the main column,{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">SidebarMenuButton</code>, collapsible groups, tree).
            The scrollable block uses <code className="rounded bg-muted px-1 py-0.5 text-xs">ScrollArea</code>. Colors
            use <code className="rounded bg-muted px-1 py-0.5 text-xs">sidebar-*</code> tokens and shared{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">foreground</code> /{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">primary</code>.
          </p>
        </div>
        <div className="relative isolate overflow-x-auto rounded-lg">
          <BodyGradient />
          <div className="relative flex h-[min(640px,75vh)] min-h-[360px] w-max min-w-full">
            <OkkeyAppSidebar className="h-full min-h-0">
              <OkkeyAppSidebarToolbar />
              <div className="mt-2 mr-2 mb-2 flex min-h-0 flex-1 items-center justify-center rounded-xl bg-background px-6 text-sm text-muted-foreground shadow-[0_1px_3px_rgba(0,0,0,0.1)] dark:shadow-[0_1px_3px_rgba(0,0,0,0.35)]">
                Main content
              </div>
            </OkkeyAppSidebar>
          </div>
        </div>
      </section>

      <section className="space-y-6">
        <div>
          <h2 className="text-lg font-medium">Shell: sidebar menus</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Building blocks from <code className="rounded bg-muted px-1 py-0.5 text-xs">@okkey/ui</code> (
            <code className="rounded bg-muted px-1 py-0.5 text-xs">OkkeySidebarWorkspaceMenu</code>,{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">OkkeySidebarVaultsMenu</code>,{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">OkkeySidebarFoldersMenu</code>,{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">OkkeySidebarPlainLinksMenu</code>). Menus expect{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">SidebarProvider</code> +{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">Sidebar</code> /{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">SidebarContent</code> for expanded layout. Page
            gradient preview lives under <strong>Foundation</strong>.
          </p>
        </div>

        <div className="space-y-2">
          <h3 className="text-sm font-medium text-muted-foreground">Menu blocks (expanded)</h3>
          <DevUiShellMenuBlocksDemo vaultOpen={devUiVaultOpen} onVaultOpenChange={setDevUiVaultOpen} />
        </div>

        <div className="space-y-2">
          <h3 className="text-sm font-medium text-muted-foreground">Menu panels (dropdown surface)</h3>
          <p className="text-sm text-muted-foreground">
            Same components with <code className="rounded bg-muted px-1 py-0.5 text-xs">surface=&quot;dropdown&quot;</code> as in
            the collapsed rail.
          </p>
          <div className="flex flex-wrap gap-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="outline" size="sm">
                  Vaults panel
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" sideOffset={6} className={devUiDropdownPanelClassName}>
                <OkkeySidebarVaultsMenu
                  surface="dropdown"
                  sectionTitle="Vaults"
                  collapsibleGroupName="dev-ui-vaults-dd"
                  items={DEV_UI_VAULT_ITEMS}
                  showHeaderPlus
                  headerPlusAriaLabel="Add vault"
                />
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="outline" size="sm">
                  Folders panel
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" sideOffset={6} className={devUiDropdownPanelClassName}>
                <OkkeySidebarFoldersMenu
                  surface="dropdown"
                  sectionTitle="Folders"
                  collapsibleGroupName="dev-ui-folders-dd"
                  tree={DEV_UI_FOLDER_TREE}
                  leafIcon={<DevUiFolderLeafIcon />}
                  showHeaderPlus
                  headerPlusAriaLabel="Add folder"
                />
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </section>
    </div>
  );
}
