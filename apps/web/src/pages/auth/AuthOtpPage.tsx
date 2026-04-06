import {
  useCallback,
  useRef,
  useState,
  type ClipboardEvent,
  type FormEvent,
  type KeyboardEvent,
  type SVGProps,
} from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Button, Input } from "@okkey/ui";

import AppShellLayout from "../../components/app-shell/AppShellLayout";
import OkkeyLogoMark from "../../components/app-shell/OkkeyLogoMark";
import { useLocale } from "../../locale/LocaleContext";

const OTP_LENGTH = 6;

const otpCellClassName =
  "h-[54px] w-[54px] min-w-[54px] max-w-[54px] shrink-0 p-0 text-center text-lg font-semibold tabular-nums";

function ResendIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden {...props}>
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3 3v5h5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function AuthOtpPage() {
  const { t } = useLocale();
  const [searchParams] = useSearchParams();
  const email = searchParams.get("email") ?? "alexzorin@okkey.app";

  const [digits, setDigits] = useState<string[]>(() => Array.from({ length: OTP_LENGTH }, () => ""));
  const inputsRef = useRef<(HTMLInputElement | null)[]>([]);

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

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
  }

  function handleResend() {
    // Stub: hook up to resend API later
  }

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
        <div className="flex w-full flex-col gap-3">
          <div className="flex w-full items-center gap-2">
            <span id="auth-otp-label" className="min-w-0 flex-1 okkey-small font-medium text-copy-primary">
              {t("auth.otp.labelConfirmationCode")}
            </span>
            <Button type="button" variant="outline" size="sm" className="shrink-0 gap-1.5" onClick={handleResend}>
              <ResendIcon className="size-4" />
              {t("auth.otp.sendAgain")}
            </Button>
          </div>
          <div
            role="group"
            aria-labelledby="auth-otp-label"
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
        <Button type="submit" variant="default" className="w-full">
          {t("auth.otp.submit")}
        </Button>
        <p className="text-center">
          <Link
            to="/auth/email"
            className="okkey-small text-copy-secondary underline decoration-solid underline-offset-2 hover:text-copy-primary"
          >
            {t("auth.otp.differentEmail")}
          </Link>
        </p>
      </form>
    </AppShellLayout>
  );
}
