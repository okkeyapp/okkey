import type { WebMessageValues } from "@okkey/i18n";
import {
  Alert,
  AlertDescription,
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  cn,
} from "@okkey/ui";
import { useCallback, useEffect, useState, type ReactNode, type SVGProps } from "react";
import { toast } from "sonner";

import { useAuthVault } from "../../auth/AuthVaultContext";
import {
  CLIPBOARD_CLEAR_OPTIONS_SECONDS,
  IDLE_LOCK_OPTIONS_SECONDS,
  patchVaultDevicePrefs,
  readVaultDevicePrefs,
  type VaultDevicePrefs,
} from "../../auth/vaultDevicePrefs";
import { vaultIdleLockMsFromServerSeconds } from "../../auth/vaultIdleLockMs";
import { writePinUnlockWrap } from "../../auth/vaultDeviceUnlockStore";
import {
  setupBiometricUnlock,
  disableBiometricUnlock,
  getBiometricUnlockCapability,
  biometricErrorMessageKey,
  type BiometricCapability,
  type BiometricUnlockErrorCode,
} from "../../auth/biometricUnlock";
import { wrapUnlockMaterialWithPin } from "@okkey/crypto";
import {
  readAccentTintEnabled,
  writeAccentTintEnabled,
} from "../../theme/accentSemanticTint";
import {
  applyStoredTheme,
  readStoredThemePreference,
  type ThemePreference,
} from "../../theme/applyTheme";
import { PAGE_BACKGROUND_GRADIENT_LIGHT } from "../../theme/pageBackgroundGradients";
import SetupPinPopup from "./SetupPinPopup";
import { SettingsRow } from "./SettingsRows";

const ACCENT_OPTIONS = [
  { id: "a1", light: "hsl(215 5% 9%)", dark: "hsl(215 4% 98%)" },
  { id: "a2", light: "hsl(217.2 93.2% 59.8%)", dark: "hsl(217.2 93.2% 59.8%)" },
  { id: "a3", light: "hsl(188.7 96.2% 42.7%)", dark: "hsl(188.7 96.2% 42.7%)" },
  { id: "a4", light: "hsl(159.8 83.5% 41%)", dark: "hsl(159.8 83.5% 41%)" },
  { id: "a5", light: "hsl(24.6 97% 53.1%)", dark: "hsl(24.6 97% 53.1%)" },
  { id: "a6", light: "hsl(331 82.5% 60.4%)", dark: "hsl(331 82.5% 60.4%)" },
  { id: "a7", light: "hsl(258.6 90.5% 67.1%)", dark: "hsl(258.6 90.5% 67.1%)" },
] as const;

type AccentId = (typeof ACCENT_OPTIONS)[number]["id"];

export type DeviceSettingsPage = "personalization" | "security" | "unlock";

type SettingsDeviceSettingsContentProps = {
  t: (messageKey: string, values?: WebMessageValues) => string;
  page: DeviceSettingsPage;
};

function notifySaved(t: SettingsDeviceSettingsContentProps["t"]) {
  toast.success(t("web.toast.save.success"));
}

function CheckIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden {...props}>
      <path d="M13.3334 4L6.00008 11.3333L2.66675 8" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
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

function SunIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg width={24} height={24} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden {...props}>
      <path
        d="M12 2V4M12 20V22M4.93018 4.92993L6.34018 6.33993M17.6602 17.6599L19.0702 19.0699M2 12H4M20 12H22M6.34018 17.6599L4.93018 19.0699M19.0702 4.92993L17.6602 6.33993M16 12C16 14.2091 14.2091 16 12 16C9.79086 16 8 14.2091 8 12C8 9.79086 9.79086 8 12 8C14.2091 8 16 9.79086 16 12Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function MoonIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg width={24} height={24} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden {...props}>
      <path
        d="M12 3C10.8065 4.19347 10.136 5.81217 10.136 7.5C10.136 9.18783 10.8065 10.8065 12 12C13.1935 13.1935 14.8122 13.864 16.5 13.864C18.1878 13.864 19.8065 13.1935 21 12C21 13.78 20.4722 15.5201 19.4832 17.0001C18.4943 18.4802 17.0887 19.6337 15.4442 20.3149C13.7996 20.9961 11.99 21.1743 10.2442 20.8271C8.49836 20.4798 6.89472 19.6226 5.63604 18.364C4.37737 17.1053 3.5202 15.5016 3.17294 13.7558C2.82567 12.01 3.0039 10.2004 3.68509 8.55585C4.36628 6.91131 5.51983 5.50571 6.99987 4.51677C8.47991 3.52784 10.22 3 12 3Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SunMoonIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg width={24} height={24} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden {...props}>
      <path
        d="M12 2V4M12 20V22M4.8999 4.8999L6.2999 6.2999M17.7002 17.7L19.1002 19.1M2 12H4M20 12H22M6.2999 17.7L4.8999 19.1M19.1002 4.8999L17.7002 6.2999M12 8C11.4984 8.5362 11.2249 9.24634 11.2371 9.98047C11.2493 10.7146 11.5464 11.4152 12.0656 11.9344C12.5848 12.4536 13.2854 12.7507 14.0195 12.7629C14.7537 12.7751 15.4638 12.5016 16 12C16 12.7911 15.7654 13.5645 15.3259 14.2223C14.8864 14.8801 14.2616 15.3928 13.5307 15.6955C12.7998 15.9983 11.9956 16.0775 11.2196 15.9231C10.4437 15.7688 9.73098 15.3878 9.17157 14.8284C8.61216 14.269 8.2312 13.5563 8.07686 12.7804C7.92252 12.0044 8.00173 11.2002 8.30448 10.4693C8.60723 9.73836 9.11992 9.11365 9.77772 8.67412C10.4355 8.2346 11.2089 8 12 8Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function readAccentFromStorage(): AccentId {
  try {
    const raw = window.localStorage.getItem("okkey.accent");
    return ACCENT_OPTIONS.some((option) => option.id === raw) ? (raw as AccentId) : "a2";
  } catch {
    return "a2";
  }
}

function idleLabel(seconds: number, t: SettingsDeviceSettingsContentProps["t"]): string {
  if (seconds < 60) {
    return t("web.settingsPopup.vault.idle.seconds", { count: String(seconds) });
  }
  if (seconds < 3600) {
    return t("web.settingsPopup.vault.idle.minutes", { count: String(Math.round(seconds / 60)) });
  }
  return t("web.settingsPopup.vault.idle.hours", { count: String(Math.round(seconds / 3600)) });
}

function clipboardLabel(seconds: number, t: SettingsDeviceSettingsContentProps["t"]): string {
  if (seconds <= 0) {
    return t("web.settingsPopup.vault.clipboard.never");
  }
  if (seconds < 60) {
    return t("web.settingsPopup.vault.clipboard.seconds", { count: String(seconds) });
  }
  return t("web.settingsPopup.vault.clipboard.minutes", { count: String(Math.round(seconds / 60)) });
}

