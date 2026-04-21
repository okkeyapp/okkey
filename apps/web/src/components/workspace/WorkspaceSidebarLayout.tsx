import { getWebLocaleNativeName, WEB_LOCALES, type WebLocale } from "@okkey/i18n";
import {
  cn,
  OkkeyAppSidebar,
  OkkeyAppSidebarToolbar,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  type OkkeyAppSidebarProps,
} from "@okkey/ui";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";

import { BodyGradient } from "../BodyGradient";
import { useLocale } from "../../locale/LocaleContext";
import { WORKSPACES_PATH } from "../../routes/paths";

export type WorkspaceSidebarLayoutProps = {
  title: string;
  description: ReactNode;
  children: ReactNode;
} & Pick<
  OkkeyAppSidebarProps,
  | "workspaceNavItems"
  | "workspaceNavLink"
  | "workspaceNavGroupLabel"
  | "workspaceSwitcherTrigger"
  | "workspaceSwitcherDropdown"
  | "vaultItems"
  | "vaultNavLink"
  | "vaultSectionTitle"
  | "folderTree"
  | "folderNavLink"
  | "folderSectionTitle"
  | "accountMenu"
>;

/**
 * Authenticated workspace shell: {@link OkkeyAppSidebar} + main column (`/items`, `/capsules`, …).
 *
 * Folders: `folderTree` / `folderNavLink` are forwarded as-is. Real wiring lives in
 * {@link ../../workspace/WorkspaceRoutesLayout} (`itemsPathWithFolder`, query `folder`, active state).
 */
export default function WorkspaceSidebarLayout({
  title,
  description,
  children,
  workspaceNavItems,
  workspaceNavLink,
  workspaceNavGroupLabel,
  workspaceSwitcherTrigger,
  workspaceSwitcherDropdown,
  vaultItems,
  vaultNavLink,
  vaultSectionTitle,
  folderTree,
  folderNavLink,
  folderSectionTitle,
  accountMenu,
}: WorkspaceSidebarLayoutProps) {
  const { locale, setLocale, t } = useLocale();

  return (
    <div className="relative isolate flex h-[100dvh] min-h-0 flex-col overflow-hidden bg-background text-foreground">
      <BodyGradient />

      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
        <OkkeyAppSidebar
          className="h-full min-h-0 border-0 bg-transparent"
          workspaceNavItems={workspaceNavItems}
          workspaceNavLink={workspaceNavLink}
          workspaceNavGroupLabel={workspaceNavGroupLabel}
          workspaceSwitcherTrigger={workspaceSwitcherTrigger}
          workspaceSwitcherDropdown={workspaceSwitcherDropdown}
          vaultItems={vaultItems}
          vaultNavLink={vaultNavLink}
          vaultSectionTitle={vaultSectionTitle}
          folderTree={folderTree}
          folderNavLink={folderNavLink}
          folderSectionTitle={folderSectionTitle}
          accountMenu={accountMenu}
        >
          <OkkeyAppSidebarToolbar />
          <div
            className={cn(
              "mt-2 mr-2 mb-2 flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto rounded-xl bg-background p-0 text-foreground",
              "shadow-[0_1px_3px_rgba(0,0,0,0.1)] dark:shadow-[0_1px_3px_rgba(0,0,0,0.35)]",
            )}
          >
            <header className="relative shrink-0 space-y-2 pe-28 sm:pe-32">
              <div className="absolute end-0 top-0 z-10">
                <Select value={locale} onValueChange={(v) => setLocale(v as WebLocale)} variant="inline">
                  <SelectTrigger aria-label={t("web.shell.language.ariaLabel")} className="text-sm font-medium text-foreground">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {WEB_LOCALES.map((code) => (
                      <SelectItem key={code} value={code}>
                        {getWebLocaleNativeName(code)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Link
                to={WORKSPACES_PATH}
                className="okkey-small inline-flex font-medium text-copy-secondary underline decoration-solid underline-offset-2 hover:text-copy-primary"
              >
                ← {t("workspaces.backToList")}
              </Link>
              <div>
                <h1 data-testid="app-shell-title" className="okkey-heading-xl text-copy-primary">
                  {title}
                </h1>
                <p className="okkey-body mt-1 text-copy-secondary">{description}</p>
              </div>
            </header>

            <div className="min-h-0 flex-1">{children}</div>
          </div>
        </OkkeyAppSidebar>
      </div>

      <div
        className="pointer-events-none absolute inset-0 shadow-[inset_0px_0px_0px_1px_rgba(0,0,0,0.1)] dark:shadow-[inset_0px_0px_0px_1px_rgba(255,255,255,0.08)]"
        aria-hidden
      />
    </div>
  );
}
