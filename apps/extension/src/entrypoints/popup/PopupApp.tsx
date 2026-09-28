import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Alert, AlertDescription, AlertTitle, Button, Input, Spinner } from "@okkey/ui";

import { createCoreClient } from "../../lib/api";
import {
  buildExtensionAuthStartUrl,
  createPkcePair,
  getExtensionCallbackUrl,
} from "../../lib/pkce";
import { OKKEY_SAAS_WEB_BASE_URL } from "../../lib/deviceChannel";
import {
  type DeviceTrustSnapshot,
  pollExtensionDeviceTrust,
  resolveExtensionDeviceTrust,
} from "../../lib/deviceTrust";
import {
  clearSession,
  normalizeWebBaseUrl,
  readProfile,
  readSession,
  resolveApiBaseFromWebBase,
  wipeAllExtensionData,
  writePkcePending,
  writeProfile,
  type ExtensionProfile,
  type ExtensionSession,
} from "../../lib/storage";

type Screen = "loading" | "server" | "signing-in" | "pending" | "blocked" | "unlock" | "error";

export function PopupApp() {
  const [screen, setScreen] = useState<Screen>("loading");
  const [profile, setProfile] = useState<ExtensionProfile | null>(null);
  const [session, setSession] = useState<ExtensionSession | null>(null);
  const [trust, setTrust] = useState<DeviceTrustSnapshot | null>(null);
  const [baseUrlInput, setBaseUrlInput] = useState(OKKEY_SAAS_WEB_BASE_URL);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [masterPassword, setMasterPassword] = useState("");
  const [unlockNote, setUnlockNote] = useState<string | null>(null);

  const refreshTrust = useCallback(async (apiBaseUrl: string, accessToken: string) => {
    const core = createCoreClient(apiBaseUrl, accessToken);
    const snapshot = await resolveExtensionDeviceTrust(core);
    setTrust(snapshot);
    if (snapshot.status === "trusted") {
      setScreen("unlock");
    } else if (snapshot.status === "blocked") {
      setScreen("blocked");
    } else if (snapshot.status === "pending" || snapshot.status === "checking") {
      setScreen("pending");
    } else if (snapshot.status === "error") {
      setError(snapshot.errorMessage ?? "Device registration failed");
      setScreen("error");
    } else {
      setScreen("pending");
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function boot(): Promise<void> {
      const existingProfile = await readProfile();
      const existingSession = await readSession();
      if (cancelled) return;
      if (existingProfile) {
        setProfile(existingProfile);
        setBaseUrlInput(existingProfile.webBaseUrl);
      }
      if (existingProfile && existingSession) {
        setSession(existingSession);
        await refreshTrust(existingProfile.apiBaseUrl, existingSession.access_token);
        return;
      }
      setScreen("server");
    }
    void boot();
    return () => {
      cancelled = true;
    };
  }, [refreshTrust]);

  useEffect(() => {
    if (screen !== "pending" || !profile || !session) {
      return;
    }
    const core = createCoreClient(profile.apiBaseUrl, session.access_token);
    const timer = window.setInterval(() => {
      void pollExtensionDeviceTrust(core, trust?.deviceId ?? null).then((snapshot) => {
        setTrust(snapshot);
        if (snapshot.status === "trusted") {
          setScreen("unlock");
        } else if (snapshot.status === "blocked") {
          setScreen("blocked");
        } else if (snapshot.status === "rejected") {
          setError("Device was rejected. Sign in again.");
          setScreen("error");
        }
      });
    }, 4_000);
    return () => window.clearInterval(timer);
  }, [screen, profile, session, trust?.deviceId]);

  const onSaveServerAndLogin = async () => {
    setBusy(true);
    setError(null);
    try {
      const webBaseUrl = normalizeWebBaseUrl(baseUrlInput);
      const apiBaseUrl = resolveApiBaseFromWebBase(webBaseUrl);
      const previous = await readProfile();
      if (previous && previous.webBaseUrl !== webBaseUrl) {
        // Plan: changing URL → logout + wipe
        await wipeAllExtensionData();
      }
      const nextProfile: ExtensionProfile = {
        webBaseUrl,
        apiBaseUrl,
        updatedAt: Date.now(),
      };
      await writeProfile(nextProfile);
      setProfile(nextProfile);

      const { state, codeVerifier, codeChallenge } = await createPkcePair();
      const redirectUri = getExtensionCallbackUrl();
      await writePkcePending({
        state,
        codeVerifier,
        redirectUri,
        webBaseUrl,
        apiBaseUrl,
        createdAt: Date.now(),
      });

      const startUrl = buildExtensionAuthStartUrl({
        webBaseUrl,
        redirectUri,
        state,
        codeChallenge,
      });
      await browser.tabs.create({ url: startUrl });
      setScreen("signing-in");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
      setScreen("server");
    } finally {
      setBusy(false);
    }
  };

  const onUseSaasPreset = () => {
    setBaseUrlInput(OKKEY_SAAS_WEB_BASE_URL);
  };

  const onLogout = async () => {
    await wipeAllExtensionData();
    setProfile(null);
    setSession(null);
    setTrust(null);
    setMasterPassword("");
    setUnlockNote(null);
    setBaseUrlInput(OKKEY_SAAS_WEB_BASE_URL);
    setScreen("server");
  };

  const onUnlockSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!masterPassword.trim()) {
      setUnlockNote("Enter your master password.");
      return;
    }
    // E1: unlock UI only — real MP/PIN crypto arrives in E2.
    setUnlockNote(
      "Session trusted. Vault unlock (master password / PIN) lands in E2 — password was not sent anywhere.",
    );
  };

  if (screen === "loading") {
    return (
      <Shell>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner className="size-4" />
          Loading…
        </div>
      </Shell>
    );
  }

  if (screen === "server") {
    return (
      <Shell>
        <header className="flex flex-col gap-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Okkey</p>
          <h1 className="text-lg font-semibold text-foreground">Server</h1>
          <p className="text-sm text-muted-foreground">
            One Base URL for your Okkey instance. Sign-in opens in the browser; unlock stays here.
          </p>
        </header>

        <div className="flex flex-col gap-2">
          <label className="text-xs font-medium text-muted-foreground" htmlFor="base-url">
            Base URL
          </label>
          <Input
            id="base-url"
            value={baseUrlInput}
            onChange={(e) => setBaseUrlInput(e.target.value)}
            placeholder="https://app.okkey.io"
            autoComplete="off"
            spellCheck={false}
          />
          <Button type="button" variant="outline" size="sm" onClick={onUseSaasPreset}>
            Use SaaS ({OKKEY_SAAS_WEB_BASE_URL})
          </Button>
        </div>

        {error ? (
          <Alert variant="destructive">
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <div className="mt-auto">
          <Button type="button" className="w-full" disabled={busy} onClick={() => void onSaveServerAndLogin()}>
            {busy ? "Opening…" : "Sign in via browser"}
          </Button>
        </div>
      </Shell>
    );
  }

  if (screen === "signing-in") {
    return (
      <Shell>
        <header className="flex flex-col gap-1">
          <h1 className="text-lg font-semibold">Sign in</h1>
          <p className="text-sm text-muted-foreground">
            Complete login in the browser tab. This popup will continue after the callback — vault stays locked
            until you unlock here.
          </p>
        </header>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner className="size-4" />
          Waiting for browser callback…
        </div>
        <Button
          type="button"
          variant="outline"
          className="mt-auto"
          onClick={() => {
            void (async () => {
              const nextSession = await readSession();
              const nextProfile = await readProfile();
              if (nextSession && nextProfile) {
                setSession(nextSession);
                setProfile(nextProfile);
                await refreshTrust(nextProfile.apiBaseUrl, nextSession.access_token);
              }
            })();
          }}
        >
          I finished sign-in — continue
        </Button>
        <Button type="button" variant="ghost" onClick={() => setScreen("server")}>
          Change server
        </Button>
      </Shell>
    );
  }

  if (screen === "pending") {
    return (
      <Shell>
        <header className="flex flex-col gap-1">
          <h1 className="text-lg font-semibold">Approve this extension</h1>
          <p className="text-sm text-muted-foreground">
            This device is pending approval. Open Okkey on a trusted device and approve{" "}
            <span className="font-medium">Extension</span> — same flow as a new web browser.
          </p>
        </header>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner className="size-4" />
          Waiting for approval…
        </div>
        {trust?.approverDevices?.length ? (
          <ul className="space-y-1 text-xs text-muted-foreground">
            {trust.approverDevices.slice(0, 5).map((d) => (
              <li key={d.device_id}>{d.device_name ?? d.device_id}</li>
            ))}
          </ul>
        ) : null}
        <Button type="button" variant="ghost" className="mt-auto" onClick={() => void onLogout()}>
          Sign out
        </Button>
      </Shell>
    );
  }

  if (screen === "blocked") {
    return (
      <Shell>
        <Alert variant="destructive">
          <AlertTitle>Device blocked</AlertTitle>
          <AlertDescription>
            {trust?.blockedUntil
              ? `Blocked until ${trust.blockedUntil}.`
              : "This extension device is blocked."}
          </AlertDescription>
        </Alert>
        <Button type="button" variant="outline" className="mt-auto" onClick={() => void onLogout()}>
          Sign out
        </Button>
      </Shell>
    );
  }

  if (screen === "error") {
    return (
      <Shell>
        <Alert variant="destructive">
          <AlertTitle>Something went wrong</AlertTitle>
          <AlertDescription>{error ?? "Unknown error"}</AlertDescription>
        </Alert>
        <Button
          type="button"
          className="mt-auto"
          onClick={() => {
            void clearSession();
            setScreen("server");
          }}
        >
          Back to server
        </Button>
      </Shell>
    );
  }

  // unlock
  return (
    <Shell>
      <header className="flex flex-col gap-1">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Okkey</p>
        <h1 className="text-lg font-semibold">Unlock</h1>
        <p className="text-sm text-muted-foreground">
          Enter your master password in the extension. Web login does not unlock the vault here.
        </p>
      </header>
      <form className="flex flex-col gap-3" onSubmit={onUnlockSubmit}>
        <div className="flex flex-col gap-2">
          <label className="text-xs font-medium text-muted-foreground" htmlFor="mp">
            Master password
          </label>
          <Input
            id="mp"
            type="password"
            value={masterPassword}
            onChange={(e) => setMasterPassword(e.target.value)}
            autoComplete="current-password"
          />
        </div>
        {unlockNote ? (
          <Alert>
            <AlertTitle>E1 unlock stub</AlertTitle>
            <AlertDescription>{unlockNote}</AlertDescription>
          </Alert>
        ) : null}
        <Button type="submit" className="w-full">
          Unlock
        </Button>
      </form>
      <p className="text-xs text-muted-foreground">
        Profile: {profile?.webBaseUrl ?? "—"}
      </p>
      <Button type="button" variant="ghost" size="sm" onClick={() => void onLogout()}>
        Sign out / change server
      </Button>
    </Shell>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return <div className="flex min-h-[420px] w-[320px] flex-col gap-4 p-4">{children}</div>;
}
