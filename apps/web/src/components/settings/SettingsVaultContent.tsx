import type { WebMessageValues } from "@okkey/i18n";
import {
  Alert,
  AlertDescription,
  Button,
  MultiSelect,
  MultiSelectContent,
  MultiSelectGroupLabel,
  MultiSelectItem,
  MultiSelectTrigger,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  cn,
} from "@okkey/ui";
import { useCallback, useEffect, useMemo, useState, type SVGProps } from "react";
import { toast } from "sonner";

import { useAuthVault, useAuthenticatedCoreClient } from "../../auth/AuthVaultContext";
import { normalizeAccountProfileWire } from "../../auth/normalizeAccountProfileWire";
import {
  CLIPBOARD_CLEAR_OPTIONS_SECONDS,
  IDLE_LOCK_OPTIONS_SECONDS,
  patchVaultDevicePrefs,
  readVaultDevicePrefs,
  type SectionReauthZoneId,
  type VaultDevicePrefs,
} from "../../auth/vaultDevicePrefs";
import { vaultIdleLockMsFromServerSeconds } from "../../auth/vaultIdleLockMs";
import { writePinUnlockWrap, clearDeviceUnlockSecrets } from "../../auth/vaultDeviceUnlockStore";
import { useLocale } from "../../locale/LocaleContext";
import ChangeMasterPasswordPopup from "./ChangeMasterPasswordPopup";
import SetupPinPopup from "./SetupPinPopup";
import {
  SettingsRow,
  SettingsSectionDivider,
  SettingsSectionHeading,
} from "./SettingsRows";
import {
  setupBiometricUnlock,
  disableBiometricUnlock,
  getBiometricUnlockCapability,
  biometricErrorMessageKey,
  type BiometricCapability,
  type BiometricUnlockErrorCode,
} from "../../auth/biometricUnlock";
import { wrapUnlockMaterialWithPin } from "@okkey/crypto";
import { calendarDaysBetween } from "../../lib/calendarDaysBetween";

type SettingsVaultContentProps = {
  t: (messageKey: string, values?: WebMessageValues) => string;
  workspaceIds: string[];
};

function notifySaved(t: SettingsVaultContentProps["t"]) {
  toast.success(t("web.toast.save.success"));
}

function SettingsIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg width={16} height={16} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden {...props}>
      <path
        d="M8.14667 1.33325H7.85333C7.49971 1.33325 7.16057 1.47373 6.91053 1.72378C6.66048 1.97382 6.52 2.31296 6.52 2.66659V2.78659C6.51976 3.0204 6.45804 3.25005 6.34103 3.45248C6.22401 3.65491 6.05583 3.82301 5.85333 3.93992L5.56667 4.10659C5.36398 4.22361 5.13405 4.28522 4.9 4.28522C4.66595 4.28522 4.43603 4.22361 4.23333 4.10659L4.13333 4.05325C3.82738 3.87676 3.46389 3.82888 3.12267 3.92012C2.78145 4.01137 2.49037 4.23428 2.31333 4.53992L2.16667 4.79325C1.99018 5.09921 1.9423 5.46269 2.03354 5.80392C2.12478 6.14514 2.34769 6.43622 2.65333 6.61325L2.75333 6.67992C2.95485 6.79626 3.12241 6.96331 3.23937 7.16447C3.35632 7.36563 3.4186 7.5939 3.42 7.82658V8.16658C3.42093 8.40153 3.35977 8.63255 3.2427 8.83626C3.12563 9.03996 2.95681 9.20911 2.75333 9.32658L2.65333 9.38658C2.34769 9.56362 2.12478 9.8547 2.03354 10.1959C1.9423 10.5371 1.99018 10.9006 2.16667 11.2066L2.31333 11.4599C2.49037 11.7656 2.78145 11.9885 3.12267 12.0797C3.46389 12.171 3.82738 12.1231 4.13333 11.9466L4.23333 11.8933C4.43603 11.7762 4.66595 11.7146 4.9 11.7146C5.13405 11.7146 5.36398 11.7762 5.56667 11.8933L5.85333 12.0599C6.05583 12.1768 6.22401 12.3449 6.34103 12.5474C6.45804 12.7498 6.51976 12.9794 6.52 13.2133V13.3333C6.52 13.6869 6.66048 14.026 6.91053 14.2761C7.16057 14.5261 7.49971 14.6666 7.85333 14.6666H8.14667C8.50029 14.6666 8.83943 14.5261 9.08948 14.2761C9.33953 14.026 9.48 13.6869 9.48 13.3333V13.2133C9.48024 12.9794 9.54196 12.7498 9.65898 12.5474C9.77599 12.3449 9.94418 12.1768 10.1467 12.0599L10.4333 11.8933C10.636 11.7762 10.866 11.7146 11.1 11.7146C11.3341 11.7146 11.564 11.7762 11.7667 11.8933L11.8667 11.9466C12.1726 12.1231 12.5361 12.171 12.8773 12.0797C13.2186 11.9885 13.5096 11.7656 13.6867 11.4599L13.8333 11.1999C14.0098 10.894 14.0577 10.5305 13.9665 10.1893C13.8752 9.84803 13.6523 9.55695 13.3467 9.37992L13.2467 9.32658C13.0432 9.20911 12.8744 9.03996 12.7573 8.83626C12.6402 8.63255 12.5791 8.40153 12.58 8.16658V7.83325C12.5791 7.5983 12.6402 7.36728 12.7573 7.16358C12.8744 6.95988 13.0432 6.79072 13.2467 6.67325L13.3467 6.61325C13.6523 6.43622 13.8752 6.14514 13.9665 5.80392C14.0577 5.46269 14.0098 5.09921 13.8333 4.79325L13.6867 4.53992C13.5096 4.23428 13.2186 4.01137 12.8773 3.92012C12.5361 3.82888 12.1726 3.87676 11.8667 4.05325L11.7667 4.10659C11.564 4.22361 11.3341 4.28522 11.1 4.28522C10.866 4.28522 10.636 4.22361 10.4333 4.10659L10.1467 3.93992C9.94418 3.82301 9.77599 3.65491 9.65898 3.45248C9.54196 3.25005 9.48024 3.0204 9.48 2.78659V2.66659C9.48 2.31296 9.33953 1.97382 9.08948 1.72378C8.83943 1.47373 8.50029 1.33325 8.14667 1.33325Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M8 9.99992C9.10457 9.99992 10 9.10449 10 7.99992C10 6.89535 9.10457 5.99992 8 5.99992C6.89543 5.99992 6 6.89535 6 7.99992C6 9.10449 6.89543 9.99992 8 9.99992Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function formatRelativePast(
  iso: string | null,
  locale: string,
  t: SettingsVaultContentProps["t"],
): string {
  if (!iso) {
    return t("web.settingsPopup.vault.masterPassword.unknownDate");
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return t("web.settingsPopup.vault.masterPassword.unknownDate");
  }
  const absolute = new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "en-US", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
  // Compare local calendar days, not a rolling 24h window.
  const days = Math.max(0, calendarDaysBetween(date));
  if (days === 0) {
    return t("web.settingsPopup.vault.masterPassword.changedToday", { date: absolute });
  }
  if (days === 1) {
    return t("web.settingsPopup.vault.masterPassword.changedYesterday", { date: absolute });
  }
  return t("web.settingsPopup.vault.masterPassword.changedAgo", {
    date: absolute,
    days: String(days),
  });
}

function idleLabel(seconds: number, t: SettingsVaultContentProps["t"]): string {
  if (seconds < 60) {
    return t("web.settingsPopup.vault.idle.seconds", { count: String(seconds) });
  }
  if (seconds < 3600) {
    return t("web.settingsPopup.vault.idle.minutes", { count: String(Math.round(seconds / 60)) });
  }
  return t("web.settingsPopup.vault.idle.hours", { count: String(Math.round(seconds / 3600)) });
}

function clipboardLabel(seconds: number, t: SettingsVaultContentProps["t"]): string {
  if (seconds <= 0) {
    return t("web.settingsPopup.vault.clipboard.never");
  }
  if (seconds < 60) {
    return t("web.settingsPopup.vault.clipboard.seconds", { count: String(seconds) });
  }
  return t("web.settingsPopup.vault.clipboard.minutes", { count: String(Math.round(seconds / 60)) });
}

