import type { WebMessageValues } from "@okkey/i18n";
import type { TotpEnrollStartResponseDto } from "@okkey/types";
import { Alert, AlertDescription, AlertTitle, Button, Popup } from "@okkey/ui";
import { Copy } from "lucide-react";
import { useCallback, useEffect, useId, useState } from "react";
import QRCode from "qrcode";

import { SixDigitCodeInput, TOTP_CODE_LENGTH } from "./SixDigitCodeInput";

type TotpEnrollPopupProps = {
  open: boolean;
  t: (messageKey: string, values?: WebMessageValues) => string;
  enrollment: TotpEnrollStartResponseDto | null;
  loadingEnrollment: boolean;
  enrollmentError: string | null;
  onClose: () => void;
  onConfirm: (code: string) => Promise<void>;
};

type EnrollStep = "qr" | "confirm";

export default function TotpEnrollPopup({
  open,
  t,
  enrollment,
  loadingEnrollment,
  enrollmentError,
  onClose,
  onConfirm,
}: TotpEnrollPopupProps) {
  const formId = useId();
  const otpLabelId = useId();
  const [step, setStep] = useState<EnrollStep>("qr");
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [autoSubmitUsed, setAutoSubmitUsed] = useState(false);
  const [inputResetKey, setInputResetKey] = useState(0);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }
    setStep("qr");
    setCode("");
    setError(null);
    setSubmitting(false);
    setAutoSubmitUsed(false);
    setInputResetKey((n) => n + 1);
    setCopied(false);
  }, [open]);

  useEffect(() => {
    if (!open || !enrollment?.otpauthUri) {
      setQrDataUrl(null);
      return;
    }
    let cancelled = false;
    void QRCode.toDataURL(enrollment.otpauthUri, {
      margin: 1,
      width: 200,
      errorCorrectionLevel: "M",
    }).then((url) => {
      if (!cancelled) {
        setQrDataUrl(url);
      }
    }).catch(() => {
      if (!cancelled) {
        setQrDataUrl(null);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [open, enrollment?.otpauthUri]);

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

  async function handleCopySecret() {
    if (!enrollment?.secretBase32) {
      return;
    }
    try {
      await navigator.clipboard.writeText(enrollment.secretBase32);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setError(t("web.settingsPopup.twoFactor.error.copyFailed"));
    }
  }

  const header =
    step === "qr"
      ? t("web.settingsPopup.twoFactor.enroll.qrTitle")
      : t("web.settingsPopup.twoFactor.enroll.confirmTitle");

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
        step === "qr" ? (
          <>
            <Button type="button" variant="outline" onClick={onClose}>
              {t("web.newItemPopup.cancel")}
            </Button>
            <Button
              type="button"
              disabled={!enrollment || loadingEnrollment}
              onClick={() => {
                setError(null);
                setStep("confirm");
                setCode("");
                setInputResetKey((n) => n + 1);
              }}
            >
              {t("web.settingsPopup.twoFactor.enroll.next")}
            </Button>
          </>
        ) : (
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setError(null);
                setStep("qr");
                setCode("");
                setInputResetKey((n) => n + 1);
              }}
            >
              {t("web.settingsPopup.twoFactor.enroll.back")}
            </Button>
            <Button
              type="submit"
              form={formId}
              disabled={submitting || code.length !== TOTP_CODE_LENGTH}
            >
              {t("web.settingsPopup.twoFactor.enroll.confirm")}
            </Button>
          </>
        )
      }
    >
      {step === "qr" ? (
        <div className="flex w-full flex-col gap-5">
          <p className="text-sm leading-5 text-muted-foreground">
            {t("web.settingsPopup.twoFactor.enroll.qrDescription")}
          </p>
          {enrollmentError ? (
            <Alert variant="error">
              <AlertTitle>{t("unlock.errorTitle")}</AlertTitle>
              <AlertDescription>{enrollmentError}</AlertDescription>
            </Alert>
          ) : null}
          {loadingEnrollment ? (
            <p className="text-sm text-muted-foreground">{t("web.settingsPopup.twoFactor.loading")}</p>
          ) : null}
          {qrDataUrl ? (
            <div className="flex justify-center">
              <img
                src={qrDataUrl}
                alt={t("web.settingsPopup.twoFactor.enroll.qrAlt")}
                className="size-[200px] rounded-lg bg-white p-2"
              />
            </div>
          ) : null}
          {enrollment?.secretBase32 ? (
            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium text-foreground">
                {t("web.settingsPopup.twoFactor.enroll.secretLabel")}
              </p>
              <div className="flex items-center gap-2 rounded-lg bg-secondary px-3 py-2">
                <code className="min-w-0 flex-1 break-all text-sm tabular-nums text-foreground">
                  {enrollment.secretBase32}
                </code>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-8 shrink-0"
                  onClick={() => void handleCopySecret()}
                  aria-label={t("web.settingsPopup.twoFactor.enroll.copySecret")}
                >
                  <Copy className="size-4" />
                </Button>
              </div>
              {copied ? (
                <p className="text-xs text-muted-foreground">
                  {t("web.settingsPopup.twoFactor.enroll.secretCopied")}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : (
        <form
          id={formId}
          className="flex w-full flex-col gap-5"
          onSubmit={(event) => {
            event.preventDefault();
            void submitCode(code, false);
          }}
          noValidate
        >
          <p className="text-sm leading-5 text-muted-foreground">
            {t("web.settingsPopup.twoFactor.enroll.confirmDescription")}
          </p>
          {error ? (
            <Alert variant="error">
              <AlertTitle>{t("unlock.errorTitle")}</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <div className="flex flex-col gap-3">
            <span id={otpLabelId} className="text-sm font-medium text-foreground">
              {t("web.settingsPopup.twoFactor.enroll.codeLabel")}
            </span>
            <SixDigitCodeInput
              onChange={setCode}
              onComplete={(next) => {
                void submitCode(next, true);
              }}
              digitAriaLabel={(n, total) => t("auth.otp.digitAriaLabel", { n, total })}
              labelledBy={otpLabelId}
              disabled={submitting}
              resetKey={inputResetKey}
            />
          </div>
        </form>
      )}
    </Popup>
  );
}
