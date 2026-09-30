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
  writeProfile,
  writeSession,
} from "../../lib/storage";

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
    async function run(): Promise<void> {
      try {
        const params = new URLSearchParams(window.location.search);
        const code = params.get("code")?.trim() ?? "";
        const state = params.get("state")?.trim() ?? "";
        if (!code || !state) {
          throw new Error(t("extension.authCallback.errorMissingCode"));
        }
        const pending = await readPkcePending();
        if (!pending) {
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
        await writeSession(session);
        await writeProfile({
          webBaseUrl: pending.webBaseUrl,
          apiBaseUrl: pending.apiBaseUrl,
          updatedAt: Date.now(),
        });
        await clearPkcePending();

        if (!cancelled) {
          const signedIn = t("extension.authCallback.signedIn");
          setStatus("ok");
          setMessage(signedIn);
          toast.success(t("extension.authCallback.sessionReady"), {
            description: signedIn,
          });
        }
      } catch (err: unknown) {
        if (!cancelled) {
          const text = err instanceof Error ? err.message : String(err);
          setStatus("error");
          setMessage(text);
          toast.error(t("extension.authCallback.signInFailed"), { description: text });
        }
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