export default function SettingsVaultContent({ t, workspaceIds }: SettingsVaultContentProps) {
  const core = useAuthenticatedCoreClient();
  const { locale } = useLocale();
  const {
    userId,
    vaultKey,
    passwordShareC,
    vaultIdleLockMs,
    setVaultIdleLockMs,
    masterPasswordChangedAt,
    changeMasterPassword,
  } = useAuthVault();

  const [prefs, setPrefs] = useState<VaultDevicePrefs>(() => readVaultDevicePrefs(userId));
  const [idleSeconds, setIdleSeconds] = useState(() => Math.round(vaultIdleLockMs / 1000));
  const [changeOpen, setChangeOpen] = useState(false);
  const [changeSubmitting, setChangeSubmitting] = useState(false);
  const [changeError, setChangeError] = useState<string | null>(null);
  const [pinSetupOpen, setPinSetupOpen] = useState(false);
  const [bioError, setBioError] = useState<string | null>(null);
  const [bioBusy, setBioBusy] = useState(false);
  const [bioCapability, setBioCapability] = useState<BiometricCapability | null>(null);
  const [changedAt, setChangedAt] = useState(masterPasswordChangedAt);

  useEffect(() => {
    setPrefs(readVaultDevicePrefs(userId));
  }, [userId]);

  useEffect(() => {
    let cancelled = false;
    void getBiometricUnlockCapability().then((capability) => {
      if (!cancelled) {
        setBioCapability(capability);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setIdleSeconds(Math.round(vaultIdleLockMs / 1000));
  }, [vaultIdleLockMs]);

  useEffect(() => {
    setChangedAt(masterPasswordChangedAt);
  }, [masterPasswordChangedAt]);

  const updatePrefs = useCallback(
    (patch: Partial<VaultDevicePrefs>) => {
      if (!userId) {
        return;
      }
      setPrefs(patchVaultDevicePrefs(userId, patch));
      notifySaved(t);
    },
    [userId, t],
  );

  const bioMessageForCode = useCallback(
    (code: BiometricUnlockErrorCode) => t(biometricErrorMessageKey(code)),
    [t],
  );

  const runBiometricSetup = useCallback(async () => {
    if (!userId || !vaultKey || !passwordShareC) {
      setBioError(t("web.settingsPopup.vault.biometric.needUnlock"));
      return false;
    }
    setBioBusy(true);
    setBioError(null);
    try {
      const capability = await getBiometricUnlockCapability();
      setBioCapability(capability);
      if (capability.status !== "ready") {
        setBioError(bioMessageForCode(capability.code));
        return false;
      }
      const result = await setupBiometricUnlock({
        userId,
        vaultKey,
        passwordShareC,
      });
      if (!result.ok) {
        setBioError(bioMessageForCode(result.code));
        return false;
      }
      setBioError(null);
      updatePrefs({ biometricEnabled: true });
      return true;
    } finally {
      setBioBusy(false);
    }
  }, [userId, vaultKey, passwordShareC, t, bioMessageForCode, updatePrefs]);

  const bioReady = bioCapability?.status === "ready";
  const bioBlockedCode =
    bioCapability && bioCapability.status !== "ready" ? bioCapability.code : null;

  const zoneGroups = useMemo(
    () =>
      [
        {
          label: t("web.settingsPopup.vault.zones.group.sections"),
          zones: [
            { id: "capsules" as const, label: t("web.settingsPopup.vault.zones.capsules") },
            { id: "monitoring" as const, label: t("web.settingsPopup.vault.zones.monitoring") },
            { id: "tools" as const, label: t("web.settingsPopup.vault.zones.tools") },
            {
              id: "workspaceSettings" as const,
              label: t("web.settingsPopup.vault.zones.workspaceSettings"),
            },
          ],
        },
        {
          label: t("web.settingsPopup.vault.zones.group.popups"),
          zones: [
            {
              id: "personalSettings" as const,
              label: t("web.settingsPopup.vault.zones.personalSettings"),
            },
            { id: "itemPopups" as const, label: t("web.settingsPopup.vault.zones.itemPopups") },
            {
              id: "capsulePopups" as const,
              label: t("web.settingsPopup.vault.zones.capsulePopups"),
            },
            { id: "vaultPopups" as const, label: t("web.settingsPopup.vault.zones.vaultPopups") },
            { id: "foldersPopup" as const, label: t("web.settingsPopup.vault.zones.foldersPopup") },
          ],
        },
        {
          label: t("web.settingsPopup.vault.zones.group.actions"),
          zones: [{ id: "deletion" as const, label: t("web.settingsPopup.vault.zones.deletion") }],
        },
      ] satisfies Array<{
        label: string;
        zones: Array<{ id: SectionReauthZoneId; label: string }>;
      }>,
    [t],
  );

  async function handleIdleChange(value: string) {
    const seconds = Number(value);
    if (!Number.isFinite(seconds) || !core) {
      return;
    }
    setIdleSeconds(seconds);
    setVaultIdleLockMs(vaultIdleLockMsFromServerSeconds(seconds));
    try {
      const dto = normalizeAccountProfileWire(
        await core.updateAccountProfile({ vault_idle_lock_seconds: seconds }),
      );
      if (dto) {
        setVaultIdleLockMs(vaultIdleLockMsFromServerSeconds(dto.vault_idle_lock_seconds));
        setIdleSeconds(dto.vault_idle_lock_seconds);
      }
      notifySaved(t);
    } catch {
      /* keep optimistic local value */
    }
  }

  return (
    <div className="min-h-[420px] pb-1">
      <section>
        <SettingsRow
          border={false}
          label={t("web.settingsPopup.vault.idle.label")}
          description={t("web.settingsPopup.vault.idle.description")}
          controlClassName="w-[150px]"
        >
          <Select value={String(idleSeconds)} onValueChange={(v) => void handleIdleChange(v)}>
            <SelectTrigger className="w-full font-normal">
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="end">
              {IDLE_LOCK_OPTIONS_SECONDS.map((seconds) => (
                <SelectItem key={seconds} value={String(seconds)}>
                  {idleLabel(seconds, t)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingsRow>

        <SettingsRow
          label={t("web.settingsPopup.vault.lockOnSleep.label")}
          description={t("web.settingsPopup.vault.lockOnSleep.description")}
          controlClassName="w-[100px]"
        >
          <Switch
            size="lg"
            checked={prefs.lockOnDeviceSleep}
            onCheckedChange={(checked) => updatePrefs({ lockOnDeviceSleep: checked })}
          />
        </SettingsRow>

        <SettingsRow
          label={t("web.settingsPopup.vault.clipboard.label")}
          description={t("web.settingsPopup.vault.clipboard.description")}
          controlClassName="w-[150px]"
        >
          <Select
            value={String(prefs.clipboardClearSeconds)}
            onValueChange={(v) => updatePrefs({ clipboardClearSeconds: Number(v) })}
          >
            <SelectTrigger className="w-full font-normal">
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="end">
              {CLIPBOARD_CLEAR_OPTIONS_SECONDS.map((seconds) => (
                <SelectItem key={seconds} value={String(seconds)}>
                  {clipboardLabel(seconds, t)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingsRow>
      </section>

      <SettingsSectionDivider />

      <section>
        <SettingsSectionHeading>{t("web.settingsPopup.vault.masterPassword.section")}</SettingsSectionHeading>
        <SettingsRow
          border={false}
          label={t("web.settingsPopup.vault.masterPassword.lastSet")}
          description={formatRelativePast(changedAt, locale, t)}
          controlClassName="w-auto"
        >
          <Button type="button" onClick={() => setChangeOpen(true)}>
            {t("web.settingsPopup.vault.masterPassword.change")}
          </Button>
        </SettingsRow>

        <SettingsRow
          label={t("web.settingsPopup.vault.requirePassword.label")}
          description={t("web.settingsPopup.vault.requirePassword.description")}
          controlClassName="w-[150px]"
        >
          <MultiSelect
            displayMode="summary"
            selectionCountLabel={t("web.settingsPopup.vault.requirePassword.selectedCount")}
            value={prefs.requireReauthZones}
            onValueChange={(value) =>
              updatePrefs({ requireReauthZones: value as SectionReauthZoneId[] })
            }
            placeholder={t("web.settingsPopup.vault.requirePassword.placeholder")}
          >
            <MultiSelectTrigger className="w-full font-normal" />
            <MultiSelectContent align="end" className="w-[280px] min-w-[280px]">
              {zoneGroups.map((group) => (
                <div key={group.label}>
                  <MultiSelectGroupLabel>{group.label}</MultiSelectGroupLabel>
                  {group.zones.map((zone) => (
                    <MultiSelectItem key={zone.id} value={zone.id}>
                      {zone.label}
                    </MultiSelectItem>
                  ))}
                </div>
              ))}
            </MultiSelectContent>
          </MultiSelect>
        </SettingsRow>
      </section>

      <SettingsSectionDivider />

      <section>
        <SettingsSectionHeading>{t("web.settingsPopup.vault.extra.section")}</SettingsSectionHeading>
        <div className={cn("flex flex-col gap-4 py-4")}>
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1 py-0.5">
              <p className="text-sm font-medium leading-5 text-foreground">
                {t("web.settingsPopup.vault.biometric.label")}
              </p>
              <p className="mt-1 text-sm leading-5 text-muted-foreground">
                {t("web.settingsPopup.vault.biometric.description")}
              </p>
            </div>
            <div className="flex min-h-12 w-[100px] shrink-0 items-center justify-end">
              <Switch
                size="lg"
                checked={prefs.biometricEnabled}
                disabled={bioBusy || (!prefs.biometricEnabled && bioCapability !== null && !bioReady)}
                onCheckedChange={(checked) => {
                  if (!checked) {
                    if (userId) {
                      disableBiometricUnlock(userId);
                    }
                    setBioError(null);
                    updatePrefs({ biometricEnabled: false });
                    return;
                  }
                  void runBiometricSetup();
                }}
              />
            </div>
          </div>
          {prefs.biometricEnabled ? (
            <Button
              type="button"
              variant="secondary"
              className="w-full"
              disabled={bioBusy || !bioReady}
              onClick={() => {
                void runBiometricSetup();
              }}
            >
              <SettingsIcon className="size-4" />
              {bioBusy
                ? t("web.settingsPopup.vault.biometric.setupBusy")
                : t("web.settingsPopup.vault.biometric.reconfigure")}
            </Button>
          ) : null}
          {bioBusy && !prefs.biometricEnabled ? (
            <p className="text-sm text-muted-foreground">
              {t("web.settingsPopup.vault.biometric.setupBusy")}
            </p>
          ) : null}
          {bioError ? (
            <Alert variant="error">
              <AlertDescription>{bioError}</AlertDescription>
            </Alert>
          ) : null}
          {!bioError && bioBlockedCode ? (
            <Alert variant="info">
              <AlertDescription>{bioMessageForCode(bioBlockedCode)}</AlertDescription>
            </Alert>
          ) : null}
        </div>

        <SettingsRow
          label={t("web.settingsPopup.vault.pin.label")}
          description={t("web.settingsPopup.vault.pin.description")}
          controlClassName="w-[100px]"
        >
          <Switch
            size="lg"
            checked={prefs.pinEnabled}
            onCheckedChange={(checked) => {
              if (checked) {
                setPinSetupOpen(true);
                return;
              }
              if (userId) {
                writePinUnlockWrap(userId, null);
              }
              updatePrefs({ pinEnabled: false });
            }}
          />
        </SettingsRow>
      </section>

      <ChangeMasterPasswordPopup
        open={changeOpen}
        submitting={changeSubmitting}
        errorMessage={changeError}
        t={t}
        onClose={() => {
          if (!changeSubmitting) {
            setChangeOpen(false);
            setChangeError(null);
          }
        }}
        onSubmit={({ oldPassword, newPassword }) => {
          void (async () => {
            setChangeSubmitting(true);
            setChangeError(null);
            const result = await changeMasterPassword({
              oldPassword,
              newPassword,
              workspaceIds,
            });
            setChangeSubmitting(false);
            if (!result.ok) {
              setChangeError(
                result.error === "wrong_old_password"
                  ? t("web.settingsPopup.vault.changePassword.wrongOld")
                  : t("web.settingsPopup.vault.changePassword.failed"),
              );
              return;
            }
            setChangedAt(result.masterPasswordChangedAt);
            updatePrefs({ pinEnabled: false, biometricEnabled: false });
            if (userId) {
              clearDeviceUnlockSecrets(userId);
            }
            setChangeOpen(false);
          })();
        }}
      />

      <SetupPinPopup
        open={pinSetupOpen}
        t={t}
        onClose={() => setPinSetupOpen(false)}
        onSubmit={(pin) => {
          void (async () => {
            if (!userId || !vaultKey || !passwordShareC) {
              setPinSetupOpen(false);
              return;
            }
            const pinBytes = new TextEncoder().encode(pin);
            try {
              const wrap = await wrapUnlockMaterialWithPin({
                vaultKey,
                passwordShareC,
                pinUtf8: pinBytes,
              });
              writePinUnlockWrap(userId, wrap);
              updatePrefs({ pinEnabled: true });
              setPinSetupOpen(false);
            } finally {
              pinBytes.fill(0);
            }
          })();
        }}
      />
    </div>
  );
}
