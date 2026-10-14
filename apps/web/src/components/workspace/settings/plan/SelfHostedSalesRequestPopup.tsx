import type { WebLocale, WebMessageValues } from "@okkey/i18n";
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
} from "@okkey/ui";
import { useEffect, useId, useMemo, useState } from "react";

import {
  detectBrowserRegion,
  formatRegionName,
  normalizeRegionCode,
  REGION_CODES,
  type RegionCode,
} from "../../../../regions/regions";

type SelfHostedSalesRequestPopupProps = {
  open: boolean;
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
    workspaceMemberCount: number;
  }) => void;
};

function parseMemberCount(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }
  const value = Number(trimmed);
  if (!Number.isInteger(value) || value < 1 || !Number.isFinite(value)) {
    return null;
  }
  return value;
}

/** Self-hosted FREE sales contact: member count + region + email (locale sent silently). */
export default function SelfHostedSalesRequestPopup({
  open,
  initialLocale,
  initialRegion,
  initialEmail,
  submitting = false,
  errorMessage = null,
  success = false,
  t,
  onClose,
  onSubmit,
}: SelfHostedSalesRequestPopupProps) {
  const formId = useId();
  const [region, setRegion] = useState<RegionCode | null>(
    () => normalizeRegionCode(initialRegion) ?? detectBrowserRegion(),
  );
  const [email, setEmail] = useState(initialEmail);
  const [memberCountInput, setMemberCountInput] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    setRegion(normalizeRegionCode(initialRegion) ?? detectBrowserRegion());
    setEmail(initialEmail);
    setMemberCountInput("");
    setLocalError(null);
  }, [open, initialRegion, initialEmail]);

  const regionOptions = useMemo(
    () =>
      REGION_CODES.map((code) => ({
        code,
        label: formatRegionName(code, initialLocale),
      })),
    [initialLocale],
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
  const memberCount = parseMemberCount(memberCountInput);
  const canSubmit =
    emailTrimmed.includes("@") && memberCount !== null && !submitting && !success;

  return (
    <Popup
      className="z-popup-nested"
      width={440}
      header={t("web.workspaceSettings.plan.selfHosted.requestTitle")}
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
              {t("web.workspaceSettings.plan.selfHosted.requestSubmit")}
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
            if (!canSubmit || memberCount === null) {
              return;
            }
            if (!emailTrimmed.includes("@") || emailTrimmed.length < 3) {
              setLocalError(t("web.workspaceSettings.plan.request.invalidEmail"));
              return;
            }
            setLocalError(null);
            onSubmit({
              contactEmail: emailTrimmed,
              locale: initialLocale,
              region,
              workspaceMemberCount: memberCount,
            });
          }}
        >
          <p className="text-sm leading-5 text-muted-foreground">
            {t("web.workspaceSettings.plan.selfHosted.requestDescription")}
          </p>

          {(localError || errorMessage) && (
            <Alert variant="error">
              <AlertTitle>{t("web.workspaceSettings.plan.request.errorTitle")}</AlertTitle>
              <AlertDescription>{localError ?? errorMessage}</AlertDescription>
            </Alert>
          )}

          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-foreground" htmlFor={`${formId}-members`}>
              {t("web.workspaceSettings.plan.request.memberCountLabel")}
            </label>
            <Input
              id={`${formId}-members`}
              type="number"
              min={1}
              step={1}
              inputMode="numeric"
              value={memberCountInput}
              disabled={submitting}
              onChange={(event) =>
                setMemberCountInput(event.target.value.replace(/[^\d]/g, ""))
              }
            />
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium text-foreground">
              {t("web.settingsPopup.general.region")}
            </span>
            <SearchableSelect
              value={region ?? ""}
              onValueChange={(value) => setRegion(normalizeRegionCode(value))}
              selectedLabel={region ? formatRegionName(region, initialLocale) : undefined}
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
