import { getWebLocaleNativeName, WEB_LOCALES, type WebLocale, type WebMessageValues } from "@okkey/i18n";
import {
  cn,
  OkkeyAppSidebar,
  OkkeyAppSidebarToolbar,
  ScrollArea,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  type OkkeyAppSidebarProps,
  type OkkeySidebarFolderTreeNode,
} from "@okkey/ui";
import type { ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { BodyGradient } from "../BodyGradient";
import { useLocale } from "../../locale/LocaleContext";
import { ITEM_QUERY_PARAM, WORKSPACES_PATH } from "../../routes/paths";
import ItemsListLeftPane, { type ItemsListRecord } from "./ItemsListLeftPane";
import ItemsShellTopBar from "./ItemsShellTopBar";

const mainPanelChromeClassName = cn(
  "flex min-h-0 min-w-0 flex-col rounded-xl bg-background text-foreground",
  "shadow-[0_1px_3px_rgba(0,0,0,0.1)] dark:shadow-[0_1px_3px_rgba(0,0,0,0.35)]",
);

const itemsMobilePanelChromeClassName = "max-md:rounded-none max-md:shadow-none";

const mainPanelClassName = cn(mainPanelChromeClassName, "overflow-y-auto");

export type WorkspaceSidebarLayoutProps = {
  title: string;
  description: ReactNode;
  children: ReactNode;
  /** `/items`: two main panes (360px + flex) with the same card chrome as the default single pane. */
  mainColumnLayout?: "single" | "items-two-pane";
  /** Hide workspace shell header (title, back link, workspace name). */
  hideShellMainHeader?: boolean;
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
  | "onFolderHeaderActionClick"
> & {
  /** `/items` left pane: workspace vaults for scope label + filtering. */
  itemsListVaults?: readonly { id: string; name: string; isPersonal: boolean }[];
  /** `/items` left pane: set false until vault list fetch finished (placeholder label for vault scope). */
  itemsListVaultsLoaded?: boolean;
  /** `/items` left pane: set false until folder sync bootstrap finished (placeholder label for folder scope). */
  itemsListFoldersLoaded?: boolean;
  /** `/items` left pane: folder labels (same tree as sidebar when wired). */
  itemsListFolderTree?: readonly OkkeySidebarFolderTreeNode[];
  /** `/items` left pane: synced workspace records. */
  itemsListRecords?: readonly ItemsListRecord[];
  /** False until workspace item sync bootstrap completes. */
  itemsListRecordsLoaded?: boolean;
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
  hideShellMainHeader = false,
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
  onFolderHeaderActionClick,
  itemsListVaults,
  itemsListVaultsLoaded,
  itemsListFolderTree,
  itemsListFoldersLoaded,
  itemsListRecords = [],
  itemsListRecordsLoaded = true,
}: WorkspaceSidebarLayoutProps) {
  const { locale, setLocale, t } = useLocale();
  const [searchParams] = useSearchParams();
  const activeItemId = searchParams.get(ITEM_QUERY_PARAM)?.trim() ?? "";
  const isItemsTwoPane = mainColumnLayout === "items-two-pane";
  const showMobileItemDetail = isItemsTwoPane && Boolean(activeItemId);
  const isItemsDetailEmptyPanel = isItemsTwoPane && !activeItemId;

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
          onFolderHeaderActionClick={onFolderHeaderActionClick}
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
              isItemsTwoPane ? "gap-2 md:flex-row max-md:mb-0 max-md:ms-0 max-md:me-0 max-md:gap-0" : undefined,
            )}
          >
            {isItemsTwoPane ? (
              <>
                <aside
                  className={cn(
                    mainPanelChromeClassName,
                    itemsMobilePanelChromeClassName,
                    "mt-0 flex min-h-0 w-full max-w-full shrink-0 flex-col self-stretch overflow-hidden p-0 md:w-[360px]",
                    showMobileItemDetail ? "max-md:hidden" : "max-md:flex-1",
                  )}
                >
                  <ItemsListLeftPane
                    vaults={itemsListVaults ?? []}
                    folderTree={itemsListFolderTree ?? []}
                    records={itemsListRecords}
                    itemsListVaultsLoaded={itemsListVaultsLoaded}
                    itemsListFoldersLoaded={itemsListFoldersLoaded}
                    itemsListRecordsLoaded={itemsListRecordsLoaded}
                  />
                </aside>
                <div
                  className={cn(
                    mainPanelChromeClassName,
                    itemsMobilePanelChromeClassName,
                    "flex min-h-0 min-w-0 flex-1 flex-col self-stretch overflow-hidden",
                    showMobileItemDetail ? "max-md:flex-1" : "max-md:hidden",
                  )}
                >
                  {isItemsDetailEmptyPanel ? (
                    <div className="flex min-h-0 flex-1 items-center justify-center px-4 py-8">{children}</div>
                  ) : (
                    <div className="relative min-h-0 flex-1">
                      <ScrollArea className="absolute inset-0 size-full [&_[data-radix-scroll-area-viewport]]:!size-full [&_[data-radix-scroll-area-viewport]>div]:!flex [&_[data-radix-scroll-area-viewport]>div]:!h-full [&_[data-radix-scroll-area-viewport]>div]:!min-h-full">
                        <div className="relative flex min-h-full w-full flex-col">{children}</div>
                      </ScrollArea>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className={cn(mainPanelClassName, "flex min-h-0 flex-1 flex-col")}>
                {!hideShellMainHeader ? (
                  <ShellMainHeader locale={locale} setLocale={setLocale} t={t} title={title} description={description} />
                ) : null}

                <div className="flex min-h-0 flex-1 flex-col">{children}</div>
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
