import { Link, matchPath, NavLink, Outlet, useLocation } from "react-router-dom";

import { Button, Sidebar, SidebarContent, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider } from "@okkey/ui";

import { devUiGalleryPath, ROOT_PATH } from "../../routes/paths";

const DEV_UI_NAV: readonly { to: string; label: string; end?: boolean }[] = [
  { to: devUiGalleryPath(), label: "Foundation", end: true },
  { to: devUiGalleryPath("sidebar"), label: "Sidebar & shell" },
  { to: devUiGalleryPath("button"), label: "Button" },
  { to: devUiGalleryPath("input"), label: "Input" },
  { to: devUiGalleryPath("switch"), label: "Switch" },
  { to: devUiGalleryPath("select"), label: "Select" },
  { to: devUiGalleryPath("control-grouping"), label: "Control grouping" },
  { to: devUiGalleryPath("spinner"), label: "Spinner" },
  { to: devUiGalleryPath("workspace-tile"), label: "Workspace tile" },
  { to: devUiGalleryPath("alert"), label: "Alert" },
  { to: devUiGalleryPath("tooltip"), label: "Tooltip" },
  { to: devUiGalleryPath("favicon"), label: "Favicon" },
];

function navItemActive(pathname: string, to: string, end?: boolean) {
  return matchPath({ path: to, end: Boolean(end) }, pathname) != null;
}

export default function DevUIGalleryLayout() {
  const { pathname } = useLocation();

  return (
    <SidebarProvider defaultExpanded>
      <main className="min-h-screen bg-background text-foreground">
        <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-6 lg:flex-row lg:gap-10 lg:px-6">
          <Sidebar className="w-full shrink-0 bg-transparent lg:sticky lg:top-6 lg:w-[255px] lg:self-start">
            <SidebarHeader className="px-2 pb-2">
              <p className="text-xs text-muted-foreground">
                <Link to={ROOT_PATH} className="text-primary hover:underline">
                  ← Home
                </Link>
              </p>
              <p className="mt-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Dev / UI</p>
            </SidebarHeader>
            <SidebarContent className="px-0 py-2">
              <SidebarMenu>
                {DEV_UI_NAV.map(({ to, label, end }) => (
                  <SidebarMenuItem key={to}>
                    <SidebarMenuButton asChild isActive={navItemActive(pathname, to, end)}>
                      <NavLink to={to} end={Boolean(end)} className="flex w-full min-w-0 items-center gap-2">
                        <span className="truncate">{label}</span>
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarContent>
          </Sidebar>

          <div className="min-w-0 flex-1 space-y-8">
            <header className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h1 className="text-2xl font-semibold">Design system</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  Dev gallery — theme tokens and UI primitives (Okkey / shadcn)
                </p>
              </div>
              <Button variant="outline" size="sm" asChild>
                <a href="https://ui.shadcn.com/" target="_blank" rel="noreferrer">
                  shadcn docs
                </a>
              </Button>
            </header>

            <div className="space-y-10">
              <Outlet />
            </div>
          </div>
        </div>
      </main>
    </SidebarProvider>
  );
}
