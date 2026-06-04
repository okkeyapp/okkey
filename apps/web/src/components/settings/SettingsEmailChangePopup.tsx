import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type FormEvent,
  type KeyboardEvent,
  type SVGProps,
} from "react";
import { ApiRequestError } from "@okkey/api";
import { Alert, AlertDescription, AlertTitle, Button, Input, Popup } from "@okkey/ui";
import type { WebMessageValues } from "@okkey/i18n";

import { useAuthenticatedCoreClient, useAuthVault } from "../../auth/AuthVaultContext";
import { useLocale } from "../../locale/LocaleContext";

const OTP_LENGTH = 6;

const otpCellClassName =
  "h-[54px] w-[54px] min-w-[54px] max-w-[54px] shrink-0 p-0 text-center text-lg font-semibold tabular-nums";

type SettingsEmailChangePopupProps = {
  open: boolean;
  currentEmail: string;
  onClose: () => void;
  t: (messageKey: string, values?: WebMessageValues) => string;
};

function ResendIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden {...props}>
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3 3v5h5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function emailChangeErrorMessage(err: unknown, t: SettingsEmailChangePopupProps["t"]): string {
  if (!(err instanceof ApiRequestError)) {
    return t("web.settingsPopup.emailChange.errorGeneric");
  }
  switch (err.body.error) {
    case "EMAIL_CHANGE_EMAIL_INVALID":
      return t("web.settingsPopup.emailChange.errorInvalidEmail");
    case "EMAIL_CHANGE_EMAIL_SAME":
      return t("web.settingsPopup.emailChange.errorSameEmail");
    case "EMAIL_CHANGE_EMAIL_TAKEN":
      return t("web.settingsPopup.emailChange.errorEmailTaken");
    case "EMAIL_CHANGE_CODE_INVALID":
      return t("web.settingsPopup.emailChange.errorInvalidCode");
    case "EMAIL_CHANGE_CODE_EXPIRED":
    case "EMAIL_CHANGE_CODE_ATTEMPTS_EXCEEDED":
      return t("web.settingsPopup.emailChange.errorCodeExpired");
    case "EMAIL_CHANGE_RATE_LIMITED":
    case "EMAIL_CHANGE_RESEND_TOO_EARLY":
      return t("web.settingsPopup.emailChange.errorRateLimited");
    case "EMAIL_SEND_FAILED":
    case "EMAIL_RENDER_FAILED":
    case "EMAIL_TEMPLATE_NOT_FOUND":
      return t("web.settingsPopup.emailChange.errorEmailSend");
    default:
      return t("web.settingsPopup.emailChange.errorGeneric");
  }
}

