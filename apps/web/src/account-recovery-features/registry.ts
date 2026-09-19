import type { WebMessageValues } from "@okkey/i18n";
import type { ComponentType } from "react";

export type AccountRestorePanelProps = {
  accessToken: string;
  userId: string;
  t: (messageKey: string, values?: WebMessageValues) => string;
  onVaultKeyRecovered: (vaultKey: Uint8Array) => Promise<void>;
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
};

export type ContactsEnrollPanelProps = {
  accessToken: string;
  userId: string;
  t: (messageKey: string, values?: WebMessageValues) => string;
  vaultUnlocked: boolean;
  vaultKey: Uint8Array | null;
  contactsEnabled: boolean;
  confirmedContacts: Array<{ id: string; contactUserId: string; email: string }>;
};

export type DeviceApproveInboxProps = {
  accessToken: string;
  t: (messageKey: string, values?: WebMessageValues) => string;
  vaultUnlocked: boolean;
  vaultKey: Uint8Array | null;
  currentDeviceId: string | null;
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
};
