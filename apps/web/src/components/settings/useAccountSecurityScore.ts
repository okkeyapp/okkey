import {
  computeAccountSecurityScore,
  type AccountSecurityScoreInput,
  type AccountSecurityScoreResult,
} from "@okkey/types";
import type { DeviceListItemDto } from "@okkey/types";
import { useMemo, useSyncExternalStore } from "react";

import { ACCOUNT_LOGIN_METHODS_UI_ENABLED } from "../../auth/accountLoginMethodsFeature";
import { useAuthVault } from "../../auth/AuthVaultContext";
import { readVaultDevicePrefs } from "../../auth/vaultDevicePrefs";
import {
  getSettingsPopupCacheState,
  settingsPopupSliceNeedsSkeleton,
  subscribeSettingsPopupCache,
  type SettingsDevicesListCache,
  type SettingsPopupCacheState,
} from "./settingsPopupCache";

export type UseAccountSecurityScoreState = {
  loading: boolean;
  partialError: boolean;
  result: AccountSecurityScoreResult | null;
};

/** Count trusted rows from the devices list slice (status-aware). */
export function countTrustedDevicesFromCache(
  devices: readonly DeviceListItemDto[] | null | undefined,
): number {
  if (!devices?.length) {
    return 0;
  }
  return devices.filter((d) => d.status === "trusted").length;
}

export function countPendingDevicesFromCache(
  pending: readonly DeviceListItemDto[] | null | undefined,
): number {
  return pending?.length ?? 0;
}

function subscribeVaultDevicePrefs(onStoreChange: () => void): () => void {
  if (typeof window === "undefined") {
    return () => undefined;
  }
  window.addEventListener("okkey:vault-device-prefs", onStoreChange);
  return () => window.removeEventListener("okkey:vault-device-prefs", onStoreChange);
}

function vaultPrefsFingerprint(userId: string | null): string {
  const prefs = readVaultDevicePrefs(userId);
  return [
    prefs.lockOnDeviceSleep,
    prefs.clipboardClearSeconds,
    prefs.requireReauthZones.join(","),
    prefs.pinEnabled,
    prefs.biometricEnabled,
  ].join("|");
}

/** Stable-ish fingerprint so useSyncExternalStore re-renders when slices change. */
function cacheFingerprint(cache: SettingsPopupCacheState): string {
  const tf = cache.twoFactor;
  const rec = cache.recovery;
  const dev = cache.devices;
  const login = cache.login;
  return [
    tf.status,
    tf.error ?? "",
    tf.data?.enabled,
    tf.data?.backupCodesRemaining,
    tf.data?.backupCodesGeneratedAt,
    tf.data?.backupCodesExportedAt,
    rec.status,
    rec.error ?? "",
    rec.data?.settings.keyEnabled,
    rec.data?.settings.devicesEnabled,
    rec.data?.settings.contactsEnabled,
    rec.data?.key.enrolled,
    rec.data?.key.exportedAt,
    rec.data?.entitlements.trustedDevices,
    rec.data?.entitlements.trustedContacts,
    rec.data?.confirmedContactCount,
    rec.data?.minConfirmedContacts,
    dev.status,
    dev.error ?? "",
    dev.data?.pending.length,
    login.status,
    login.error ?? "",
    login.data?.passkeys.length,
    login.data?.hardware_keys.length,
  ].join("|");
}

function devicesSliceUsable(devices: SettingsPopupCacheState["devices"]): boolean {
  return devices.data != null || devices.status === "error" || devices.status === "ready";
}

export type AccountSecurityVaultSnapshot = {
  idleLockSeconds: number;
  masterPasswordChangedAt: string | null;
  userId: string | null;
};

