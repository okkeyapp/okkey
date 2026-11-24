import type { WebMessageValues } from "@okkey/i18n";
import type { ComponentType } from "react";

/** Approved device or contact recovery request. Core posts the plugin complete route. */
export type AccountRestoreApproval = {
  requestId: string;
};

export type AccountRestorePanelProps = {
  accessToken: string;
  userId: string;
  t: (messageKey: string, values?: WebMessageValues) => string;
  /**
   * `approval` is set after the vault key is unwrapped.
   * Core posts `POST /enterprise/account/recovery/{devices|contacts}/requests/:id/complete`
   * before changing the master password. Omit it only when there is no request id.
   */
  onVaultKeyRecovered: (
    vaultKey: Uint8Array,
    approval?: AccountRestoreApproval,
  ) => Promise<void>;
  formError: string | null;
  setFormError: (error: string | null) => void;
  newPassword: string;
  setNewPassword: (value: string) => void;
  repeatPassword: string;
  setRepeatPassword: (value: string) => void;
  passwordValid: boolean;
  submitting: boolean;
  setSubmitting: (value: boolean) => void;
  /** Device remote recovery: requesting browser metadata (optional for contacts panel). */
  currentDeviceId?: string | null;
  deviceFingerprint?: string | null;
  deviceName?: string | null;
  platform?: string | null;
  osName?: string | null;
  osVersion?: string | null;
  clientType?: string | null;
  userAgent?: string | null;
  onRequesterDeviceBlocked?: () => void | Promise<void>;
};

export type ContactsEnrollPanelProps = {
  accessToken: string;
  userId: string;
  t: (messageKey: string, values?: WebMessageValues) => string;
  vaultUnlocked: boolean;
  vaultKey: Uint8Array | null;
  contactsEnabled: boolean;
  confirmedContacts: Array<{ id: string; contactUserId: string; email: string }>;
  minConfirmedContacts?: number;
};

export type DeviceApproveInboxProps = {
  accessToken: string;
  t: (messageKey: string, values?: WebMessageValues) => string;
  vaultUnlocked: boolean;
  vaultKey: Uint8Array | null;
  currentDeviceId: string | null;
};

export type TrustedContactsSectionProps = {
  /** Plan does not include trusted contacts. Existing rows stay; adding is disabled. */
  locked?: boolean;
};

export type AccountRecoveryEnterpriseModule = {
  DevicesRestorePanel: ComponentType<AccountRestorePanelProps> | null;
  ContactsRestorePanel: ComponentType<AccountRestorePanelProps> | null;
  ContactsEnrollPanel: ComponentType<ContactsEnrollPanelProps> | null;
  DeviceApproveInbox: ComponentType<DeviceApproveInboxProps> | null;
  ContactsReleaseInbox: ComponentType<{
    accessToken: string;
    userId: string;
    t: (messageKey: string, values?: WebMessageValues) => string;
    vaultUnlocked: boolean;
    vaultKey: Uint8Array | null;
  }> | null;
  /** Silent auto (re-)enroll controller — mount in workspace shell. */
  ContactsShareAutoEnrollController: ComponentType | null;
  /**
   * Trusted-contacts catalog (switch, list, invites, memberships).
   * Mounted whenever the module provides it, including after a downgrade.
   * `locked` is true when the plan does not include trusted contacts:
   * list existing contacts, keep Remove working, disable Add, and show a plan note.
   * Open core sets this to null.
   */
  TrustedContactsSection: ComponentType<TrustedContactsSectionProps> | null;
  /**
   * Popup for a pending trusted-contact invitation (accept / reject).
   * No props. Open core sets this to null.
   */
  TrustedContactInviteController: ComponentType | null;
};
