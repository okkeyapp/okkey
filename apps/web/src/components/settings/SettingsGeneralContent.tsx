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
} from "@okkey/ui";
import { getWebLocaleNativeName, WEB_LOCALES, type WebLocale, type WebMessageValues } from "@okkey/i18n";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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
import { useSettingsPopupCacheEntry } from "./useSettingsPopupCache";
import AccountSecurityScoreBlock from "./AccountSecurityScoreBlock";
import SettingsEmailChangePopup from "./SettingsEmailChangePopup";

type SettingsGeneralContentProps = {
  t: (messageKey: string, values?: WebMessageValues) => string;
};

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
  /** When false, label and control stay on one row on mobile (control stays right). */
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
  const [emailChangeOpen, setEmailChangeOpen] = useState(false);
  const firstNameDirtyRef = useRef(false);
  const lastNameDirtyRef = useRef(false);

  const ensureProfile = useCallback(async () => {
    if (!core) {
      throw new Error("no core client");
    }
    const wire = normalizeAccountProfileWire(await core.getAccountProfile());
    if (!wire) {
      throw new Error("invalid account profile");
    }
    return wire;
  }, [core]);
  const { data: cachedProfile, setData: setCachedProfile } = useSettingsPopupCacheEntry(
    "profile",
    ensureProfile,
  );

  useEffect(() => {
    setFirstName(profile?.firstName ?? "");
    setLastName(profile?.lastName ?? "");
  }, [profile?.firstName, profile?.lastName]);

  useEffect(() => {
    if (!cachedProfile) {
      return;
    }
    const savedRegion = normalizeRegionCode(cachedProfile.billing_region);
    setRegion(savedRegion ?? detectBrowserRegion());
    if (cachedProfile.locale === "en" || cachedProfile.locale === "ru") {
      setLocale(cachedProfile.locale);
    }
  }, [cachedProfile, setLocale]);

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

  function updateLocale(nextLocale: WebLocale) {
    setLocale(nextLocale);
    void (async () => {
      try {
        await core?.updateAccountProfile({ locale: nextLocale });
        if (cachedProfile) {
          setCachedProfile({ ...cachedProfile, locale: nextLocale });
        }
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
        if (cachedProfile) {
          setCachedProfile({ ...cachedProfile, billing_region: normalized });
        }
        toast.success(t("web.toast.save.success"));
      } catch {
        /* Keep local region; user can retry. */
      }
    })();
  }

  return (
    <div className="min-h-[420px] pb-1">
      <AccountSecurityScoreBlock t={t} />

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
      <SettingsEmailChangePopup
        open={emailChangeOpen}
        currentEmail={profile?.email ?? ""}
        onClose={() => setEmailChangeOpen(false)}
        t={t}
      />
    </div>
  );
}
