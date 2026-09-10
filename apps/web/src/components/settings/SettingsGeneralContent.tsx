import {
  Button,
  cn,
  Input,
  SearchableSelect,
  SearchableSelectContent,
  SearchableSelectItem,
  SearchableSelectTrigger,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
} from "@okkey/ui";
import { getWebLocaleNativeName, WEB_LOCALES, type WebLocale, type WebMessageValues } from "@okkey/i18n";
import { useEffect, useMemo, useRef, useState, type ReactNode, type SVGProps } from "react";
import { toast } from "sonner";

import { useAuthVault, useAuthenticatedCoreClient } from "../../auth/AuthVaultContext";
import { normalizeAccountProfileWire } from "../../auth/normalizeAccountProfileWire";
import { useLocale } from "../../locale/LocaleContext";
import {
  detectBrowserRegion,
  formatRegionName,
  normalizeRegionCode,
  REGION_CODES,
  type RegionCode,
} from "../../regions/regions";
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
import SettingsEmailChangePopup from "./SettingsEmailChangePopup";

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

type SettingsGeneralContentProps = {
  t: (messageKey: string, values?: WebMessageValues) => string;
};

function CheckIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden {...props}>
      <path d="M13.3334 4L6.00008 11.3333L2.66675 8" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
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

function Row({
  label,
  description,
  children,
  border = true,
  controlClassName,
  /** When false, label and control stay on one row on mobile (control stays right). */
  stackOnMobile = true,
}: {
  label: string;
  description?: string;
  children: ReactNode;
  border?: boolean;
  controlClassName?: string;
  stackOnMobile?: boolean;
}) {
  return (
    <div className={cn("py-4", border && "border-t border-border")}>
      <div
        className={cn(
          "flex items-center gap-3",
          stackOnMobile && "max-md:flex-col max-md:items-stretch",
        )}
      >
        <div className="min-w-0 flex-1 py-0.5">
          <p className="text-sm font-medium leading-5 text-foreground">{label}</p>
          {description ? <p className="mt-1 text-sm leading-5 text-muted-foreground">{description}</p> : null}
        </div>
        <div
          className={cn(
            "flex min-h-12 w-[250px] shrink-0 items-center justify-end",
            stackOnMobile ? "max-md:w-full" : "max-md:w-auto",
            controlClassName,
          )}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

function SectionDivider() {
  return <div className="my-2 h-2 rounded-full bg-secondary" aria-hidden />;
}

export default function SettingsGeneralContent({ t }: SettingsGeneralContentProps) {
  const core = useAuthenticatedCoreClient();
  const { profile, updateLocalProfile } = useAuthVault();
  const { locale, setLocale } = useLocale();
  const [firstName, setFirstName] = useState(profile?.firstName ?? "");
  const [lastName, setLastName] = useState(profile?.lastName ?? "");
  const [region, setRegion] = useState<RegionCode>(() => detectBrowserRegion());
  const [themePreference, setThemePreference] = useState<ThemePreference>(() => readStoredThemePreference());
  const [accent, setAccent] = useState<AccentId>(() => readAccentFromStorage());
  const [accentTintEnabled, setAccentTintEnabled] = useState(() => readAccentTintEnabled());
  const [emailChangeOpen, setEmailChangeOpen] = useState(false);
  const firstNameDirtyRef = useRef(false);
  const lastNameDirtyRef = useRef(false);

  useEffect(() => {
    setFirstName(profile?.firstName ?? "");
    setLastName(profile?.lastName ?? "");
  }, [profile?.firstName, profile?.lastName]);

  useEffect(() => {
    if (!core) {
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const dto = normalizeAccountProfileWire(await core.getAccountProfile());
        if (!dto || cancelled) {
          return;
        }
        const savedRegion = normalizeRegionCode(dto.billing_region);
        setRegion(savedRegion ?? detectBrowserRegion());
        if (dto.locale === "en" || dto.locale === "ru") {
          setLocale(dto.locale);
        }
      } catch {
        /* Keep local defaults when profile preferences are unavailable. */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [core, setLocale]);

  useEffect(() => {
    if (!core || (!firstNameDirtyRef.current && !lastNameDirtyRef.current)) {
      return;
    }
    const handle = window.setTimeout(() => {
      const nextFirstName = firstName.trim();
      const nextLastName = lastName.trim();
      void core
        .updateAccountProfile({
          ...(firstNameDirtyRef.current ? { first_name: nextFirstName || null } : {}),
          ...(lastNameDirtyRef.current ? { last_name: nextLastName || null } : {}),
        })
        .then((dto) => {
          updateLocalProfile({
            firstName: dto.first_name,
            lastName: dto.last_name,
          });
          firstNameDirtyRef.current = false;
          lastNameDirtyRef.current = false;
          toast.success(t("web.toast.save.success"));
        })
        .catch(() => {
          /* Keep typed value; user can retry by editing again. */
        });
    }, 450);
    return () => window.clearTimeout(handle);
  }, [core, firstName, lastName, updateLocalProfile, t]);

  const regionOptions = useMemo(() => {
    return REGION_CODES.map((code) => ({
      code,
      label: formatRegionName(code, locale),
    }))
      .sort((a, b) => a.label.localeCompare(b.label, locale));
  }, [locale]);

  function updateThemePreference(preference: ThemePreference) {
    window.localStorage.setItem("okkey.theme", preference);
    setThemePreference(preference);
    applyStoredTheme();
    toast.success(t("web.toast.save.success"));
  }

  function updateAccent(nextAccent: AccentId) {
    window.localStorage.setItem("okkey.accent", nextAccent);
    setAccent(nextAccent);
    applyStoredTheme();
    toast.success(t("web.toast.save.success"));
  }

  function updateAccentTint(enabled: boolean) {
    writeAccentTintEnabled(enabled);
    setAccentTintEnabled(enabled);
    applyStoredTheme();
    toast.success(t("web.toast.save.success"));
  }

  function updateLocale(nextLocale: WebLocale) {
    setLocale(nextLocale);
    void (async () => {
      try {
        await core?.updateAccountProfile({ locale: nextLocale });
        toast.success(t("web.toast.save.success"));
      } catch {
        /* Keep local locale; user can retry. */
      }
    })();
  }

  function updateRegion(nextRegion: string) {
    const normalized = normalizeRegionCode(nextRegion);
    if (!normalized) {
      return;
    }
    setRegion(normalized);
    void (async () => {
      try {
        await core?.updateAccountProfile({ billing_region: normalized });
        toast.success(t("web.toast.save.success"));
      } catch {
        /* Keep local region; user can retry. */
      }
    })();
  }

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

  return (
    <div className="min-h-[420px] pb-1">
      <section>
        <Row label={t("web.settingsPopup.general.firstName")} description={t("web.settingsPopup.general.firstNameHint")} border={false}>
          <Input
            value={firstName}
            onChange={(event) => {
              firstNameDirtyRef.current = true;
              setFirstName(event.target.value);
            }}
            className="w-full"
            aria-label={t("web.settingsPopup.general.firstName")}
          />
        </Row>
        <Row label={t("web.settingsPopup.general.lastName")} description={t("web.settingsPopup.general.lastNameHint")}>
          <Input
            value={lastName}
            onChange={(event) => {
              lastNameDirtyRef.current = true;
              setLastName(event.target.value);
            }}
            className="w-full"
            aria-label={t("web.settingsPopup.general.lastName")}
          />
        </Row>
        <Row label="Email" description={profile?.email ?? ""} stackOnMobile={false}>
          <Button type="button" className="shrink-0" onClick={() => setEmailChangeOpen(true)}>
            {t("web.settingsPopup.general.changeEmail")}
          </Button>
        </Row>
      </section>

      <SectionDivider />

      <section>
        <h3 className="pt-3 text-base font-medium leading-7 text-muted-foreground">
          {t("web.settingsPopup.general.languageRegion")}
        </h3>
        <Row label={t("web.settingsPopup.general.language")} description={t("web.settingsPopup.general.languageHint")} border={false}>
          <Select value={locale} onValueChange={(value) => updateLocale(value as WebLocale)}>
            <SelectTrigger className="h-9 w-full font-normal">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {WEB_LOCALES.map((code) => (
                <SelectItem key={code} value={code}>
                  {getWebLocaleNativeName(code)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Row>
        <Row label={t("web.settingsPopup.general.region")} description={t("web.settingsPopup.general.regionHint")}>
          <SearchableSelect
            value={region}
            onValueChange={updateRegion}
            selectedLabel={formatRegionName(region, locale)}
            placeholder={t("web.settingsPopup.general.regionHint")}
            searchPlaceholder={t("web.settingsPopup.general.regionSearch")}
            searchEmptyMessage={t("web.settingsPopup.general.regionEmpty")}
          >
            <SearchableSelectTrigger className="font-normal" />
            <SearchableSelectContent align="end">
              {regionOptions.map((option) => (
                <SearchableSelectItem key={option.code} value={option.code} label={option.label} searchText={`${option.code} ${option.label}`}>
                  <span className="truncate">{option.label}</span>
                </SearchableSelectItem>
              ))}
            </SearchableSelectContent>
          </SearchableSelect>
        </Row>
      </section>

      <SectionDivider />

      <section>
        <h3 className="pt-3 text-base font-medium leading-7 text-muted-foreground">
          {t("web.settingsPopup.general.appearance")}
        </h3>
        <Row label={t("web.settingsPopup.general.theme")} border={false} controlClassName="w-[338px] overflow-visible max-md:justify-start">
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
        </Row>
        <Row label={t("web.settingsPopup.general.accent")} controlClassName="max-md:justify-start">
          <div className="flex w-full items-center justify-end gap-1.5 max-md:justify-start">
            {ACCENT_OPTIONS.map((option) => {
              const color = accentColor(option);
              return (
                <Button
                  key={option.id}
                  type="button"
                  size="icon"
                  variant="ghost"
                  className={cn(
                    "group size-9 rounded-full p-0 text-white shadow-none hover:shadow-none",
                    "focus-visible:shadow-[0_0_0_3px_hsl(var(--accent)_/_0.35)]",
                  )}
                  style={{ backgroundColor: color }}
                  aria-label={t("web.settingsPopup.general.accentAria", { id: option.id })}
                  onClick={() => updateAccent(option.id)}
                >
                  <CheckIcon className={cn("size-4 opacity-0 transition-opacity", accent === option.id && "opacity-100", "group-hover:opacity-100")} />
                </Button>
              );
            })}
          </div>
        </Row>
        <Row
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
        </Row>
      </section>
      <SettingsEmailChangePopup
        open={emailChangeOpen}
        currentEmail={profile?.email ?? ""}
        onClose={() => setEmailChangeOpen(false)}
        t={t}
      />
    </div>
  );
}
