import type { WebMessageValues } from "@okkey/i18n";
import { Alert, AlertDescription, AlertTitle, Button, Popup } from "@okkey/ui";
import { useCallback, useEffect, useId, useState } from "react";

import { SixDigitCodeInput, TOTP_CODE_LENGTH } from "./SixDigitCodeInput";

type TotpCodeConfirmPopupProps = {
  open: boolean;
  t: (messageKey: string, values?: WebMessageValues) => string;
  header: string;
  description: string;
  confirmLabel: string;
  onClose: () => void;
  onConfirm: (code: string) => Promise<void>;
};

export default function TotpCodeConfirmPopup({
  open,
  t,
  header,
  description,
  confirmLabel,
  onClose,
  onConfirm,
}: TotpCodeConfirmPopupProps) {
  const formId = useId();
  const labelId = useId();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [autoSubmitUsed, setAutoSubmitUsed] = useState(false);
  const [inputResetKey, setInputResetKey] = useState(0);

  useEffect(() => {
    if (!open) {
      return;
    }
    setCode("");
    setError(null);
    setSubmitting(false);
    setAutoSubmitUsed(false);
    setInputResetKey((n) => n + 1);
  }, [open]);

  const submitCode = useCallback(
    async (nextCode: string, fromAuto: boolean) => {
      if (submitting || nextCode.length !== TOTP_CODE_LENGTH) {
        return;
      }
      if (fromAuto && autoSubmitUsed) {
        return;
      }
      if (fromAuto) {
        setAutoSubmitUsed(true);
      }
      setSubmitting(true);
      setError(null);
      try {
        await onConfirm(nextCode);
      } catch (err) {
        setError(err instanceof Error ? err.message : t("web.settingsPopup.twoFactor.error.generic"));
        setCode("");
        setInputResetKey((n) => n + 1);
      } finally {
        setSubmitting(false);
      }
    },
    [autoSubmitUsed, onConfirm, submitting, t],
  );

  if (!open) {
    return null;
  }

  return (
    <Popup
      className="z-popup-nested"
      width={440}
      header={header}
      closeLabel={t("web.settingsPopup.close")}
      onClose={onClose}
      panelClassName="min-h-0"
      contentClassName="pt-0 pb-1"
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
            {t("web.newItemPopup.cancel")}
          </Button>
          <Button
            type="submit"
            form={formId}
            disabled={submitting || code.length !== TOTP_CODE_LENGTH}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <form
        id={formId}
        className="flex w-full flex-col gap-5"
        onSubmit={(event) => {
          event.preventDefault();
          void submitCode(code, false);
        }}
        noValidate
      >
        <p className="text-sm leading-5 text-muted-foreground">{description}</p>
        {error ? (
          <Alert variant="error">
            <AlertTitle>{t("unlock.errorTitle")}</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        <div className="flex flex-col gap-3">
          <span id={labelId} className="text-sm font-medium text-foreground">
            {t("auth.twoFactor.label")}
          </span>
          <SixDigitCodeInput
            onChange={setCode}
            onComplete={(next) => {
              void submitCode(next, true);
            }}
            digitAriaLabel={(n, total) => t("auth.otp.digitAriaLabel", { n, total })}
            labelledBy={labelId}
            disabled={submitting}
            resetKey={inputResetKey}
          />
        </div>
      </form>
    </Popup>
  );
}
