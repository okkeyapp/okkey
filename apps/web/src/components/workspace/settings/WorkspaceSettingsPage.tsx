import type { Vault, Workspace } from "@okkey/types";
import type { WebMessageValues } from "@okkey/i18n";
import { Button, buttonVariants, cn } from "@okkey/ui";
import { Link, useParams, useSearchParams } from "react-router-dom";

import { useLocale } from "../../../locale/LocaleContext";
import {
  DEFAULT_WORKSPACE_SETTINGS_SECTION,
  settingsPath,
  settingsSectionFromSlug,
  type WorkspaceSettingsSectionId,
  itemsPathAllWorkspaceMerged,
  SETTINGS_MAIN_PATH,
} from "../../../routes/paths";
import WorkspaceSettingsGeneralSection from "./WorkspaceSettingsGeneralSection";
import WorkspaceSettingsSidebar from "./WorkspaceSettingsSidebar";
import { ChevronRightIcon } from "./workspaceSettingsIcons";

type WorkspaceSettingsPageProps = {
  workspaceId: string;
  workspace?: Workspace;
  vaults: readonly Vault[];
  onSettingsChanged?: () => void;
};

function WorkspaceSettingsPlaceholderSection({
  section,
  t,
}: {
  section: WorkspaceSettingsSectionId;
  t: (messageKey: string, values?: WebMessageValues) => string;
}) {
  return (
    <div className="flex min-h-[240px] flex-col gap-2">
      <h2 className="text-lg font-semibold text-foreground">{t(`web.workspaceSettings.sections.${section}`)}</h2>
      <p className="text-sm text-muted-foreground">{t("web.workspaceSettings.comingSoon")}</p>
    </div>
  );
}

const breadcrumbGhostButtonClassName = cn(
  buttonVariants({ variant: "ghost", size: "sm" }),
  "h-6 min-h-6 max-h-6 min-w-0 max-w-full gap-1.5 px-1 text-sm font-normal text-copy-secondary hover:text-foreground",
);

const breadcrumbStaticClassName = "inline-flex h-6 min-w-0 max-w-full items-center gap-1.5 px-1 text-sm text-foreground";

export default function WorkspaceSettingsPage({
  workspaceId,
  workspace,
  vaults,
  onSettingsChanged,
}: WorkspaceSettingsPageProps) {
  const { t } = useLocale();
  const { sectionSlug = "" } = useParams<{ sectionSlug: string }>();
  const [searchParams] = useSearchParams();
  const activeSection: WorkspaceSettingsSectionId =
    settingsSectionFromSlug(sectionSlug) ?? DEFAULT_WORKSPACE_SETTINGS_SECTION;

  const workspaceName = workspace?.name ?? "…";
  const itemsHref = itemsPathAllWorkspaceMerged(searchParams);
  const sectionHref = (section: WorkspaceSettingsSectionId) => settingsPath(section);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="shrink-0 border-b border-border py-2">
        <nav aria-label={t("web.workspaceSettings.breadcrumbsAria")} className="flex min-w-0 items-center ps-5">
          <ol className="flex min-w-0 flex-wrap items-center gap-1.5">
            <li className="min-w-0">
              <Button asChild variant="ghost" className={breadcrumbGhostButtonClassName}>
                <Link to={itemsHref} title={workspaceName}>
                  <span className="truncate">{workspaceName}</span>
                </Link>
              </Button>
            </li>
            <li className="flex shrink-0 items-center text-muted-foreground" aria-hidden>
              <ChevronRightIcon />
            </li>
            <li className="min-w-0">
              <Button asChild variant="ghost" className={breadcrumbGhostButtonClassName}>
                <Link to={SETTINGS_MAIN_PATH} title={t("web.workspaceSettings.breadcrumbsRoot")}>
                  <span className="truncate">{t("web.workspaceSettings.breadcrumbsRoot")}</span>
                </Link>
              </Button>
            </li>
            <li className="flex shrink-0 items-center text-muted-foreground" aria-hidden>
              <ChevronRightIcon />
            </li>
            <li className="min-w-0">
              <span className={breadcrumbStaticClassName}>{t(`web.workspaceSettings.sections.${activeSection}`)}</span>
            </li>
          </ol>
        </nav>
      </header>

      <div className="flex flex-1 flex-col items-center px-6 pb-8 pt-8">
        <div className="flex w-full max-w-[900px] gap-4">
          <WorkspaceSettingsSidebar activeSection={activeSection} t={t} sectionHref={sectionHref} />
          <main className="min-w-0 flex-1">
            {activeSection === "general" ? (
              <WorkspaceSettingsGeneralSection
                workspaceId={workspaceId}
                workspace={workspace}
                vaults={vaults}
                t={t}
                onSettingsChanged={onSettingsChanged}
              />
            ) : (
              <WorkspaceSettingsPlaceholderSection section={activeSection} t={t} />
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
