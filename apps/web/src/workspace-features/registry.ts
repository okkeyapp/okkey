import type { WebMessageValues } from "@okkey/i18n";
import type {
  CapsuleSchedulePreset,
  Workspace,
  WorkspaceBuiltInProfileId,
  WorkspaceBuiltInRoleId,
  WorkspaceCapsulePolicies,
  WorkspaceMemberDirectoryEntryDto,
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
  resourcePermissions?: import("@okkey/types").WorkspaceResourcePermissionDto | null;
  /** Plan denies custom roles: list + delete only, no create/update. */
  readOnly?: boolean;
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
  resourcePermissions?: import("@okkey/types").WorkspaceResourcePermissionDto | null;
  /** Plan denies custom profiles: list + delete only, no create/update. */
  readOnly?: boolean;
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
  resourcePermissions?: import("@okkey/types").WorkspaceResourcePermissionDto | null;
  /** Plan denies additional members: list + edit + delete/revoke only, no invites. */
  readOnly?: boolean;
};

export type WorkspaceSettingsMembersModule = {
  AdditionalMembersSection: ComponentType<EnterpriseAdditionalMembersSectionProps> | null;
  InviteLandingPage: ComponentType;
};

export type EnterpriseSharedVaultsSectionProps = {
  workspaceId: string;
  workspace?: Workspace;
  vaults: readonly Vault[];
  vaultsListReady?: boolean;
  t: (messageKey: string, values?: WebMessageValues) => string;
  onVaultsChanged?: () => void | Promise<void>;
  personalVaultId?: string | null;
  resourcePermissions?: import("@okkey/types").WorkspaceResourcePermissionDto | null;
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

export type SharedVaultCardPopupProps = {
  popupId: string;
  mode: "shared";
  initialVault?: Vault;
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
  SharedVaultCardPopup: ComponentType<SharedVaultCardPopupProps> | null;
};

export type EnterpriseCapsulesAdvancedPoliciesSectionProps = {
  policies: import("@okkey/types").WorkspaceCapsulePolicies;
  canEdit: boolean;
  t: (messageKey: string, values?: WebMessageValues) => string;
  onPersist: (
    next: import("@okkey/types").WorkspaceCapsulePolicies,
  ) => void | Promise<void>;
};

/**
 * Paid capsule access fields inside the new/edit capsule popup.
 * Core keeps the read-only forced view limit (`forceMaxViews`) outside this slot.
 * Open core sets the slot to null, so those fields are not rendered.
 */
export type CapsuleAccessSettingsValues = {
  viewsEnabled: boolean;
  maxViews: number;
  viewLimitAction: "deactivate" | "delete";
  timeEnabled: boolean;
  activatePreset: CapsuleSchedulePreset;
  activateCustom: string;
  deactivatePreset: CapsuleSchedulePreset;
  deactivateCustom: string;
  deletePreset: CapsuleSchedulePreset;
  deleteCustom: string;
  accessEnabled: boolean;
  recipients: string[];
  passwordEnabled: boolean;
  password: string;
  attemptLimit: number;
  hadPassword: boolean;
  hadRecipients: boolean;
  approvalRequired: boolean;
};

export type CapsuleAccessSettingsFieldsProps = {
  t: (messageKey: string, values?: WebMessageValues) => string;
  policies: WorkspaceCapsulePolicies;
  members: readonly WorkspaceMemberDirectoryEntryDto[];
  isEditing: boolean;
  values: CapsuleAccessSettingsValues;
  onChange: (patch: Partial<CapsuleAccessSettingsValues>) => void;
  validation: {
    activateSchedulePast: boolean;
    deactivateSchedulePast: boolean;
    deleteSchedulePast: boolean;
    recipientsInvalid: boolean;
    passwordInvalid: boolean;
    /** Earliest date the deactivate/delete pickers may use. */
    activationMinimumDate: Date | null;
  };
  saveDefaults: boolean;
  onSaveDefaultsChange: (value: boolean) => void;
  /**
   * Plan does not include capsule access settings.
   * Render the same controls disabled, with a paid-plan note. Do not call onChange.
   */
  locked?: boolean;
};

/** Guest gate for a capsule that requires a password or owner approval. */
export type PublicCapsuleAccessGateMode =
  | "password"
  | "approval"
  | "waiting"
  | "denied"
  | "blacklisted";

export type PublicCapsuleAccessGateProps = {
  mode: PublicCapsuleAccessGateMode;
  t: (messageKey: string, values?: WebMessageValues) => string;
  password: string;
  onPasswordChange: (value: string) => void;
  /** i18n key for the password error, or null. */
  passwordErrorKey: string | null;
  passwordUnlocking: boolean;
  onUnlock: () => void;
  onRequestApproval: () => void;
};

export type WorkspaceSettingsCapsulesModule = {
  CapsulesAdvancedPoliciesSection: ComponentType<EnterpriseCapsulesAdvancedPoliciesSectionProps> | null;
  CapsuleAccessSettingsFields: ComponentType<CapsuleAccessSettingsFieldsProps> | null;
  PublicCapsuleAccessGate: ComponentType<PublicCapsuleAccessGateProps> | null;
  /** Pending owner-approval popup. No props. Null in open core. */
  CapsuleApprovalController: ComponentType | null;
};
