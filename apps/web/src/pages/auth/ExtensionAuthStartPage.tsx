import { Alert, AlertDescription, AlertTitle, Button, Spinner } from "@okkey/ui";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import AppShellLayout from "../../components/app-shell/AppShellLayout";
import OkkeyLogoMark from "../../components/app-shell/OkkeyLogoMark";
import { useAuthVault } from "../../auth/AuthVaultContext";
import { completeExtensionAuthHandoffIfPending } from "../../auth/completeExtensionAuthHandoff";
import {
  clearExtensionAuthPending,
  writeExtensionAuthPending,
} from "../../auth/extensionAuthPendingStorage";
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
        setError("Invalid client_id. Open login from the Okkey extension.");
        setBusy(false);
        return;
      }
      if (!params.state || params.state.length < 8) {
        setError("Missing or invalid state.");
        setBusy(false);
        return;
      }
      if (!params.codeChallenge || params.method !== "S256") {
        setError("PKCE code_challenge (S256) is required.");
        setBusy(false);
        return;
      }
      if (!isExtensionRedirectUri(params.redirectUri)) {
        setError("redirect_uri must be an extension callback URL.");
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

      if (!accessToken) {
        if (!cancelled) {
          setBusy(false);
          navigate(AUTH_EMAIL_PATH, { replace: true });
        }
        return;
      }

      const handedOff = await completeExtensionAuthHandoffIfPending();
      if (!handedOff && !cancelled) {
        setError("Could not complete extension sign-in. Try again from the extension.");
        setBusy(false);
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [accessToken, navigate, params]);

  return (
    <AppShellLayout
      title="Extension sign-in"
      description="Connecting your Okkey session to the browser extension. Vault unlock stays in the extension."
      logo={<OkkeyLogoMark className="h-[60px] w-[61px]" />}
      contentClassName="max-w-lg"
    >
      <div className="flex w-full flex-col gap-4">
        {busy && !error ? (
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <Spinner className="size-5" />
            Preparing secure handoff…
          </div>
        ) : null}
        {error ? (
          <Alert variant="destructive">
            <AlertTitle>Sign-in could not continue</AlertTitle>
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
              Back to sign-in
            </Button>
            <Button type="button" variant="ghost" asChild>
              <Link to={AUTH_EMAIL_PATH}>Open email login</Link>
            </Button>
          </div>
        ) : null}
      </div>
    </AppShellLayout>
  );
}
