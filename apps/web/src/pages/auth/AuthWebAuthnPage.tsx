import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import type { PrimaryLoginMethod, WebAuthnAuthenticatorAttachment } from "@okkey/types";
import { Alert, AlertDescription, AlertTitle, Button } from "@okkey/ui";
import {
  startAuthentication,
  type PublicKeyCredentialRequestOptionsJSON,
} from "@simplewebauthn/browser";

import AppShellLayout from "../../components/app-shell/AppShellLayout";
import OkkeyLogoMark from "../../components/app-shell/OkkeyLogoMark";
import { createAuthenticatedCoreClient } from "../../api/client";
import { useAuthVault } from "../../auth/AuthVaultContext";
import { clearPendingVaultBundle } from "../../auth/localVaultBundle";
import { consumeCapsuleReturnUrl } from "../../auth/capsuleReturnUrl";
import { completeExtensionAuthHandoffIfPending } from "../../auth/completeExtensionAuthHandoff";
import {
  clearPendingLoginDiscover,
  readPendingLoginDiscover,
  writeLastLoginMethodHint,
  writePendingLoginDiscover,
} from "../../auth/loginMethodStorage";
import { navigateAfterSession } from "../../auth/redirectAfterLogin";
import {
  accountWebAuthnErrorMessageKey,
  getAccountWebAuthnCapability,
  mapAccountWebAuthnError,
} from "../../auth/accountWebAuthnCapability";
import { useLocale } from "../../locale/LocaleContext";
import {
  AUTH_EMAIL_PATH,
  AUTH_OTP_PATH,
  AUTH_TWO_FACTOR_PATH,
  AUTH_WEBAUTHN_PATH,
} from "../../routes/paths";

function methodToAttachment(method: PrimaryLoginMethod): WebAuthnAuthenticatorAttachment | null {
  if (method === "passkey") {
    return "platform";
  }
  if (method === "hardware_key") {
    return "cross-platform";
  }
  return null;
}

function methodLabel(
  t: (key: string) => string,
  method: PrimaryLoginMethod,
): string {
  switch (method) {
    case "passkey":
      return t("auth.webauthn.method.passkey");
    case "hardware_key":
      return t("auth.webauthn.method.hardware");
    default:
      return t("auth.webauthn.method.email");
  }
}

