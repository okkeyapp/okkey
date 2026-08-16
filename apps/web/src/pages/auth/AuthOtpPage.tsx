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
import { useNavigate } from "react-router-dom";
import { ApiRequestError } from "@okkey/api";
import { Alert, AlertDescription, AlertTitle, Button, Input } from "@okkey/ui";

import AppShellLayout from "../../components/app-shell/AppShellLayout";
import OkkeyLogoMark from "../../components/app-shell/OkkeyLogoMark";
import { createAuthenticatedCoreClient } from "../../api/client";
import { useAuthVault } from "../../auth/AuthVaultContext";
import { clearPendingVaultBundle } from "../../auth/localVaultBundle";
import { consumeCapsuleReturnUrl } from "../../auth/capsuleReturnUrl";
import { navigateAfterSession } from "../../auth/redirectAfterLogin";
import { useLocale } from "../../locale/LocaleContext";
import { ACCOUNT_NEW_PATH, AUTH_EMAIL_PATH, AUTH_TWO_FACTOR_PATH } from "../../routes/paths";

const OTP_LENGTH = 6;

const otpCellClassName =
  "h-[54px] w-full min-w-0 p-0 text-center text-lg font-semibold tabular-nums";

function ResendIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden {...props}>
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3 3v5h5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function AuthOtpPage() {
  const { t, locale } = useLocale();
  const navigate = useNavigate();
  const {
    authClient,
    emailChallengeId,
    pendingEmail,
    setEmailChallenge,
    setRegistrationAuthStateId,
    setTwoFactorAuthStateId,
    applyAccessTokenResponse,
    emailResendAvailableAt,
    clearEmailLoginFlow,
  } = useAuthVault();

  const email = pendingEmail ?? "";
  const [digits, setDigits] = useState<string[]>(() => Array.from({ length: OTP_LENGTH }, () => ""));
  const inputsRef = useRef<(HTMLInputElement | null)[]>([]);
  const autoSubmitEnabledRef = useRef(true);
  const submitInFlightRef = useRef(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [attemptsHint, setAttemptsHint] = useState<string | null>(null);
  const [resendUntil, setResendUntil] = useState<number>(0);
  const [resendTick, setResendTick] = useState(0);

  useEffect(() => {
    if (!emailChallengeId || !email) {
      navigate(AUTH_EMAIL_PATH, { replace: true });
    }
  }, [emailChallengeId, email, navigate]);

  useEffect(() => {
    if (emailResendAvailableAt) {
      const t = Date.parse(emailResendAvailableAt);
      if (Number.isFinite(t)) {
        setResendUntil(t);
      }
    }
  }, [emailResendAvailableAt]);

  useEffect(() => {
    if (resendUntil <= Date.now()) {
      return;
    }
    const id = window.setInterval(() => setResendTick((x) => x + 1), 1000);
    return () => window.clearInterval(id);
  }, [resendUntil, resendTick]);

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
          setDigits(() => {
            const next = Array.from({ length: OTP_LENGTH }, (_, i) => pasted[i] ?? "");
            return next;
          });
          const focusIndex = Math.min(pasted.length, OTP_LENGTH - 1);
          inputsRef.current[focusIndex]?.focus();
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
    setDigits(() => {
      const next = Array.from({ length: OTP_LENGTH }, (_, i) => text[i] ?? "");
      return next;
    });
    const focusIndex = Math.min(text.length, OTP_LENGTH - 1);
    inputsRef.current[focusIndex]?.focus();
  }, []);

  const submitCode = useCallback(async () => {
    if (!emailChallengeId || submitInFlightRef.current) {
      return;
    }
    const code = digits.join("");
    if (code.length !== OTP_LENGTH) {
      return;
    }
    submitInFlightRef.current = true;
    setSubmitting(true);
    setFormError(null);
    setAttemptsHint(null);
    try {
      const res = await authClient.confirmEmailCode(emailChallengeId, code);
      if (res.nextStep === "registration") {
        setRegistrationAuthStateId(res.authStateId);
        navigate(ACCOUNT_NEW_PATH, { replace: true });
        return;
      }
      if (res.nextStep === "two_factor") {
        setTwoFactorAuthStateId(res.authStateId);
        navigate(AUTH_TWO_FACTOR_PATH, { replace: true });
        return;
      }
      const dto = await authClient.completeLoginAfterEmailConfirm(res.authStateId, res.nextStep);
      applyAccessTokenResponse(dto);
      clearPendingVaultBundle();
      const capsuleReturnUrl = consumeCapsuleReturnUrl();
      if (capsuleReturnUrl) {
        navigate(capsuleReturnUrl, { replace: true });
        return;
      }
      const core = createAuthenticatedCoreClient(dto.access_token);
      await navigateAfterSession(core, navigate);
    } catch (err) {
      if (err instanceof ApiRequestError) {
        const left = err.body.details?.attemptsLeft;
        if (typeof left === "number" && left >= 0) {
          setAttemptsHint(t("auth.otp.attemptsLeft", { n: String(left) }));
        }
        if (err.body.error === "AUTH_CODE_INVALID") {
          setFormError(t("auth.otp.errorInvalid"));
        } else {
          setFormError(t("auth.email.errorGeneric"));
        }
      } else {
        setFormError(t("auth.email.errorGeneric"));
      }
    } finally {
      submitInFlightRef.current = false;
      setSubmitting(false);
    }
  }, [
    applyAccessTokenResponse,
    authClient,
    digits,
    emailChallengeId,
    navigate,
    setRegistrationAuthStateId,
    setTwoFactorAuthStateId,
    t,
  ]);

  useEffect(() => {
    if (!autoSubmitEnabledRef.current) {
      return;
    }
    if (digits.join("").length !== OTP_LENGTH || submitting) {
      return;
    }
    autoSubmitEnabledRef.current = false;
    void submitCode();
  }, [digits, submitting, submitCode]);

  const handleSubmit = useCallback(
    (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      autoSubmitEnabledRef.current = false;
      void submitCode();
    },
    [submitCode],
  );

  async function handleResend() {
    if (!emailChallengeId) {
      return;
    }
    const waitMs = resendUntil - Date.now();
    if (waitMs > 0) {
      setFormError(String(Math.ceil(waitMs / 1000)));
      return;
    }
    setFormError(null);
    try {
      const out = await authClient.resendEmailCode(emailChallengeId, locale);
      setResendUntil(Date.parse(out.resendAvailableAt));
      setEmailChallenge(email, out.challengeId, out.resendAvailableAt);
    } catch (err) {
      if (err instanceof ApiRequestError) {
        const retry = err.body.details?.retryAfterSeconds;
        if (typeof retry === "number") {
          setFormError(String(retry));
          setResendUntil(Date.now() + retry * 1000);
        } else {
          setFormError(t("auth.email.errorGeneric"));
        }
      } else {
        setFormError(t("auth.email.errorGeneric"));
      }
    }
  }

  const resendWaitSec =
    resendUntil > Date.now() ? Math.max(1, Math.ceil((resendUntil - Date.now()) / 1000)) : 0;
  const resendDisabled = resendWaitSec > 0;

  return (
    <AppShellLayout
      title={t("auth.otp.title")}
      description={
        <>
          {t("auth.otp.descriptionBeforeEmail")}{" "}
          <span className="font-semibold">{email}</span>
        </>
      }
      logo={<OkkeyLogoMark className="h-[60px] w-[61px]" />}
    >
      <form onSubmit={handleSubmit} className="flex w-full flex-col gap-6" noValidate>
        {formError ? (
          <Alert variant="error">
            <AlertTitle>{t("unlock.errorTitle")}</AlertTitle>
            <AlertDescription>
              {formError}
              {attemptsHint ? <span className="mt-1 block">{attemptsHint}</span> : null}
            </AlertDescription>
          </Alert>
        ) : null}
        <div className="flex w-full flex-col gap-3">
          <div className="flex w-full items-center gap-2">
            <span id="auth-otp-label" className="min-w-0 flex-1 okkey-small font-medium text-copy-primary">
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
              {resendDisabled ? (
                <span className="min-w-[1.5ch] tabular-nums">{resendWaitSec}</span>
              ) : (
                t("auth.otp.sendAgain")
              )}
            </Button>
          </div>
          <div
            role="group"
            aria-labelledby="auth-otp-label"
            className="grid w-full grid-cols-6 gap-2.5"
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
                name={`otp-${index}`}
                maxLength={1}
                value={digit}
                aria-label={t("auth.otp.digitAriaLabel", { n: index + 1, total: OTP_LENGTH })}
                className={otpCellClassName}
                onChange={(e) => handleCellChange(index, e.target.value)}
                onKeyDown={(e) => handleKeyDown(index, e)}
                onPaste={index === 0 ? handlePaste : undefined}
              />
            ))}
          </div>
        </div>
        <Button type="submit" variant="default" className="w-full" disabled={submitting}>
          {t("auth.otp.submit")}
        </Button>
        <p className="text-center">
          <button
            type="button"
            className="okkey-small text-copy-secondary underline decoration-solid underline-offset-2 hover:text-copy-primary"
            onClick={() => {
              clearEmailLoginFlow();
              navigate(AUTH_EMAIL_PATH, { replace: true });
            }}
          >
            {t("auth.otp.differentEmail")}
          </button>
        </p>
      </form>
    </AppShellLayout>
  );
}
