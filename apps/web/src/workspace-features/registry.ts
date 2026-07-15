import type { WebMessageValues } from "@okkey/i18n";
import type { Workspace } from "@okkey/types";
import type { CoreApiClient } from "@okkey/api";
import type { ComponentType, ReactNode } from "react";

export type WorkspaceSettingsRolesSectionProps = {
  workspaceId: string;
  workspace?: Workspace;
  t: (messageKey: string, values?: WebMessageValues) => string;
  core: CoreApiClient;
  profilesLink: ReactNode;
};

export type WorkspaceSettingsRolesModule = {
  EnterpriseRolesSection: ComponentType<WorkspaceSettingsRolesSectionProps> | null;
};