export default function SettingsDeviceSettingsContent({ t, page }: SettingsDeviceSettingsContentProps) {
  const {
    userId,
    vaultKey,
    passwordShareC,
    vaultIdleLockMs,
    setVaultIdleLockMs,
  } = useAuthVault();

  const [prefs, setPrefs] = useState<VaultDevicePrefs>(() => readVaultDevicePrefs(userId));
  const [idleSeconds, setIdleSeconds] = useState(() => Math.round(vaultIdleLockMs / 1000));
  const [themePreference, setThemePreference] = useState<ThemePreference>(() => readStoredThemePreference());
  const [accent, setAccent] = useState<AccentId>(() => readAccentFromStorage());
  const [accentTintEnabled, setAccentTintEnabled] = useState(() => readAccentTintEnabled());
  const [pinSetupOpen, setPinSetupOpen] = useState(false);
  const [bioError, setBioError] = useState<string | null>(null);
  const [bioBusy, setBioBusy] = useState(false);
  const [bioCapability, setBioCapability] = useState<BiometricCapability | null>(null);

  useEffect(() => {
    setPrefs(readVaultDevicePrefs(userId));
  }, [userId]);

  useEffect(() => {
    setIdleSeconds(Math.round(vaultIdleLockMs / 1000));
  }, [vaultIdleLockMs]);

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

  function updateThemePreference(preference: ThemePreference) {
    window.localStorage.setItem("okkey.theme", preference);
    setThemePreference(preference);
    applyStoredTheme();
    notifySaved(t);
  }

  function updateAccent(nextAccent: AccentId) {
    window.localStorage.setItem("okkey.accent", nextAccent);
    setAccent(nextAccent);
    applyStoredTheme();
    notifySaved(t);
  }

  function updateAccentTint(enabled: boolean) {
    writeAccentTintEnabled(enabled);
    setAccentTintEnabled(enabled);
    applyStoredTheme();
    notifySaved(t);
  }

  function handleIdleChange(value: string) {
    const seconds = Number(value);
    if (!Number.isFinite(seconds) || !userId) {
      return;
    }
    setIdleSeconds(seconds);
    setVaultIdleLockMs(vaultIdleLockMsFromServerSeconds(seconds));
    patchVaultDevicePrefs(userId, { idleLockSeconds: Math.trunc(seconds) });
    notifySaved(t);
  }

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

  function accentColor(option: (typeof ACCENT_OPTIONS)[number]): string {
    if (themePreference === "dark") {
      return option.dark;
    }
    if (themePreference === "light" || typeof document === "undefined") {
      return option.light;
    }
    return document.documentElement.classList.contains("dark") ? option.dark : option.light;
  }

  const themeOptions: Array<{
    value: ThemePreference;
    label: string;
    gradient: string;
    icon: ReactNode;
    iconClassName?: string;
  }> = [
    {
      value: "light",
      label: t("web.settingsPopup.general.theme.light"),
      gradient: PAGE_BACKGROUND_GRADIENT_LIGHT,
      icon: <SunIcon className="!size-6" />,
      iconClassName: "text-[#0A0A0A]",
    },
    {
      value: "dark",
      label: t("web.settingsPopup.general.theme.dark"),
      gradient:
        "linear-gradient(136.85deg, rgba(131,109,81,0) 8.44%, rgb(131,109,81) 91.56%), linear-gradient(180deg, rgb(64,79,112) 0%, rgb(46,125,107) 100%)",
      icon: <MoonIcon className="!size-6" />,
      iconClassName: "text-white",
    },
    {
      value: "auto",
      label: t("web.settingsPopup.general.theme.auto"),
      gradient: PAGE_BACKGROUND_GRADIENT_LIGHT,
      icon: <SunMoonIcon className="!size-6" />,
      iconClassName: "text-[#0A0A0A]",
    },
  ];

  if (page === "personalization") {
    return (
      <div className="min-h-[420px] pb-1">
        <p className="pb-4 text-sm leading-5 text-muted-foreground">
          {t("web.settingsPopup.deviceSettings.description")}
        </p>
        <section>
          <SettingsRow
            label={t("web.settingsPopup.general.theme")}
            border={false}
            controlClassName="w-[338px] overflow-visible max-md:justify-start"
          >
            <div className="flex w-[338px] min-w-[338px] max-w-full justify-end gap-3 max-md:w-full max-md:min-w-0 max-md:justify-start">
              {themeOptions.map((option) => {
                const active = themePreference === option.value;
                return (
                  <Button
                    key={option.value}
                    type="button"
                    variant="ghost"
                    className="group h-auto w-[100px] min-w-[100px] flex-col gap-0 !bg-transparent p-0 text-center !shadow-none outline-none hover:!bg-transparent hover:!shadow-none focus:!bg-transparent focus:!shadow-none focus-visible:!bg-transparent focus-visible:!shadow-none active:!bg-transparent active:!shadow-none"
                    onClick={() => updateThemePreference(option.value)}
                  >
                    <span
                      className={cn(
                        "relative flex h-[70px] w-[100px] overflow-hidden rounded-[10px] border border-border bg-background",
                        "items-center justify-center transition-[border-color,box-shadow]",
                        "group-focus-visible:border-accent group-focus-visible:shadow-[0_0_0_2px_hsl(var(--accent)_/_0.4)]",
                        active && "border-accent shadow-[0_0_0_2px_hsl(var(--accent)_/_0.4)]",
                      )}
                    >
                      <span className="absolute inset-0 rounded-[10px]" style={{ backgroundImage: option.gradient }} aria-hidden />
                      <span className={cn("relative z-[1]", option.iconClassName)}>{option.icon}</span>
                      <span className="pointer-events-none absolute inset-0 rounded-[inherit] shadow-[inset_0_0_0_4px_hsl(var(--background))]" />
                      {active ? (
                        <span className="absolute bottom-1 right-1 flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground">
                          <CheckIcon className="size-4" />
                        </span>
                      ) : null}
                    </span>
                    <span className="mt-1.5 block truncate text-sm leading-5 text-foreground">{option.label}</span>
                  </Button>
                );
              })}
            </div>
          </SettingsRow>
          <SettingsRow label={t("web.settingsPopup.general.accent")} controlClassName="max-md:justify-start">
            <div className="flex w-full items-center justify-end gap-1.5 max-md:justify-start">
              {ACCENT_OPTIONS.map((option) => {
                const color = accentColor(option);
                const checkOnLightAccent = option.id === "a1";
                return (
                  <Button
                    key={option.id}
                    type="button"
                    size="icon"
                    variant="ghost"
                    className={cn(
                      "group size-9 rounded-full p-0 shadow-none hover:shadow-none",
                      "focus-visible:shadow-[0_0_0_3px_hsl(var(--accent)_/_0.35)]",
                      checkOnLightAccent ? "text-white dark:text-[#0A0A0A]" : "text-white",
                    )}
                    style={{ backgroundColor: color }}
                    aria-label={t("web.settingsPopup.general.accentAria", { id: option.id })}
                    onClick={() => updateAccent(option.id)}
                  >
                    <CheckIcon
                      className={cn(
                        "size-4 opacity-0 transition-opacity",
                        accent === option.id && "opacity-100",
                        "group-hover:opacity-100",
                      )}
                    />
                  </Button>
                );
              })}
            </div>
          </SettingsRow>
          <SettingsRow
            label={t("web.settingsPopup.general.accentTint")}
            description={t("web.settingsPopup.general.accentTintHint")}
            stackOnMobile={false}
          >
            <Switch
              size="lg"
              checked={accentTintEnabled}
              onCheckedChange={updateAccentTint}
              aria-label={t("web.settingsPopup.general.accentTint")}
            />
          </SettingsRow>
        </section>
      </div>
    );
  }

  if (page === "security") {
    return (
      <div className="min-h-[420px] pb-1">
        <p className="pb-4 text-sm leading-5 text-muted-foreground">
          {t("web.settingsPopup.deviceSettings.description")}
        </p>
        <section>
          <SettingsRow
            border={false}
            label={t("web.settingsPopup.vault.idle.label")}
            description={t("web.settingsPopup.vault.idle.description")}
            controlClassName="w-[150px]"
          >
            <Select value={String(idleSeconds)} onValueChange={(v) => handleIdleChange(v)}>
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
      </div>
    );
  }

  return (
    <div className="min-h-[420px] pb-1">
      <p className="pb-4 text-sm leading-5 text-muted-foreground">
        {t("web.settingsPopup.deviceSettings.description")}
      </p>
      <section>
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
