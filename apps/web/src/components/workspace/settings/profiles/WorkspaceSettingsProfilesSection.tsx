import type { Workspace, WorkspaceResourcePermissionDto } from "@okkey/types";
import { normalizePlanTier } from "@okkey/types";
import type { WebMessageValues } from "@okkey/i18n";
import { Link } from "react-router-dom";

import enterpriseProfilesModule from "@okkey-enterprise/workspace-profiles";

import { useAuthenticatedCoreClient } from "../../../../auth/AuthVaultContext";
import { settingsPath } from "../../../../routes/paths";
import { canManageCustomWorkspaceProfiles } from "./builtinProfiles";
import BuiltInProfilesLoader from "./BuiltInProfilesLoader";
import CustomProfilesUpsell from "./CustomProfilesUpsell";
import ProfilesSectionHeader from "./ProfilesSectionHeader";

type WorkspaceSettingsProfilesSectionProps = {
  workspaceId: string;
  workspace?: Workspace;
  t: (messageKey: string, values?: WebMessageValues) => string;
  resourcePermissions?: WorkspaceResourcePermissionDto | null;
};

export default function WorkspaceSettingsProfilesSection({
  workspaceId,
  workspace,
  t,
  resourcePermissions = null,
}: WorkspaceSettingsProfilesSectionProps) {
  const core = useAuthenticatedCoreClient();
  const canManageCustom = canManageCustomWorkspaceProfiles(workspace?.planTier);
  const canOpenBuiltInCards = normalizePlanTier(workspace?.planTier) === "ENTERPRISE";
  const EnterpriseProfilesSection = enterpriseProfilesModule.EnterpriseProfilesSection;
  const BuiltInProfileCardPopup = enterpriseProfilesModule.BuiltInProfileCardPopup;
  if (!core) {
    return null;
  }
  const rolesLink = (
    <Link
      to={settingsPath("roles")}
      className="font-medium text-foreground underline decoration-border underline-offset-4 transition-colors hover:text-primary"
    >
      {t("web.workspaceSettings.sections.roles")}
    </Link>
  );

  return (
    <div className="flex flex-col gap-9">
      <ProfilesSectionHeader t={t} />
      <BuiltInProfilesLoader
        workspaceId={workspaceId}
        core={core}
        t={t}
        rolesLink={rolesLink}
        ProfileCardPopup={canOpenBuiltInCards ? BuiltInProfileCardPopup ?? undefined : undefined}
      />
      {canManageCustom && EnterpriseProfilesSection ? (
        <EnterpriseProfilesSection
          workspaceId={workspaceId}
          workspace={workspace}
          core={core}
          rolesLink={rolesLink}
          t={t}
          resourcePermissions={resourcePermissions}
        />
      ) : (
        <CustomProfilesUpsell t={t} />
      )}
    </div>
  );
}
