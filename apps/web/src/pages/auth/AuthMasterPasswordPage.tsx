import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ApiRequestError } from "@okkey/api";
import { deriveLoginKey, initCrypto, wipeBytes } from "@okkey/crypto";
import type { AccessTokenResponseDto } from "@okkey/types";
import { Alert, AlertDescription, AlertTitle, Button, Input } from "@okkey/ui";

import AppShellLayout from "../../components/app-shell/AppShellLayout";
import OkkeyLogoMark from "../../components/app-shell/OkkeyLogoMark";
import { createAuthenticatedCoreClient } from "../../api/client";
import { useAuthVault } from "../../auth/AuthVaultContext";
import { bytesToBase64 } from "../../auth/base64";
import { clearPendingVaultBundle } from "../../auth/localVaultBundle";
import { consumeCapsuleReturnUrl } from "../../auth/capsuleReturnUrl";
import { completeExtensionAuthHandoffIfPending } from "../../auth/completeExtensionAuthHandoff";
import { navigateAfterSession } from "../../auth/redirectAfterLogin";
import { writeLastLoginMethodHint } from "../../auth/loginMethodStorage";
import { useLocale } from "../../locale/LocaleContext";
import { AUTH_EMAIL_PATH, AUTH_OTP_PATH, AUTH_TWO_FACTOR_PATH, ITEMS_PATH } from "../../routes/paths";
import { SETTINGS_POPUP_ID, buildPopupQueryValue, popupQuerySearch } from "../../routes/popupQuery";

function loginErrorKey(err: unknown): string {
  if (err instanceof ApiRequestError) {
    if (err.body.error === "AUTH_RATE_LIMITED") {
      return "auth.masterPassword.errorRateLimited";
    }
    if (err.body.error === "AUTH_EMAIL_CODE_REQUIRED") {
      return "auth.masterPassword.errorUseEmailCode";
    }
  }
  return "auth.masterPassword.errorFailed";
}

export default function AuthMasterPasswordPage() {
  const { t } = useLocale();
  const navigate = useNavigate();
  const {
    authClient,
    pendingEmail,
    emailChallengeId,
    setTwoFactorAuthStateId,
    applyAccessTokenResponse,
  } = useAuthVault();
  const email = pendingEmail ?? "";
  const [masterPassword, setMasterPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingSession, setPendingSession] = useState<AccessTokenResponseDto | null>(null);

  useEffect(() => {
    if (!email || !emailChallengeId) {
      navigate(AUTH_EMAIL_PATH, { replace: true });
    }
  }, [email, emailChallengeId, navigate]);

  async function finishSession(openTwoFactor: boolean) {
    if (!pendingSession) {
      return;
    }
    applyAccessTokenResponse(pendingSession);
    writeLastLoginMethodHint({ email, primary: "email" });
    clearPendingVaultBundle();
    if (await completeExtensionAuthHandoffIfPending()) {
      return;
    }
    if (openTwoFactor) {
      const search = popupQuerySearch("", buildPopupQueryValue(SETTINGS_POPUP_ID, "twoFactor"));
      navigate(`${ITEMS_PATH}${search}`, { replace: true });
      return;
    }
    const capsuleReturnUrl = consumeCapsuleReturnUrl();
    if (capsuleReturnUrl) {
      navigate(capsuleReturnUrl, { replace: true });
      return;
    }
    const core = createAuthenticatedCoreClient(pendingSession.access_token);
    await navigateAfterSession(core, navigate);
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!masterPassword || submitting) {
      return;
    }
    setSubmitting(true);
    setError(null);
    const pwd = new TextEncoder().encode(masterPassword);
    let loginKey: Uint8Array | null = null;
    try {
      await initCrypto();
      loginKey = await deriveLoginKey({ masterPasswordUtf8: pwd, email });
      const loginKeyB64 = bytesToBase64(loginKey);
      const res = await authClient.loginWithMasterPassword({
        email,
        loginKey: loginKeyB64,
      });
      if (res.nextStep === "two_factor") {
        setTwoFactorAuthStateId(res.authStateId);
        writeLastLoginMethodHint({ email, primary: "email" });
        navigate(AUTH_TWO_FACTOR_PATH, { replace: true });
        return;
      }
      const dto = await authClient.completeLoginAfterEmailConfirm(res.authStateId, res.nextStep);
      setMasterPassword("");
      setPendingSession(dto);
    } catch (err) {
      setError(t(loginErrorKey(err)));
    } finally {
      wipeBytes(pwd);
      if (loginKey) {
        wipeBytes(loginKey);
      }
      setSubmitting(false);
    }
  }

  if (pendingSession) {
    return (
      <AppShellLayout
        title={t("auth.masterPassword.totpOfferTitle")}
        description={t("auth.masterPassword.totpOfferBody")}
        logo={<OkkeyLogoMark className="h-[60px] w-[61px]" />}
      >
        <div className="flex w-full flex-col gap-3">
          <Button type="button" variant="default" className="w-full" onClick={() => void finishSession(true)}>
            {t("auth.masterPassword.totpOfferEnable")}
          </Button>
          <Button type="button" variant="secondary" className="w-full" onClick={() => void finishSession(false)}>
            {t("auth.masterPassword.totpOfferSkip")}
          </Button>
        </div>
      </AppShellLayout>
    );
  }

  return (
    <AppShellLayout
      title={t("auth.masterPassword.title")}
      description={t("auth.masterPassword.description")}
      logo={<OkkeyLogoMark className="h-[60px] w-[61px]" />}
    >
      <form onSubmit={handleSubmit} className="flex w-full flex-col gap-6" noValidate>
        {error ? (
          <Alert variant="error">
            <AlertTitle>{t("unlock.errorTitle")}</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        <p className="okkey-small text-copy-secondary">{email}</p>
        <div className="flex w-full flex-col gap-3">
          <label htmlFor="auth-master-password" className="okkey-small font-medium text-copy-primary">
            {t("auth.masterPassword.label")}
          </label>
          <Input
            id="auth-master-password"
            name="master-password"
            type="password"
            autoComplete="current-password"
            value={masterPassword}
            onChange={(event) => setMasterPassword(event.target.value)}
          />
        </div>
        <Button
          type="submit"
          variant="default"
          className="w-full"
          disabled={submitting || masterPassword.length === 0}
        >
          {t("auth.masterPassword.submit")}
        </Button>
        <p className="text-center text-xs leading-4 text-copy-secondary">
          <Link
            to={AUTH_OTP_PATH}
            className="text-copy-secondary underline decoration-solid underline-offset-2 hover:text-copy-primary"
          >
            {t("auth.masterPassword.useEmailCode")}
          </Link>
        </p>
      </form>
    </AppShellLayout>
  );
}
