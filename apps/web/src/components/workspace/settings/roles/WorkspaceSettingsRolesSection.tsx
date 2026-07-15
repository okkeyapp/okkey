import type { Workspace } from "@okkey/types";
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
};

export default function WorkspaceSettingsRolesSection({
  workspaceId,
  workspace,
  t,
}: WorkspaceSettingsRolesSectionProps) {
  const core = useAuthenticatedCoreClient();
  const canManageCustom = canManageCustomWorkspaceRoles(workspace?.planTier);
  const EnterpriseRolesSection = enterpriseRolesModule.EnterpriseRolesSection;
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
      <BuiltInRolesLoader workspaceId={workspaceId} core={core} t={t} />
      {canManageCustom && EnterpriseRolesSection ? (
        <EnterpriseRolesSection
          workspaceId={workspaceId}
          workspace={workspace}
          core={core}
          profilesLink={profilesLink}
          t={t}
        />
      ) : (
        <CustomRolesUpsell t={t} />
      )}
    </div>
  );
}
