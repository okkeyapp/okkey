import type { WebMessageValues } from "@okkey/i18n";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Input,
  Popup,
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
import { getWebLocaleNativeName, WEB_LOCALES, type WebLocale } from "@okkey/i18n";
import { useEffect, useId, useMemo, useState } from "react";

import {
  formatRegionName,
  detectBrowserRegion,
  normalizeRegionCode,
  REGION_CODES,
  type RegionCode,
} from "../../../../regions/regions";
import { planTierLabel } from "../../../../workspace/planTierLabel";

type PlanChangeRequestPopupProps = {
  open: boolean;
  requestedPlanTier: string;
  initialLocale: WebLocale;
  initialRegion: string | null;
  initialEmail: string;
  submitting?: boolean;
  errorMessage?: string | null;
  success?: boolean;
  t: (messageKey: string, values?: WebMessageValues) => string;
  onClose: () => void;
  onSubmit: (input: {
    contactEmail: string;
    locale: WebLocale;
    region: RegionCode | null;
  }) => void;
};

export default function PlanChangeRequestPopup({
  open,
  requestedPlanTier,
  initialLocale,
  initialRegion,
  initialEmail,
  submitting = false,
  errorMessage = null,
  success = false,
  t,
  onClose,
  onSubmit,
}: PlanChangeRequestPopupProps) {
  const formId = useId();
  const [locale, setLocale] = useState<WebLocale>(initialLocale);
  const [region, setRegion] = useState<RegionCode | null>(
    () => normalizeRegionCode(initialRegion) ?? detectBrowserRegion(),
  );
  const [email, setEmail] = useState(initialEmail);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    setLocale(initialLocale);
    setRegion(normalizeRegionCode(initialRegion) ?? detectBrowserRegion());
    setEmail(initialEmail);
    setLocalError(null);
  }, [open, initialLocale, initialRegion, initialEmail]);

  const regionOptions = useMemo(
    () =>
      REGION_CODES.map((code) => ({
        code,
        label: formatRegionName(code, locale),
      })),
    [locale],
  );

  if (!open) {
    return null;
  }

  function handleClose() {
    if (submitting) {
      return;
    }
    onClose();
  }

  const emailTrimmed = email.trim();
  const canSubmit = emailTrimmed.includes("@") && !submitting && !success;

  return (
    <Popup
      className="z-popup-nested"
      width={440}
      header={
        success
          ? t("web.workspaceSettings.plan.request.successTitle")
          : t("web.workspaceSettings.plan.request.title", {
              plan: planTierLabel(requestedPlanTier, t),
            })
      }
      closeLabel={t("web.settingsPopup.close")}
      onClose={handleClose}
      closeDisabled={submitting}
      panelClassName="min-h-0"
      contentClassName="pt-0 pb-1"
      footer={
        success ? (
          <Button type="button" onClick={handleClose}>
            {t("web.workspaceSettings.plan.request.successClose")}
          </Button>
        ) : (
          <>
            <Button type="button" variant="outline" onClick={handleClose} disabled={submitting}>
              {t("web.newItemPopup.cancel")}
            </Button>
            <Button type="submit" form={formId} disabled={!canSubmit}>
              {t("web.workspaceSettings.plan.request.submit")}
            </Button>
          </>
        )
      }
    >
      {success ? (
        <p className="text-sm leading-5 text-muted-foreground">
          {t("web.workspaceSettings.plan.request.successBody")}
        </p>
      ) : (
        <form
          id={formId}
          className="flex w-full flex-col gap-5"
          onSubmit={(event) => {
            event.preventDefault();
            if (!canSubmit) {
              return;
            }
            if (!emailTrimmed.includes("@") || emailTrimmed.length < 3) {
              setLocalError(t("web.workspaceSettings.plan.request.invalidEmail"));
              return;
            }
            setLocalError(null);
            onSubmit({ contactEmail: emailTrimmed, locale, region });
          }}
        >
          <p className="text-sm leading-5 text-muted-foreground">
            {t("web.workspaceSettings.plan.request.description")}
          </p>

          {(localError || errorMessage) && (
            <Alert variant="error">
              <AlertTitle>{t("web.workspaceSettings.plan.request.errorTitle")}</AlertTitle>
              <AlertDescription>{localError ?? errorMessage}</AlertDescription>
            </Alert>
          )}

          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-foreground" htmlFor={`${formId}-locale`}>
              {t("web.settingsPopup.general.language")}
            </label>
            <Select value={locale} onValueChange={(value) => setLocale(value as WebLocale)}>
              <SelectTrigger id={`${formId}-locale`} className="h-9 w-full font-normal">
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
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium text-foreground">
              {t("web.settingsPopup.general.region")}
            </span>
            <SearchableSelect
              value={region ?? ""}
              onValueChange={(value) => setRegion(normalizeRegionCode(value))}
              selectedLabel={region ? formatRegionName(region, locale) : undefined}
              placeholder={t("web.settingsPopup.general.regionHint")}
              searchPlaceholder={t("web.settingsPopup.general.regionSearch")}
              searchEmptyMessage={t("web.settingsPopup.general.regionEmpty")}
            >
              <SearchableSelectTrigger className="font-normal" />
              <SearchableSelectContent>
                {regionOptions.map((option) => (
                  <SearchableSelectItem
                    key={option.code}
                    value={option.code}
                    label={option.label}
                    searchText={`${option.code} ${option.label}`}
                  >
                    <span className="truncate">{option.label}</span>
                  </SearchableSelectItem>
                ))}
              </SearchableSelectContent>
            </SearchableSelect>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-foreground" htmlFor={`${formId}-email`}>
              {t("web.workspaceSettings.plan.request.emailLabel")}
            </label>
            <Input
              id={`${formId}-email`}
              type="email"
              autoComplete="email"
              value={email}
              disabled={submitting}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
        </form>
      )}
    </Popup>
  );
}
