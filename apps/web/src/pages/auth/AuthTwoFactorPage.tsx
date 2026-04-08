import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ApiRequestError } from "@okkey/api";
import { Alert, AlertDescription, AlertTitle, Button, Input } from "@okkey/ui";

import AppShellLayout from "../../components/app-shell/AppShellLayout";
import OkkeyLogoMark from "../../components/app-shell/OkkeyLogoMark";
import { createAuthenticatedCoreClient } from "../../api/client";
import { useAuthVault } from "../../auth/AuthVaultContext";
import { clearPendingVaultBundle } from "../../auth/localVaultBundle";
import { navigateAfterSession } from "../../auth/redirectAfterLogin";
import { useLocale } from "../../locale/LocaleContext";

export default function AuthTwoFactorPage() {
  const { t } = useLocale();
  const navigate = useNavigate();
  const { authClient, twoFactorAuthStateId, applyAccessTokenResponse } = useAuthVault();
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!twoFactorAuthStateId?.trim()) {
      navigate("/auth/email", { replace: true });
    }
  }, [twoFactorAuthStateId, navigate]);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!twoFactorAuthStateId?.trim()) {
      navigate("/auth/email", { replace: true });
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const trimmed = code.trim();
      const dto = await authClient.verifyTwoFactor(twoFactorAuthStateId, trimmed);
      applyAccessTokenResponse(dto);
      clearPendingVaultBundle();
      const core = createAuthenticatedCoreClient(dto.access_token);
      await navigateAfterSession(core, navigate);
    } catch (err) {
      if (err instanceof ApiRequestError) {
        setError(t("auth.twoFactor.errorGeneric"));
      } else {
        setError(t("auth.twoFactor.errorGeneric"));
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AppShellLayout
      title={t("auth.twoFactor.title")}
      description={t("auth.twoFactor.description")}
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
          <label htmlFor="auth-2fa-code" className="okkey-small font-medium text-copy-primary">
            {t("auth.twoFactor.label")}
          </label>
          <Input
            id="auth-2fa-code"
            name="totp"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\s/g, ""))}
          />
        </div>
        <Button type="submit" variant="default" className="w-full" disabled={submitting || code.trim().length < 6}>
          {t("auth.twoFactor.submit")}
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