function buildInputFromCache(
  cache: SettingsPopupCacheState,
  vaultSnap: AccountSecurityVaultSnapshot,
): {
  input: AccountSecurityScoreInput | null;
  loading: boolean;
  partialError: boolean;
} {
  const twoFactor = cache.twoFactor;
  const recovery = cache.recovery;
  const devices = cache.devices;
  const login = cache.login;

  const loading =
    settingsPopupSliceNeedsSkeleton(twoFactor) ||
    settingsPopupSliceNeedsSkeleton(recovery) ||
    settingsPopupSliceNeedsSkeleton(devices) ||
    (ACCOUNT_LOGIN_METHODS_UI_ENABLED && settingsPopupSliceNeedsSkeleton(login));

  const partialError =
    Boolean(twoFactor.error || recovery.error || devices.error) ||
    (ACCOUNT_LOGIN_METHODS_UI_ENABLED && Boolean(login.error));

  // Devices list must be settled — otherwise pending recommendations silently use count=0.
  if (!twoFactor.data || !recovery.data || !devicesSliceUsable(devices)) {
    return { input: null, loading: loading || !devicesSliceUsable(devices), partialError };
  }

  const list: SettingsDevicesListCache = devices.data ?? {
    devices: [],
    pending: [],
    blocked: [],
  };
  const pendingCount = countPendingDevicesFromCache(list.pending);
  const prefs = readVaultDevicePrefs(vaultSnap.userId);

  const loginAvailable = ACCOUNT_LOGIN_METHODS_UI_ENABLED && login.data != null;
  const hasPasskeyOrHardware = Boolean(
    login.data &&
      (login.data.passkeys.length > 0 || login.data.hardware_keys.length > 0),
  );

  const input: AccountSecurityScoreInput = {
    twoFactor: {
      enabled: twoFactor.data.enabled,
      backupCodesRemaining: twoFactor.data.backupCodesRemaining,
      backupCodesGeneratedAt: twoFactor.data.backupCodesGeneratedAt,
      backupCodesExportedAt: twoFactor.data.backupCodesExportedAt,
    },
    recovery: {
      entitlements: {
        trustedDevices: recovery.data.entitlements.trustedDevices,
        trustedContacts: recovery.data.entitlements.trustedContacts,
      },
      settings: {
        keyEnabled: recovery.data.settings.keyEnabled,
        devicesEnabled: recovery.data.settings.devicesEnabled,
        contactsEnabled: recovery.data.settings.contactsEnabled,
      },
      key: {
        enrolled: recovery.data.key.enrolled,
        exportedAt: recovery.data.key.exportedAt,
      },
      confirmedContactCount: recovery.data.confirmedContactCount,
      minConfirmedContacts: recovery.data.minConfirmedContacts,
    },
    devices: {
      pendingCount,
    },
    vault: {
      idleLockSeconds: vaultSnap.idleLockSeconds,
      lockOnDeviceSleep: prefs.lockOnDeviceSleep,
      clipboardClearSeconds: prefs.clipboardClearSeconds,
      masterPasswordChangedAt: vaultSnap.masterPasswordChangedAt,
      requireReauthOnDeletion: prefs.requireReauthZones.includes("deletion"),
      biometricEnabled: prefs.biometricEnabled,
      pinEnabled: prefs.pinEnabled,
    },
    loginMethods: {
      available: loginAvailable,
      hasPasskeyOrHardware,
    },
  };

  return { input, loading: false, partialError };
}

/**
 * Derives account security score from the Personal Settings popup warm cache
 * plus vault device prefs / idle lock / master-password age.
 */
export function useAccountSecurityScore(): UseAccountSecurityScoreState {
  const { userId, vaultIdleLockMs, masterPasswordChangedAt } = useAuthVault();

  const cacheFp = useSyncExternalStore(
    subscribeSettingsPopupCache,
    () => cacheFingerprint(getSettingsPopupCacheState()),
    () => cacheFingerprint(getSettingsPopupCacheState()),
  );
  const prefsFp = useSyncExternalStore(
    subscribeVaultDevicePrefs,
    () => vaultPrefsFingerprint(userId),
    () => vaultPrefsFingerprint(userId),
  );

  return useMemo(() => {
    void cacheFp;
    void prefsFp;
    const vaultSnap: AccountSecurityVaultSnapshot = {
      userId,
      idleLockSeconds: Math.max(0, Math.round(vaultIdleLockMs / 1000)),
      masterPasswordChangedAt,
    };
    const { input, loading, partialError } = buildInputFromCache(
      getSettingsPopupCacheState(),
      vaultSnap,
    );
    if (!input) {
      return { loading, partialError, result: null };
    }
    return {
      loading: false,
      partialError,
      result: computeAccountSecurityScore(input),
    };
  }, [cacheFp, prefsFp, userId, vaultIdleLockMs, masterPasswordChangedAt]);
}
