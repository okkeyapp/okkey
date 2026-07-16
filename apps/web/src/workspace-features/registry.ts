import type { WebMessageValues } from "@okkey/i18n";
import type { Workspace, WorkspaceBuiltInRoleId } from "@okkey/types";
import type { CoreApiClient } from "@okkey/api";
import type { ComponentType, ReactNode } from "react";

export type WorkspaceSettingsRolesSectionProps = {
  workspaceId: string;
  workspace?: Workspace;
  t: (messageKey: string, values?: WebMessageValues) => string;
  core: CoreApiClient;
  profilesLink: ReactNode;
};

export type BuiltInRoleCardPopupProps = {
  popupId: string;
  builtinId: WorkspaceBuiltInRoleId;
  name: string;
  description: string;
  profilesLink: ReactNode;
  t: (key: string) => string;
  onClose: () => void;
};

export type WorkspaceSettingsRolesModule = {
  EnterpriseRolesSection: ComponentType<WorkspaceSettingsRolesSectionProps> | null;
  BuiltInRoleCardPopup: ComponentType<BuiltInRoleCardPopupProps> | null;
};