export default function AuthWebAuthnPage() {
  const { t, locale } = useLocale();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const {
    authClient,
    updateLocalProfile,
    setEmailChallenge,
    setTwoFactorAuthStateId,
    applyAccessTokenResponse,
  } = useAuthVault();

  const [pending, setPending] = useState(() => readPendingLoginDiscover());
  const methodParam = searchParams.get("method");
  const activeMethod: PrimaryLoginMethod =
    methodParam === "passkey" || methodParam === "hardware_key" || methodParam === "email"
      ? methodParam
      : (pending?.primary ?? "passkey");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showFallback, setShowFallback] = useState(false);
  const autoStartedFor = useRef<string | null>(null);

  useEffect(() => {
    setPending(readPendingLoginDiscover());
  }, [searchParams]);

  useEffect(() => {
    if (!pending?.email) {
      navigate(AUTH_EMAIL_PATH, { replace: true });
    }
  }, [pending, navigate]);

  const finishWithAuthState = useCallback(
    async (authStateId: string, nextStep: "device_check" | "two_factor", used: PrimaryLoginMethod) => {
      if (nextStep === "two_factor") {
        setTwoFactorAuthStateId(authStateId);
        writeLastLoginMethodHint({ email: pending!.email, primary: used });
        clearPendingLoginDiscover();
        navigate(AUTH_TWO_FACTOR_PATH, { replace: true });
        return;
      }
      const dto = await authClient.completeLoginAfterEmailConfirm(authStateId, nextStep);
      applyAccessTokenResponse(dto);
      writeLastLoginMethodHint({ email: pending!.email, primary: used });
      clearPendingLoginDiscover();
      clearPendingVaultBundle();
      if (await completeExtensionAuthHandoffIfPending()) {
        return;
      }
      const capsuleReturnUrl = consumeCapsuleReturnUrl();
      if (capsuleReturnUrl) {
        navigate(capsuleReturnUrl, { replace: true });
        return;
      }
      const core = createAuthenticatedCoreClient(dto.access_token);
      await navigateAfterSession(core, navigate);
    },
    [authClient, applyAccessTokenResponse, navigate, pending, setTwoFactorAuthStateId],
  );

  const runWebAuthn = useCallback(async () => {
    if (!pending?.email) {
      return;
    }
    const attachment = methodToAttachment(activeMethod);
    if (!attachment) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const capability = await getAccountWebAuthnCapability(attachment);
      if (capability.status !== "ready") {
        setError(t(accountWebAuthnErrorMessageKey(capability.code)));
        setShowFallback(true);
        return;
      }
      const { challengeId, options } = await authClient.webauthnLoginOptions({
        email: pending.email,
        attachment,
      });
      const assertion = await startAuthentication({
        optionsJSON: options as unknown as PublicKeyCredentialRequestOptionsJSON,
      });
      const res = await authClient.webauthnLoginVerify({
        challengeId,
        response: assertion as unknown as Record<string, unknown>,
      });
      await finishWithAuthState(res.authStateId, res.nextStep, activeMethod);
    } catch (err) {
      setError(t(accountWebAuthnErrorMessageKey(mapAccountWebAuthnError(err))));
      setShowFallback(true);
    } finally {
      setBusy(false);
    }
  }, [activeMethod, authClient, finishWithAuthState, pending, t]);

  useEffect(() => {
    if (!pending?.email) {
      return;
    }
    if (activeMethod === "email") {
      return;
    }
    const key = `${pending.email}:${activeMethod}`;
    if (autoStartedFor.current === key) {
      return;
    }
    autoStartedFor.current = key;
    void runWebAuthn();
  }, [activeMethod, pending?.email, runWebAuthn]);

  async function switchToEmail() {
    if (!pending?.email) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const start = await authClient.startEmailLogin(pending.email, locale);
      updateLocalProfile({ email: pending.email });
      setEmailChallenge(pending.email, start.challengeId, start.resendAvailableAt);
      writePendingLoginDiscover({ ...pending, primary: "email" });
      writeLastLoginMethodHint({ email: pending.email, primary: "email" });
      navigate(AUTH_OTP_PATH, { replace: true });
    } catch {
      setError(t("auth.email.errorGeneric"));
    } finally {
      setBusy(false);
    }
  }

  function switchMethod(method: PrimaryLoginMethod) {
    if (!pending) {
      return;
    }
    if (method === "email") {
      void switchToEmail();
      return;
    }
    writePendingLoginDiscover({ ...pending, primary: method });
    setShowFallback(false);
    setError(null);
    navigate(`${AUTH_WEBAUTHN_PATH}?method=${method}`, { replace: true });
  }

  const title =
    activeMethod === "hardware_key"
      ? t("auth.webauthn.title.hardware")
      : t("auth.webauthn.title.passkey");
  const description =
    activeMethod === "hardware_key"
      ? t("auth.webauthn.description.hardware")
      : t("auth.webauthn.description.passkey");

  const fallbackMethods = (pending?.methods ?? ["email"]).filter((m) => m !== activeMethod);

  return (
    <AppShellLayout
      title={title}
      description={description}
      logo={<OkkeyLogoMark className="h-[60px] w-[61px]" />}
    >
      <div className="flex w-full flex-col gap-6">
        {error ? (
          <Alert variant="error">
            <AlertTitle>{t("unlock.errorTitle")}</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <p className="text-sm text-muted-foreground">{pending?.email}</p>

        <Button type="button" className="w-full" disabled={busy} onClick={() => void runWebAuthn()}>
          {busy ? t("auth.webauthn.waiting") : t("auth.webauthn.retry")}
        </Button>

        {showFallback || fallbackMethods.length > 0 ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm font-medium text-foreground">{t("auth.webauthn.otherMethods")}</p>
            <div className="flex flex-col gap-2">
              {fallbackMethods.map((method) => (
                <Button
                  key={method}
                  type="button"
                  variant="secondary"
                  className="w-full font-normal"
                  disabled={busy}
                  onClick={() => switchMethod(method)}
                >
                  {methodLabel(t, method)}
                </Button>
              ))}
            </div>
          </div>
        ) : null}

        <p className="text-center text-sm text-muted-foreground">
          <Link to={AUTH_EMAIL_PATH} className="underline-offset-4 hover:underline">
            {t("auth.webauthn.backToEmail")}
          </Link>
        </p>
      </div>
    </AppShellLayout>
  );
}
