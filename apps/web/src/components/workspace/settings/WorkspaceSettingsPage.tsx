import type { Vault, Workspace, WorkspacePermissionsMatrixDto } from "@okkey/types";
import type { WebMessageValues } from "@okkey/i18n";
import {
  Breadcrumb,
  BreadcrumbBar,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@okkey/ui";
import { useRef } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";

import { useScrollAncestorScrolled } from "../../../hooks/useRadixScrollAreaScrolled";
import { useLocale } from "../../../locale/LocaleContext";
import WorkspaceForbiddenPage from "../../../pages/workspace/WorkspaceForbiddenPage";
import {
  DEFAULT_WORKSPACE_SETTINGS_SECTION,
  settingsPath,
  settingsSectionFromSlug,
  type WorkspaceSettingsSectionId,
  itemsPathAllWorkspaceMerged,
  SETTINGS_MAIN_PATH,
} from "../../../routes/paths";
import WorkspaceSettingsGeneralSection from "./WorkspaceSettingsGeneralSection";
import WorkspaceSettingsRolesSection from "./roles/WorkspaceSettingsRolesSection";
import WorkspaceSettingsProfilesSection from "./profiles/WorkspaceSettingsProfilesSection";
import WorkspaceSettingsVaultsSection from "./vaults/WorkspaceSettingsVaultsSection";
import WorkspaceSettingsMembersSection from "./members/WorkspaceSettingsMembersSection";
import WorkspaceSettingsMobileHeader from "./WorkspaceSettingsMobileHeader";
import WorkspaceSettingsSidebar from "./WorkspaceSettingsSidebar";
import type { workspacePatchFromSettingsResponse } from "./workspaceSettingsCatalog";
import {
  allowedSettingsSections,
  canGetSettingsSection,
  settingsSectionPermissionCell,
} from "./settingsPermissions";

type WorkspaceSettingsPageProps = {
  workspaceId: string;
  workspace?: Workspace;
  vaults: readonly Vault[];
  vaultsListReady?: boolean;
  workspacePermissions?: WorkspacePermissionsMatrixDto | null;
  workspacePermissionsReady?: boolean;
  onSettingsChanged?: (patch: ReturnType<typeof workspacePatchFromSettingsResponse>) => void;
  onVaultsChanged?: () => void | Promise<void>;
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

export default function WorkspaceSettingsPage({
  workspaceId,
  workspace,
  vaults,
  vaultsListReady = true,
  workspacePermissions = null,
  workspacePermissionsReady = false,
  onSettingsChanged,
  onVaultsChanged,
}: WorkspaceSettingsPageProps) {
  const { t } = useLocale();
  const { sectionSlug = "" } = useParams<{ sectionSlug: string }>();
  const [searchParams] = useSearchParams();
  const requestedSection: WorkspaceSettingsSectionId =
    settingsSectionFromSlug(sectionSlug) ?? DEFAULT_WORKSPACE_SETTINGS_SECTION;
  const allowedSections = allowedSettingsSections(workspacePermissions);
  const sectionAllowed = canGetSettingsSection(workspacePermissions, requestedSection);
  const activeSection = requestedSection;
  const sectionPermissions = settingsSectionPermissionCell(workspacePermissions, activeSection);

  const workspaceName = workspace?.name ?? "…";
  const itemsHref = itemsPathAllWorkspaceMerged(searchParams);
  const sectionHref = (section: WorkspaceSettingsSectionId) => settingsPath(section);
  const pageRootRef = useRef<HTMLDivElement>(null);
  const headerScrolled = useScrollAncestorScrolled(pageRootRef, 0, activeSection);

  if (workspacePermissionsReady && !sectionAllowed) {
    return <WorkspaceForbiddenPage />;
  }

  if (!workspacePermissionsReady) {
    return null;
  }

  return (
    <div ref={pageRootRef} className="flex min-h-full min-w-0 flex-1 flex-col">
      <BreadcrumbBar>
        <Breadcrumb aria-label={t("web.workspaceSettings.breadcrumbsAria")}>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link to={itemsHref} title={workspaceName}>
                  <span className="truncate">{workspaceName}</span>
                </Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link to={SETTINGS_MAIN_PATH} title={t("web.workspaceSettings.breadcrumbsRoot")}>
                  <span className="truncate">{t("web.workspaceSettings.breadcrumbsRoot")}</span>
                </Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage title={t(`web.workspaceSettings.sections.${activeSection}`)}>
                {t(`web.workspaceSettings.sections.${activeSection}`)}
              </BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </BreadcrumbBar>

      <WorkspaceSettingsMobileHeader
        activeSection={activeSection}
        itemsHref={itemsHref}
        headerScrolled={headerScrolled}
        t={t}
        sectionHref={sectionHref}
        allowedSections={allowedSections}
      />

      <div className="flex flex-1 flex-col items-center px-4 py-6 md:px-6 md:pb-8 md:pt-8">
        <div className="flex w-full max-w-[900px] flex-col gap-4 md:flex-row">
          <WorkspaceSettingsSidebar
            activeSection={activeSection}
            t={t}
            sectionHref={sectionHref}
            allowedSections={allowedSections}
          />
          <main className="min-w-0 flex-1">
            {activeSection === "general" ? (
              <WorkspaceSettingsGeneralSection
                workspaceId={workspaceId}
                workspace={workspace}
                vaults={vaults}
                t={t}
                onSettingsChanged={onSettingsChanged}
                canPut={Boolean(sectionPermissions && sectionPermissions.put >= 1)}
              />
            ) : activeSection === "roles" ? (
              <WorkspaceSettingsRolesSection
                workspaceId={workspaceId}
                workspace={workspace}
                t={t}
                resourcePermissions={sectionPermissions}
              />
            ) : activeSection === "profiles" ? (
              <WorkspaceSettingsProfilesSection
                workspaceId={workspaceId}
                workspace={workspace}
                t={t}
                resourcePermissions={sectionPermissions}
              />
            ) : activeSection === "vaults" ? (
              <WorkspaceSettingsVaultsSection
                workspaceId={workspaceId}
                workspace={workspace}
                vaults={vaults}
                vaultsListReady={vaultsListReady}
                t={t}
                onVaultsChanged={onVaultsChanged}
                resourcePermissions={sectionPermissions}
              />
            ) : activeSection === "members" ? (
              <WorkspaceSettingsMembersSection
                workspaceId={workspaceId}
                workspace={workspace}
                t={t}
                resourcePermissions={sectionPermissions}
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
