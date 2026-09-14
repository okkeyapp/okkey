import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ApiRequestError } from "@okkey/api";
import { Alert, AlertDescription, AlertTitle, Button, Input } from "@okkey/ui";

import AppShellLayout from "../../components/app-shell/AppShellLayout";
import OkkeyLogoMark from "../../components/app-shell/OkkeyLogoMark";
import {
  SixDigitCodeInput,
  TOTP_CODE_LENGTH,
} from "../../components/settings/SixDigitCodeInput";
import { createAuthenticatedCoreClient } from "../../api/client";
import { useAuthVault } from "../../auth/AuthVaultContext";
import { clearPendingVaultBundle } from "../../auth/localVaultBundle";
import { consumeCapsuleReturnUrl } from "../../auth/capsuleReturnUrl";
import { navigateAfterSession } from "../../auth/redirectAfterLogin";
import { useLocale } from "../../locale/LocaleContext";
import { AUTH_EMAIL_PATH } from "../../routes/paths";

type CodeMode = "totp" | "backup";

function normalizeBackupCodeInput(raw: string): string {
  return raw.toUpperCase().replace(/[^A-F0-9]/g, "");
}

export default function AuthTwoFactorPage() {
  const { t } = useLocale();
  const navigate = useNavigate();
  const { authClient, twoFactorAuthStateId, applyAccessTokenResponse } = useAuthVault();
  const [mode, setMode] = useState<CodeMode>("totp");
  const [totpCode, setTotpCode] = useState("");
  const [backupCode, setBackupCode] = useState("");
  const [otpResetKey, setOtpResetKey] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const autoSubmitEnabledRef = useRef(true);
  const submitInFlightRef = useRef(false);

  useEffect(() => {
    if (!twoFactorAuthStateId?.trim()) {
      navigate(AUTH_EMAIL_PATH, { replace: true });
    }
  }, [twoFactorAuthStateId, navigate]);

  const submitCode = useCallback(
    async (code: string) => {
      if (!twoFactorAuthStateId?.trim() || submitInFlightRef.current) {
        return;
      }
      const trimmed = code.trim();
      if (!trimmed) {
        return;
      }
      submitInFlightRef.current = true;
      setSubmitting(true);
      setError(null);
      try {
        const dto = await authClient.verifyTwoFactor(twoFactorAuthStateId, trimmed);
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
        autoSubmitEnabledRef.current = false;
        if (err instanceof ApiRequestError) {
          setError(t("auth.twoFactor.errorGeneric"));
        } else {
          setError(t("auth.twoFactor.errorGeneric"));
        }
        if (mode === "totp") {
          setOtpResetKey((value) => value + 1);
          setTotpCode("");
        }
      } finally {
        submitInFlightRef.current = false;
        setSubmitting(false);
      }
    },
    [applyAccessTokenResponse, authClient, mode, navigate, t, twoFactorAuthStateId],
  );

  const handleTotpComplete = useCallback(
    (code: string) => {
      if (!autoSubmitEnabledRef.current || submitting) {
        return;
      }
      autoSubmitEnabledRef.current = false;
      void submitCode(code);
    },
    [submitCode, submitting],
  );

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    autoSubmitEnabledRef.current = false;
    if (mode === "totp") {
      void submitCode(totpCode);
      return;
    }
    void submitCode(backupCode);
  }

  function switchMode(next: CodeMode) {
    setMode(next);
    setError(null);
    autoSubmitEnabledRef.current = next === "totp";
    if (next === "totp") {
      setBackupCode("");
      setOtpResetKey((value) => value + 1);
      setTotpCode("");
    } else {
      setTotpCode("");
    }
  }

  const backupNormalizedLength = normalizeBackupCodeInput(backupCode).length;
  const canSubmit =
    mode === "totp"
      ? totpCode.length === TOTP_CODE_LENGTH
      : backupNormalizedLength >= 10;

  return (
    <AppShellLayout
      title={t("auth.twoFactor.title")}
      description={
        mode === "totp"
          ? t("auth.twoFactor.description")
          : t("auth.twoFactor.backupDescription")
      }
      logo={<OkkeyLogoMark className="h-[60px] w-[61px]" />}
    >
      <form onSubmit={handleSubmit} className="flex w-full flex-col gap-6" noValidate>
        {error ? (
          <Alert variant="error">
            <AlertTitle>{t("unlock.errorTitle")}</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        <div className="flex w-full flex-col gap-3">
          <div className="flex items-center gap-2">
            <label
              id="auth-2fa-code-label"
              htmlFor={mode === "backup" ? "auth-2fa-backup-code" : undefined}
              className="min-w-0 flex-1 okkey-small font-medium text-copy-primary"
            >
              {mode === "totp" ? t("auth.twoFactor.label") : t("auth.twoFactor.backupLabel")}
            </label>
            <button
              type="button"
              className="okkey-small shrink-0 text-copy-secondary underline decoration-solid underline-offset-2 hover:text-copy-primary"
              onClick={() => switchMode(mode === "totp" ? "backup" : "totp")}
            >
              {mode === "totp"
                ? t("auth.twoFactor.useBackupCode")
                : t("auth.twoFactor.useAuthenticatorCode")}
            </button>
          </div>
          {mode === "totp" ? (
            <SixDigitCodeInput
              resetKey={otpResetKey}
              disabled={submitting}
              labelledBy="auth-2fa-code-label"
              digitAriaLabel={(n, total) =>
                t("auth.otp.digitAriaLabel", { n: String(n), total: String(total) })
              }
              onChange={setTotpCode}
              onComplete={handleTotpComplete}
            />
          ) : (
            <Input
              id="auth-2fa-backup-code"
              name="backup"
              type="text"
              autoComplete="one-time-code"
              autoCapitalize="characters"
              spellCheck={false}
              value={backupCode}
              disabled={submitting}
              onChange={(e) => setBackupCode(e.target.value)}
              placeholder={t("auth.twoFactor.backupPlaceholder")}
            />
          )}
        </div>
        <Button type="submit" variant="default" className="w-full" disabled={submitting || !canSubmit}>
          {t("auth.twoFactor.submit")}
        </Button>
        <p className="text-center">
          <Link
            to={AUTH_EMAIL_PATH}
            className="okkey-small text-copy-secondary underline decoration-solid underline-offset-2 hover:text-copy-primary"
          >
            {t("auth.otp.differentEmail")}
          </Link>
        </p>
      </form>
    </AppShellLayout>
  );
}
