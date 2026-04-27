import { getWebLocaleNativeName, WEB_LOCALES, type WebLocale, type WebMessageValues } from "@okkey/i18n";
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
  type OkkeySidebarFolderTreeNode,
} from "@okkey/ui";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";

import { BodyGradient } from "../BodyGradient";
import { useLocale } from "../../locale/LocaleContext";
import { WORKSPACES_PATH } from "../../routes/paths";
import ItemsListLeftPane from "./ItemsListLeftPane";
import ItemsShellTopBar from "./ItemsShellTopBar";

const mainPanelChromeClassName = cn(
  "flex min-h-0 min-w-0 flex-col rounded-xl bg-background text-foreground",
  "shadow-[0_1px_3px_rgba(0,0,0,0.1)] dark:shadow-[0_1px_3px_rgba(0,0,0,0.35)]",
);

const mainPanelClassName = cn(mainPanelChromeClassName, "overflow-y-auto");

export type WorkspaceSidebarLayoutProps = {
  title: string;
  description: ReactNode;
  children: ReactNode;
  /** `/items`: two main panes (360px + flex) with the same card chrome as the default single pane. */
  mainColumnLayout?: "single" | "items-two-pane";
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
  | "folderEmptyLabel"
  | "accountMenu"
  | "footerPlainLinkLabels"
  | "vaultHeaderPlusAriaLabel"
  | "folderHeaderPlusAriaLabel"
> & {
  /** `/items` left pane: workspace vaults for scope label + filtering. */
  itemsListVaults?: readonly { id: string; name: string; isPersonal: boolean }[];
  /** `/items` left pane: set false until vault list fetch finished (placeholder label for vault scope). */
  itemsListVaultsLoaded?: boolean;
  /** `/items` left pane: folder labels (same tree as sidebar when wired). */
  itemsListFolderTree?: readonly OkkeySidebarFolderTreeNode[];
};

function ShellMainHeader({
  locale,
  setLocale,
  t,
  title,
  description,
}: {
  locale: WebLocale;
  setLocale: (v: WebLocale) => void;
  t: (messageKey: string, values?: WebMessageValues) => string;
  title: string;
  description: ReactNode;
}) {
  return (
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
  );
}

/**
 * Authenticated workspace shell: {@link OkkeyAppSidebar} + main column (`/items`, `/capsules`, …).
 *
 * Folders: `folderTree` / `folderNavLink` are forwarded as-is. Real wiring lives in
 * {@link ../../workspace/WorkspaceRoutesLayout} (`itemsPathWithFolderMerged`, query `folder`, active state).
 */
export default function WorkspaceSidebarLayout({
  title,
  description,
  children,
  mainColumnLayout = "single",
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
  folderEmptyLabel,
  accountMenu,
  footerPlainLinkLabels,
  vaultHeaderPlusAriaLabel,
  folderHeaderPlusAriaLabel,
  itemsListVaults,
  itemsListVaultsLoaded,
  itemsListFolderTree,
}: WorkspaceSidebarLayoutProps) {
  const { locale, setLocale, t } = useLocale();

  return (
    <div className="relative isolate flex h-[100dvh] min-h-0 flex-col overflow-hidden bg-background text-foreground">
      <BodyGradient />

      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
        <OkkeyAppSidebar
          className="h-full min-h-0 border-0 bg-transparent"
          mobileNavCloseLabel={t("web.nav.closeMobileNav")}
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
          folderEmptyLabel={folderEmptyLabel}
          accountMenu={accountMenu}
          footerPlainLinkLabels={footerPlainLinkLabels}
          vaultHeaderPlusAriaLabel={vaultHeaderPlusAriaLabel}
          folderHeaderPlusAriaLabel={folderHeaderPlusAriaLabel}
        >
          <div className="flex shrink-0 flex-row items-center gap-2 ps-2 pe-2 pt-2 min-[991px]:pe-4">
            <OkkeyAppSidebarToolbar
              className="!p-0 shrink-0"
              expandSidebarLabel={t("web.nav.expandSidebar")}
              collapseSidebarLabel={t("web.nav.collapseSidebar")}
              openMobileNavLabel={t("web.nav.openMobileNav")}
            />
            <div className="min-w-0 flex-1">
              <ItemsShellTopBar />
            </div>
          </div>
          <div
            className={cn(
              "mt-2 mr-2 mb-2 flex min-h-0 min-w-0 flex-1 flex-col p-0",
              "ml-2 min-[991px]:ml-0",
              mainColumnLayout === "items-two-pane" ? "gap-2 min-[991px]:flex-row" : undefined,
            )}
          >
            {mainColumnLayout === "items-two-pane" ? (
              <>
                <aside
                  className={cn(
                    mainPanelChromeClassName,
                    "mt-0 w-[360px] max-w-full shrink-0 self-stretch overflow-hidden p-0",
                  )}
                >
                  <ItemsListLeftPane
                    vaults={itemsListVaults ?? []}
                    folderTree={itemsListFolderTree ?? []}
                    itemsListVaultsLoaded={itemsListVaultsLoaded}
                  />
                </aside>
                <div className={cn(mainPanelClassName, "min-w-0 flex-1 self-stretch")}>
                  <ShellMainHeader locale={locale} setLocale={setLocale} t={t} title={title} description={description} />

                  <div className="min-h-0 flex-1">{children}</div>
                </div>
              </>
            ) : (
              <div className={cn(mainPanelClassName, "flex-1")}>
                <ShellMainHeader locale={locale} setLocale={setLocale} t={t} title={title} description={description} />

                <div className="min-h-0 flex-1">{children}</div>
              </div>
            )}
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
