import {
  computeAccountSecurityScore,
  type AccountSecurityScoreInput,
  type AccountSecurityScoreResult,
} from "@okkey/types";
import { useMemo, useSyncExternalStore } from "react";

import { ACCOUNT_LOGIN_METHODS_UI_ENABLED } from "../../auth/accountLoginMethodsFeature";
import {
  getSettingsPopupCacheState,
  settingsPopupSliceNeedsSkeleton,
  subscribeSettingsPopupCache,
  type SettingsPopupCacheState,
} from "./settingsPopupCache";

export type UseAccountSecurityScoreState = {
  loading: boolean;
  partialError: boolean;
  result: AccountSecurityScoreResult | null;
};

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
    dev.data?.devices.length,
    dev.data?.pending.length,
    login.status,
    login.error ?? "",
    login.data?.passkeys.length,
    login.data?.hardware_keys.length,
  ].join("|");
}

function buildInputFromCache(cache: SettingsPopupCacheState): {
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

  if (!twoFactor.data || !recovery.data) {
    return { input: null, loading, partialError };
  }

  const trustedCount = devices.data?.devices.length ?? 0;
  const pendingCount = devices.data?.pending.length ?? 0;

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
      trustedCount,
      pendingCount,
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
 * (two-factor, recovery, devices, optional login methods).
 */
export function useAccountSecurityScore(): UseAccountSecurityScoreState {
  const fingerprint = useSyncExternalStore(
    subscribeSettingsPopupCache,
    () => cacheFingerprint(getSettingsPopupCacheState()),
    () => cacheFingerprint(getSettingsPopupCacheState()),
  );

  return useMemo(() => {
    void fingerprint;
    const { input, loading, partialError } = buildInputFromCache(getSettingsPopupCacheState());
    if (!input) {
      return { loading, partialError, result: null };
    }
    return {
      loading: false,
      partialError,
      result: computeAccountSecurityScore(input),
    };
  }, [fingerprint]);
}
