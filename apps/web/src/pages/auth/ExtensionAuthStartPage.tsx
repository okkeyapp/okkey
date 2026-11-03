import { Alert, AlertDescription, AlertTitle, Button, Spinner } from "@okkey/ui";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import AppShellLayout from "../../components/app-shell/AppShellLayout";
import OkkeyLogoMark from "../../components/app-shell/OkkeyLogoMark";
import { useAuthVault } from "../../auth/AuthVaultContext";
import { completeExtensionAuthHandoffIfPending } from "../../auth/completeExtensionAuthHandoff";
import {
  clearExtensionAuthPending,
  hasExtensionAuthPending,
  writeExtensionAuthPending,
} from "../../auth/extensionAuthPendingStorage";
import { readStoredSession } from "../../auth/sessionAuthStorage";
import { useLocale } from "../../locale/LocaleContext";
import { AUTH_EMAIL_PATH } from "../../routes/paths";

const CLIENT_ID = "okkey_extension";

function isExtensionRedirectUri(uri: string): boolean {
  try {
    const parsed = new URL(uri);
    if (parsed.protocol === "chrome-extension:" || parsed.protocol === "moz-extension:") {
      // Chrome uses the literal host "invalid" when a non-accessible / broken
      // extension URL is blocked — never treat that as a real callback.
      const host = parsed.hostname.trim().toLowerCase();
      if (!host || host === "invalid") {
        return false;
      }
      // Dev / unpacked: accept any real extension id; path must be the callback page.
      return /(?:^|\/)auth-callback\.html$/u.test(parsed.pathname);
    }
    if (parsed.protocol === "https:" && parsed.hostname.endsWith(".chromiumapp.org")) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Entry for extension PKCE session login.
 * Stores challenge params, then either issues auth_code (if already signed in)
 * or sends the user through normal web login — **without** vault unlock.
 */
export default function ExtensionAuthStartPage() {
  const { t } = useLocale();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { accessToken } = useAuthVault();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);

  const params = useMemo(() => {
    const clientId = searchParams.get("client_id")?.trim() ?? "";
    const redirectUri = searchParams.get("redirect_uri")?.trim() ?? "";
    const state = searchParams.get("state")?.trim() ?? "";
    const codeChallenge = searchParams.get("code_challenge")?.trim() ?? "";
    const method = (searchParams.get("code_challenge_method")?.trim() ?? "S256").toUpperCase();
    return { clientId, redirectUri, state, codeChallenge, method };
  }, [searchParams]);

  useEffect(() => {
    let cancelled = false;

    async function run(): Promise<void> {
      setBusy(true);
      setError(null);

      if (params.clientId !== CLIENT_ID) {
        setError(t("auth.extensionStart.errorInvalidClient"));
        setBusy(false);
        return;
      }
      if (!params.state || params.state.length < 8) {
        setError(t("auth.extensionStart.errorInvalidState"));
        setBusy(false);
        return;
      }
      if (!params.codeChallenge || params.method !== "S256") {
        setError(t("auth.extensionStart.errorPkceRequired"));
        setBusy(false);
        return;
      }
      if (!isExtensionRedirectUri(params.redirectUri)) {
        setError(t("auth.extensionStart.errorRedirectUri"));
        setBusy(false);
        return;
      }

      writeExtensionAuthPending({
        clientId: params.clientId,
        redirectUri: params.redirectUri,
        state: params.state,
        codeChallenge: params.codeChallenge,
        codeChallengeMethod: "S256",
      });

      // Prefer storage session so we hand off even if React state is still hydrating.
      const sessionToken = accessToken ?? readStoredSession()?.access_token ?? null;
      if (!sessionToken) {
        if (!cancelled) {
          setBusy(false);
          navigate(AUTH_EMAIL_PATH, { replace: true });
        }
        return;
      }

      const handedOff = await completeExtensionAuthHandoffIfPending();
      if (cancelled) {
        return;
      }
      if (handedOff) {
        return;
      }
      // Another path may have cleared pending while redirecting — stay on spinner.
      if (!hasExtensionAuthPending()) {
        return;
      }
      setError(t("auth.extensionStart.errorGeneric"));
      setBusy(false);
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [accessToken, navigate, params, t]);

  return (
    <AppShellLayout
      title={t("auth.extensionStart.title")}
      description={t("auth.extensionStart.description")}
      logo={<OkkeyLogoMark className="h-[60px] w-[61px]" />}
      contentClassName="max-w-lg"
    >
      <div className="flex w-full flex-col gap-4">
        {busy && !error ? (
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <Spinner className="size-5" />
            {t("auth.extensionStart.preparing")}
          </div>
        ) : null}
        {error ? (
          <Alert variant="destructive">
            <AlertTitle>{t("auth.extensionStart.errorTitle")}</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        {error ? (
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                clearExtensionAuthPending();
                navigate(AUTH_EMAIL_PATH, { replace: true });
              }}
            >
              {t("auth.extensionStart.backToSignIn")}
            </Button>
            <Button type="button" variant="ghost" asChild>
              <Link to={AUTH_EMAIL_PATH}>{t("auth.extensionStart.openEmailLogin")}</Link>
            </Button>
          </div>
        ) : null}
      </div>
    </AppShellLayout>
  );
}
