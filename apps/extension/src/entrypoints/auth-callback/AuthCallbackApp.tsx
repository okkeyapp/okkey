import { useEffect, useMemo, useState } from "react";
import { formatWebMessage, type WebMessageValues } from "@okkey/i18n";
import { AuthShell, OkkeyLogoMark, Spinner } from "@okkey/ui";
import { toast } from "sonner";

import { Toaster } from "../../components/toaster";
import { exchangeExtensionAuthCode } from "../../lib/api";
import { readStoredExtensionLocale } from "../../lib/locale";
import {
  clearPkcePending,
  readPkcePending,
  readSession,
  wipeAllExtensionData,
  writeProfile,
  writeSession,
} from "../../lib/storage";

/**
 * React StrictMode (and rare remounts) can re-run the exchange effect. Auth codes are
 * one-time on the server, so a second exchange would fail with INVALID_CODE after the
 * first already wrote the session. Guard by code across mounts in this JS realm.
 */
const exchangeStartedForCode = new Set<string>();

/**
 * Receives `?code=&state=` from web after PKCE login and exchanges for a Bearer session.
 * Full browser tab — AuthShell without `compact` so content is viewport-centered.
 * Toasts stay in the default (non-centered) corner via Sonner.
 */
export function AuthCallbackApp() {
  const locale = useMemo(() => readStoredExtensionLocale(), []);
  const t = useMemo(
    () => (key: string, values?: WebMessageValues) => formatWebMessage(locale, key, values ?? {}),
    [locale],
  );

  const [status, setStatus] = useState<"working" | "ok" | "error">("working");
  const [message, setMessage] = useState(() => t("extension.authCallback.completing"));

  useEffect(() => {
    document.documentElement.lang = locale;
    document.title = t("extension.authCallback.documentTitle");
  }, [locale, t]);

  useEffect(() => {
    let cancelled = false;

    async function markSignedIn(signedIn: string): Promise<void> {
      if (cancelled) {
        return;
      }
      setStatus("ok");
      setMessage(signedIn);
      toast.success(t("extension.authCallback.sessionReady"), {
        description: signedIn,
      });
    }

    async function run(): Promise<void> {
      try {
        const params = new URLSearchParams(window.location.search);
        const code = params.get("code")?.trim() ?? "";
        const state = params.get("state")?.trim() ?? "";
        if (!code || !state) {
          throw new Error(t("extension.authCallback.errorMissingCode"));
        }

        // Another invocation (StrictMode remount) already owns this code.
        if (exchangeStartedForCode.has(code)) {
          const deadline = Date.now() + 15_000;
          while (Date.now() < deadline) {
            const existing = await readSession();
            if (existing?.access_token) {
              await markSignedIn(t("extension.authCallback.signedIn"));
              return;
            }
            await new Promise((resolve) => window.setTimeout(resolve, 50));
          }
          throw new Error(t("extension.authCallback.signInFailed"));
        }
        exchangeStartedForCode.add(code);

        const pending = await readPkcePending();
        if (!pending) {
          // Owner may have cleared pending after a successful exchange — recover via session.
          const existing = await readSession();
          if (existing?.access_token) {
            await markSignedIn(t("extension.authCallback.signedIn"));
            return;
          }
          throw new Error(t("extension.authCallback.errorNoPending"));
        }
        if (pending.state !== state) {
          throw new Error(t("extension.authCallback.errorStateMismatch"));
        }

        const session = await exchangeExtensionAuthCode({
          apiBaseUrl: pending.apiBaseUrl,
          redirectUri: pending.redirectUri,
          code,
          codeVerifier: pending.codeVerifier,
        });
        // Drop previous account / unlock / pending-save state before binding the new session
        // (covers same-server account switch; keeps lastServer preference).
        await wipeAllExtensionData();
        await writeSession(session);
        await writeProfile({
          webBaseUrl: pending.webBaseUrl,
          apiBaseUrl: pending.apiBaseUrl,
          updatedAt: Date.now(),
        });
        await clearPkcePending();

        await markSignedIn(t("extension.authCallback.signedIn"));
      } catch (err: unknown) {
        if (cancelled) {
          return;
        }
        // Code already spent by the first invocation — treat existing session as success.
        const existing = await readSession();
        if (existing?.access_token) {
          await markSignedIn(t("extension.authCallback.signedIn"));
          return;
        }
        const text = err instanceof Error ? err.message : String(err);
        setStatus("error");
        setMessage(text);
        toast.error(t("extension.authCallback.signInFailed"), { description: text });
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [t]);

  return (
    <div className="relative flex h-full min-h-dvh w-full flex-col">
      <Toaster />
      <AuthShell
        className="min-h-full flex-1"
        logo={<OkkeyLogoMark className="h-[60px] w-[61px]" />}
        title={t("extension.authCallback.title")}
        description={status === "error" ? undefined : message}
        contentClassName="max-w-[340px] text-center"
        childrenClassName="flex flex-col items-center text-center"
      >
        {status === "working" ? (
          <div className="flex flex-col items-center justify-center" role="status" aria-busy="true">
            <Spinner />
          </div>
        ) : null}
        {status === "error" ? (
          <p className="okkey-body text-center text-sm text-muted-foreground">{message}</p>
        ) : null}
      </AuthShell>
    </div>
  );
}
