import { useEffect, useState } from "react";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  AuthShell,
  OkkeyLogoMark,
  Spinner,
} from "@okkey/ui";
import { formatWebMessage, type WebLocale } from "@okkey/i18n";

import { exchangeExtensionAuthCode } from "../../lib/api";
import {
  clearPkcePending,
  readPkcePending,
  writeProfile,
  writeSession,
} from "../../lib/storage";

const LOCALE_STORAGE_KEY = "okkey.extension.locale";

function readStoredLocale(): WebLocale {
  try {
    const raw = localStorage.getItem(LOCALE_STORAGE_KEY);
    if (raw === "en" || raw === "ru") {
      return raw;
    }
  } catch {
    // ignore
  }
  return "ru";
}

/**
 * Receives `?code=&state=` from web after PKCE login and exchanges for a Bearer session.
 */
export function AuthCallbackApp() {
  const [status, setStatus] = useState<"working" | "ok" | "error">("working");
  const [message, setMessage] = useState("Completing sign-in…");
  const locale = readStoredLocale();
  const copyright = formatWebMessage(locale, "web.shell.copyright", {
    year: new Date().getFullYear(),
  });

  useEffect(() => {
    let cancelled = false;
    async function run(): Promise<void> {
      try {
        const params = new URLSearchParams(window.location.search);
        const code = params.get("code")?.trim() ?? "";
        const state = params.get("state")?.trim() ?? "";
        if (!code || !state) {
          throw new Error("Missing code or state in callback URL.");
        }
        const pending = await readPkcePending();
        if (!pending) {
          throw new Error("No pending sign-in in this extension. Start again from the popup.");
        }
        if (pending.state !== state) {
          throw new Error("State mismatch — possible CSRF. Start sign-in again.");
        }

        const session = await exchangeExtensionAuthCode({
          apiBaseUrl: pending.apiBaseUrl,
          redirectUri: pending.redirectUri,
          code,
          codeVerifier: pending.codeVerifier,
        });
        await writeSession(session);
        await writeProfile({
          webBaseUrl: pending.webBaseUrl,
          apiBaseUrl: pending.apiBaseUrl,
          updatedAt: Date.now(),
        });
        await clearPkcePending();

        if (!cancelled) {
          setStatus("ok");
          setMessage("Signed in. You can close this tab and open the Okkey extension popup.");
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setStatus("error");
          setMessage(err instanceof Error ? err.message : String(err));
        }
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <AuthShell
      logo={<OkkeyLogoMark className="h-[60px] w-[61px]" />}
      title="Okkey extension"
      description={status === "working" ? message : undefined}
      copyright={copyright}
      contentClassName="max-w-md"
    >
      {status === "working" ? (
        <div className="flex flex-col items-center gap-3 py-4" role="status" aria-busy="true">
          <Spinner />
        </div>
      ) : null}
      {status === "ok" ? (
        <Alert>
          <AlertTitle>Session ready</AlertTitle>
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      ) : null}
      {status === "error" ? (
        <Alert variant="error">
          <AlertTitle>Sign-in failed</AlertTitle>
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      ) : null}
    </AuthShell>
  );
}