export default function SettingsEmailChangePopup({
  open,
  currentEmail,
  onClose,
  t,
}: SettingsEmailChangePopupProps) {
  const core = useAuthenticatedCoreClient();
  const { updateLocalProfile } = useAuthVault();
  const { locale } = useLocale();
  const [step, setStep] = useState<"email" | "otp">("email");
  const [email, setEmail] = useState("");
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [resendUntil, setResendUntil] = useState(0);
  const [resendTick, setResendTick] = useState(0);
  const [digits, setDigits] = useState<string[]>(() => Array.from({ length: OTP_LENGTH }, () => ""));
  const inputsRef = useRef<(HTMLInputElement | null)[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attemptsHint, setAttemptsHint] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setStep("email");
      setEmail("");
      setChallengeId(null);
      setResendUntil(0);
      setDigits(Array.from({ length: OTP_LENGTH }, () => ""));
      setSubmitting(false);
      setError(null);
      setAttemptsHint(null);
    }
  }, [open]);

  useEffect(() => {
    if (!open || resendUntil <= Date.now()) {
      return;
    }
    const id = window.setInterval(() => setResendTick((x) => x + 1), 1000);
    return () => window.clearInterval(id);
  }, [open, resendUntil, resendTick]);

  const setDigitAt = useCallback((index: number, char: string) => {
    const d = char.replace(/\D/g, "").slice(-1);
    setDigits((prev) => {
      const next = [...prev];
      next[index] = d;
      return next;
    });
    if (d && index < OTP_LENGTH - 1) {
      inputsRef.current[index + 1]?.focus();
    }
  }, []);

  const handleCellChange = useCallback(
    (index: number, value: string) => {
      if (value.length > 1) {
        const pasted = value.replace(/\D/g, "").slice(0, OTP_LENGTH);
        if (pasted) {
          setDigits(Array.from({ length: OTP_LENGTH }, (_, i) => pasted[i] ?? ""));
          inputsRef.current[Math.min(pasted.length, OTP_LENGTH - 1)]?.focus();
        }
        return;
      }
      setDigitAt(index, value);
    },
    [setDigitAt],
  );

  const handleKeyDown = useCallback(
    (index: number, e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Backspace" && !digits[index] && index > 0) {
        inputsRef.current[index - 1]?.focus();
      }
      if (e.key === "ArrowLeft" && index > 0) {
        e.preventDefault();
        inputsRef.current[index - 1]?.focus();
      }
      if (e.key === "ArrowRight" && index < OTP_LENGTH - 1) {
        e.preventDefault();
        inputsRef.current[index + 1]?.focus();
      }
    },
    [digits],
  );

  const handlePaste = useCallback((e: ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, OTP_LENGTH);
    if (!text) return;
    e.preventDefault();
    setDigits(Array.from({ length: OTP_LENGTH }, (_, i) => text[i] ?? ""));
    inputsRef.current[Math.min(text.length, OTP_LENGTH - 1)]?.focus();
  }, []);

  async function handleEmailSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const nextEmail = email.trim();
    if (!core || !nextEmail) {
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const result = await core.startAccountEmailChange({
        email: nextEmail,
        locale,
      });
      setChallengeId(result.challengeId);
      setResendUntil(Date.parse(result.resendAvailableAt));
      setDigits(Array.from({ length: OTP_LENGTH }, () => ""));
      setStep("otp");
    } catch (err) {
      setError(emailChangeErrorMessage(err, t));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleOtpSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!core || !challengeId) {
      return;
    }
    const code = digits.join("");
    if (code.length !== OTP_LENGTH) {
      return;
    }
    setSubmitting(true);
    setError(null);
    setAttemptsHint(null);
    try {
      const result = await core.confirmAccountEmailChange({
        challengeId,
        code,
      });
      updateLocalProfile({ email: result.email });
      onClose();
    } catch (err) {
      if (err instanceof ApiRequestError) {
        const attemptsLeft = err.body.details?.attemptsLeft;
        if (typeof attemptsLeft === "number" && attemptsLeft >= 0) {
          setAttemptsHint(t("auth.otp.attemptsLeft", { n: String(attemptsLeft) }));
        }
      }
      setError(emailChangeErrorMessage(err, t));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResend() {
    if (!core || !challengeId) {
      return;
    }
    const waitMs = resendUntil - Date.now();
    if (waitMs > 0) {
      setError(t("web.settingsPopup.emailChange.errorRateLimited"));
      return;
    }
    setError(null);
    try {
      const result = await core.resendAccountEmailChangeCode({
        challengeId,
        locale,
      });
      setChallengeId(result.challengeId);
      setResendUntil(Date.parse(result.resendAvailableAt));
      setDigits(Array.from({ length: OTP_LENGTH }, () => ""));
    } catch (err) {
      if (err instanceof ApiRequestError) {
        const retry = err.body.details?.retryAfterSeconds;
        if (typeof retry === "number") {
          setResendUntil(Date.now() + retry * 1000);
        }
      }
      setError(emailChangeErrorMessage(err, t));
    }
  }

  if (!open) {
    return null;
  }

  const resendWaitSec =
    resendUntil > Date.now() ? Math.max(1, Math.ceil((resendUntil - Date.now()) / 1000)) : 0;
  const resendDisabled = resendWaitSec > 0;
  const title = t("web.settingsPopup.emailChange.title");
  const description = step === "email" ? t("web.settingsPopup.emailChange.currentEmail", { email: currentEmail }) : undefined;

  return (
    <Popup
      width={440}
      header={title}
      description={description}
      closeLabel={t("web.settingsPopup.close")}
      onClose={onClose}
    >
      {step === "email" ? (
        <form onSubmit={handleEmailSubmit} className="flex flex-col gap-5" noValidate>
          {error ? (
            <Alert variant="error">
              <AlertTitle>{t("unlock.errorTitle")}</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <div className="flex flex-col gap-2">
            <label htmlFor="settings-email-change-email" className="text-sm font-medium text-foreground">
              {t("web.settingsPopup.emailChange.emailLabel")}
            </label>
            <Input
              id="settings-email-change-email"
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder={t("auth.email.placeholderEmail")}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoFocus
            />
          </div>
          <div className="flex justify-end">
            <Button type="submit" disabled={submitting || !email.trim()}>
              {t("web.settingsPopup.emailChange.next")}
            </Button>
          </div>
        </form>
      ) : (
        <form onSubmit={handleOtpSubmit} className="flex flex-col gap-5" noValidate>
          {error ? (
            <Alert variant="error">
              <AlertTitle>{t("unlock.errorTitle")}</AlertTitle>
              <AlertDescription>
                {error}
                {attemptsHint ? <span className="mt-1 block">{attemptsHint}</span> : null}
              </AlertDescription>
            </Alert>
          ) : null}
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <span id="settings-email-change-otp-label" className="min-w-0 flex-1 text-sm font-medium text-foreground">
                {t("auth.otp.labelConfirmationCode")}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0 gap-1.5"
                onClick={handleResend}
                disabled={resendDisabled}
                aria-label={
                  resendDisabled
                    ? t("auth.otp.resendCountdownAria", { seconds: String(resendWaitSec) })
                    : t("auth.otp.sendAgain")
                }
              >
                <ResendIcon className="size-4" />
                {resendDisabled ? <span className="min-w-[1.5ch] tabular-nums">{resendWaitSec}</span> : t("auth.otp.sendAgain")}
              </Button>
            </div>
            <p className="text-sm leading-5 text-muted-foreground">
              {t("web.settingsPopup.emailChange.otpDescription", { email: email.trim() })}
            </p>
            <div
              role="group"
              aria-labelledby="settings-email-change-otp-label"
              className="flex flex-wrap items-center justify-center gap-2.5"
            >
              {digits.map((digit, index) => (
                <Input
                  key={index}
                  ref={(el) => {
                    inputsRef.current[index] = el;
                  }}
                  type="text"
                  inputMode="numeric"
                  autoComplete={index === 0 ? "one-time-code" : "off"}
                  name={`settings-email-change-otp-${index}`}
                  maxLength={1}
                  value={digit}
                  aria-label={t("auth.otp.digitAriaLabel", { n: index + 1, total: OTP_LENGTH })}
                  className={otpCellClassName}
                  onChange={(event) => handleCellChange(index, event.target.value)}
                  onKeyDown={(event) => handleKeyDown(index, event)}
                  onPaste={index === 0 ? handlePaste : undefined}
                />
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={(event) => {
                event.preventDefault();
                setStep("email");
                setError(null);
                setAttemptsHint(null);
              }}
            >
              {t("web.settingsPopup.emailChange.back")}
            </Button>
            <Button type="submit" disabled={submitting || digits.join("").length !== OTP_LENGTH}>
              {t("web.settingsPopup.emailChange.confirm")}
            </Button>
          </div>
        </form>
      )}
    </Popup>
  );
}
