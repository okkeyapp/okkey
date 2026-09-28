import { useEffect, useState } from "react";
import { Alert, AlertDescription, AlertTitle, Spinner } from "@okkey/ui";

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
    <div className="mx-auto flex min-h-screen max-w-md flex-col gap-4 p-6">
      <h1 className="text-xl font-semibold">Okkey extension</h1>
      {status === "working" ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner className="size-4" />
          {message}
        </div>
      ) : null}
      {status === "ok" ? (
        <Alert>
          <AlertTitle>Session ready</AlertTitle>
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      ) : null}
      {status === "error" ? (
        <Alert variant="destructive">
          <AlertTitle>Sign-in failed</AlertTitle>
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
