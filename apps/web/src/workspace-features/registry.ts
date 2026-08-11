import type { WebMessageValues } from "@okkey/i18n";
import type {
  Workspace,
  WorkspaceBuiltInProfileId,
  WorkspaceBuiltInRoleId,
  Vault,
} from "@okkey/types";
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

export type WorkspaceSettingsProfilesSectionProps = {
  workspaceId: string;
  workspace?: Workspace;
  t: (messageKey: string, values?: WebMessageValues) => string;
  core: CoreApiClient;
  rolesLink: ReactNode;
};

export type BuiltInProfileCardPopupProps = {
  popupId: string;
  builtinId: WorkspaceBuiltInProfileId;
  name: string;
  description: string;
  rolesLink: ReactNode;
  t: (key: string) => string;
  onClose: () => void;
};

export type WorkspaceSettingsProfilesModule = {
  EnterpriseProfilesSection: ComponentType<WorkspaceSettingsProfilesSectionProps> | null;
  BuiltInProfileCardPopup: ComponentType<BuiltInProfileCardPopupProps> | null;
};

export type EnterpriseAdditionalMembersSectionProps = {
  workspaceId: string;
  workspace?: Workspace;
  t: (messageKey: string, values?: WebMessageValues) => string;
};

export type WorkspaceSettingsMembersModule = {
  AdditionalMembersSection: ComponentType<EnterpriseAdditionalMembersSectionProps> | null;
};

export type EnterpriseSharedVaultsSectionProps = {
  workspaceId: string;
  workspace?: Workspace;
  vaults: readonly Vault[];
  vaultsListReady?: boolean;
  t: (messageKey: string, values?: WebMessageValues) => string;
  onVaultsChanged?: () => void | Promise<void>;
  personalVaultId?: string | null;
};

export type PersonalVaultCardPopupProps = {
  popupId: string;
  mode: "personal";
  initialVault: Vault;
  workspaceId: string;
  core: CoreApiClient;
  userId: string;
  accountVaultKey: Uint8Array | null;
  members: readonly unknown[];
  profiles: readonly unknown[];
  initialAccessByUserId?: Record<string, string | null>;
  t: (messageKey: string, values?: WebMessageValues) => string;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
};

export type WorkspaceSettingsSharedVaultsModule = {
  SharedVaultsSection: ComponentType<EnterpriseSharedVaultsSectionProps> | null;
  PersonalVaultCardPopup: ComponentType<PersonalVaultCardPopupProps> | null;
};
