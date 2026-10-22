import type { WebLocale, WebMessageValues } from "@okkey/i18n";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Input,
  Popup,
} from "@okkey/ui";
import { useEffect, useId, useState } from "react";

import {
  normalizeRegionCode,
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
  }) => void;
};

/**
 * Self-hosted FREE license request: contact email only.
 * Workspace name/URL/region/locale/sender/member count are filled server-side (or silently from profile).
 */
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
  const [email, setEmail] = useState(initialEmail);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    setEmail(initialEmail);
    setLocalError(null);
  }, [open, initialEmail]);

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
            if (!canSubmit) {
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
              region: normalizeRegionCode(initialRegion),
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
