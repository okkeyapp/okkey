import type { Workspace, WorkspaceResourcePermissionDto } from "@okkey/types";
import { hasPlanFeature } from "@okkey/types";
import type { WebMessageValues } from "@okkey/i18n";
import { Link } from "react-router-dom";

import enterpriseRolesModule from "@okkey-enterprise/workspace-roles";

import { useAuthenticatedCoreClient } from "../../../../auth/AuthVaultContext";
import { settingsPath } from "../../../../routes/paths";
import { canManageCustomWorkspaceRoles } from "./builtinRoles";
import BuiltInRolesLoader from "./BuiltInRolesLoader";
import CustomRolesUpsell from "./CustomRolesUpsell";
import RolesSectionHeader from "./RolesSectionHeader";

type WorkspaceSettingsRolesSectionProps = {
  workspaceId: string;
  workspace?: Workspace;
  t: (messageKey: string, values?: WebMessageValues) => string;
  resourcePermissions?: WorkspaceResourcePermissionDto | null;
};

export default function WorkspaceSettingsRolesSection({
  workspaceId,
  workspace,
  t,
  resourcePermissions = null,
}: WorkspaceSettingsRolesSectionProps) {
  const core = useAuthenticatedCoreClient();
  const canManageCustom = canManageCustomWorkspaceRoles(workspace?.planTier);
  const canOpenBuiltInCards = hasPlanFeature(workspace?.planTier, "customWorkspaceRoles");
  const EnterpriseRolesSection = enterpriseRolesModule.EnterpriseRolesSection;
  const BuiltInRoleCardPopup = enterpriseRolesModule.BuiltInRoleCardPopup;
  if (!core) {
    return null;
  }
  const profilesLink = (
    <Link
      to={settingsPath("profiles")}
      className="font-medium text-foreground underline decoration-border underline-offset-4 transition-colors hover:text-primary"
    >
      {t("web.workspaceSettings.sections.profiles")}
    </Link>
  );

  return (
    <div className="flex flex-col gap-9">
      <RolesSectionHeader t={t} />
      <BuiltInRolesLoader
        workspaceId={workspaceId}
        core={core}
        t={t}
        profilesLink={profilesLink}
        RoleCardPopup={canOpenBuiltInCards ? BuiltInRoleCardPopup ?? undefined : undefined}
      />
      {canManageCustom && EnterpriseRolesSection ? (
        <EnterpriseRolesSection
          workspaceId={workspaceId}
          workspace={workspace}
          core={core}
          profilesLink={profilesLink}
          t={t}
          resourcePermissions={resourcePermissions}
        />
      ) : (
        <CustomRolesUpsell t={t} />
      )}
    </div>
  );
}
