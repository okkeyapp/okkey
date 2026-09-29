import { useEffect, useState } from "react";
import { AuthShell, OkkeyLogoMark, Spinner } from "@okkey/ui";
import { toast } from "sonner";

import { Toaster } from "../../components/toaster";
import { exchangeExtensionAuthCode } from "../../lib/api";
import {
  clearPkcePending,
  readPkcePending,
  writeProfile,
  writeSession,
} from "../../lib/storage";

/**
 * Receives `?code=&state=` from web after PKCE login and exchanges for a Bearer session.
 */
export function AuthCallbackApp() {
  const [status, setStatus] = useState<"working" | "ok" | "error">("working");
  const [message, setMessage] = useState("Completing sign-in…");

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
          toast.success("Session ready", {
            description: "Signed in. You can close this tab and open the Okkey extension popup.",
          });
        }
      } catch (err: unknown) {
        if (!cancelled) {
          const text = err instanceof Error ? err.message : String(err);
          setStatus("error");
          setMessage(text);
          toast.error("Sign-in failed", { description: text });
        }
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="relative h-full w-full">
      <Toaster />
      <AuthShell
        compact
        logo={<OkkeyLogoMark className="h-[60px] w-[61px]" />}
        title="Okkey extension"
        description={status === "working" ? message : status === "ok" ? message : undefined}
        contentClassName="max-w-[340px]"
      >
        {status === "working" ? (
          <div className="flex flex-col items-center" role="status" aria-busy="true">
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
