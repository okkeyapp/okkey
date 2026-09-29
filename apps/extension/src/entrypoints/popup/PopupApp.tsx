import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  AuthShell,
  Button,
  DevicePendingView,
  formatDeviceClientOs,
  formatDeviceTitle,
  Input,
  OkkeyLogoMark,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Spinner,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  cn,
  type DevicePendingApprover,
} from "@okkey/ui";
import {
  formatWebMessage,
  getWebLocaleNativeName,
  WEB_LOCALES,
  type WebLocale,
  type WebMessageValues,
} from "@okkey/i18n";

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
  revokeExtensionDeviceBestEffort,
} from "../../lib/deviceTrust";
import {
  clearSession,
  normalizeWebBaseUrl,
  readDeviceId,
  readLastServer,
  readProfile,
  readSession,
  resolveApiBaseFromWebBase,
  wipeAllExtensionData,
  writeLastServer,
  writePkcePending,
  writeProfile,
  type ExtensionHostMode,
  type ExtensionProfile,
  type ExtensionSession,
} from "../../lib/storage";

type Screen = "loading" | "server" | "signing-in" | "pending" | "blocked" | "unlock" | "error";

const LOCALE_STORAGE_KEY = "okkey.extension.locale";

function readStoredLocale(): WebLocale {
  try {
    const raw = localStorage.getItem(LOCALE_STORAGE_KEY);
    if (raw && (WEB_LOCALES as string[]).includes(raw)) {
      return raw as WebLocale;
    }
  } catch {
    // ignore
  }
  return "ru";
}

function ServerUrlHelpIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden {...props}>
      <circle cx="8" cy="8" r="6.25" stroke="currentColor" strokeWidth="1.25" />
      <path
        d="M6.35 6.2c0-.95.72-1.7 1.7-1.7.96 0 1.68.72 1.68 1.62 0 .78-.4 1.18-1.02 1.55-.58.35-.78.58-.78 1.08v.25"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
      />
      <circle cx="8" cy="11.35" r="0.7" fill="currentColor" />
    </svg>
  );
}

export function PopupApp() {
  const [screen, setScreen] = useState<Screen>("loading");
  const [locale, setLocale] = useState<WebLocale>(() => readStoredLocale());
  const [profile, setProfile] = useState<ExtensionProfile | null>(null);
  const [session, setSession] = useState<ExtensionSession | null>(null);
  const [trust, setTrust] = useState<DeviceTrustSnapshot | null>(null);
  const [hostMode, setHostMode] = useState<ExtensionHostMode>("saas");
  const [baseUrlInput, setBaseUrlInput] = useState(OKKEY_SAAS_WEB_BASE_URL);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [masterPassword, setMasterPassword] = useState("");
  const [unlockNote, setUnlockNote] = useState<string | null>(null);
  const serverUrlInputRef = useRef<HTMLInputElement>(null);

  const t = useCallback(
    (key: string, values?: WebMessageValues) => formatWebMessage(locale, key, values ?? {}),
    [locale],
  );

  const onLocaleChange = (next: WebLocale) => {
    setLocale(next);
    try {
      localStorage.setItem(LOCALE_STORAGE_KEY, next);
    } catch {
      // ignore
    }
  };

  const languageSelect = (
    <Select value={locale} onValueChange={(v) => onLocaleChange(v as WebLocale)} variant="inline">
      <SelectTrigger
        aria-label={t("web.shell.language.ariaLabel")}
        className="text-sm font-medium text-foreground"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {WEB_LOCALES.map((code) => (
          <SelectItem key={code} value={code}>
            {getWebLocaleNativeName(code)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

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

  const applyServerPreference = useCallback((mode: ExtensionHostMode, webBaseUrl: string) => {
    setHostMode(mode);
    setBaseUrlInput(mode === "saas" ? OKKEY_SAAS_WEB_BASE_URL : webBaseUrl);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function boot(): Promise<void> {
      const existingProfile = await readProfile();
      const existingSession = await readSession();
      const lastServer = await readLastServer();
      if (cancelled) return;
      if (existingProfile) {
        setProfile(existingProfile);
        const mode: ExtensionHostMode =
          existingProfile.webBaseUrl === OKKEY_SAAS_WEB_BASE_URL ? "saas" : "self-hosted";
        applyServerPreference(mode, existingProfile.webBaseUrl);
      } else if (lastServer) {
        applyServerPreference(
          lastServer.hostMode,
          lastServer.hostMode === "self-hosted" ? lastServer.webBaseUrl : OKKEY_SAAS_WEB_BASE_URL,
        );
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
  }, [applyServerPreference, refreshTrust]);

  useEffect(() => {
    if (screen !== "server" || hostMode !== "self-hosted") {
      return;
    }
    const id = window.setTimeout(() => {
      serverUrlInputRef.current?.focus();
      serverUrlInputRef.current?.select();
    }, 0);
    return () => window.clearTimeout(id);
  }, [screen, hostMode]);

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

  const onSaveServerAndLogin = async (event?: FormEvent) => {
    event?.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const rawUrl = hostMode === "saas" ? OKKEY_SAAS_WEB_BASE_URL : baseUrlInput;
      const webBaseUrl = normalizeWebBaseUrl(rawUrl);
      const apiBaseUrl = resolveApiBaseFromWebBase(webBaseUrl);
      const previous = await readProfile();
      if (previous && previous.webBaseUrl !== webBaseUrl) {
        if (session) {
          const core = createCoreClient(previous.apiBaseUrl, session.access_token);
          await revokeExtensionDeviceBestEffort(core, trust?.deviceId ?? (await readDeviceId()));
        }
        await wipeAllExtensionData();
      }
      const nextProfile: ExtensionProfile = {
        webBaseUrl,
        apiBaseUrl,
        updatedAt: Date.now(),
      };
      await writeProfile(nextProfile);
      await writeLastServer({
        hostMode,
        webBaseUrl: hostMode === "self-hosted" ? webBaseUrl : OKKEY_SAAS_WEB_BASE_URL,
      });
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

  const onLogout = async () => {
    if (profile && session) {
      const core = createCoreClient(profile.apiBaseUrl, session.access_token);
      await revokeExtensionDeviceBestEffort(core, trust?.deviceId ?? (await readDeviceId()));
    }
    await wipeAllExtensionData();
    setProfile(null);
    setSession(null);
    setTrust(null);
    setMasterPassword("");
    setUnlockNote(null);
    const lastServer = await readLastServer();
    if (lastServer) {
      applyServerPreference(
        lastServer.hostMode,
        lastServer.hostMode === "self-hosted" ? lastServer.webBaseUrl : OKKEY_SAAS_WEB_BASE_URL,
      );
    } else {
      applyServerPreference("saas", OKKEY_SAAS_WEB_BASE_URL);
    }
    setScreen("server");
  };

  const onUnlockSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!masterPassword.trim()) {
      setUnlockNote("Enter your master password.");
      return;
    }
    setUnlockNote(
      "Session trusted. Vault unlock (master password / PIN) lands in E2 — password was not sent anywhere.",
    );
  };

  const shellLogo = <OkkeyLogoMark className="h-[60px] w-[61px]" />;
  const copyright = t("web.shell.copyright", { year: new Date().getFullYear() });

  if (screen === "loading") {
    return (
      <PopupFrame>
        <AuthShell
          compact
          hideHeader
          topRight={languageSelect}
          copyright={copyright}
          className="min-h-[450px]"
        >
          <div className="flex min-h-[280px] items-center justify-center" role="status" aria-busy="true">
            <Spinner />
          </div>
        </AuthShell>
      </PopupFrame>
    );
  }

  if (screen === "server") {
    return (
      <PopupFrame>
        <TooltipProvider delayDuration={200}>
          <AuthShell
            compact
            logo={shellLogo}
            title={t("auth.email.title")}
            description={t("auth.extension.description")}
            topRight={languageSelect}
            copyright={copyright}
            className="min-h-[450px]"
          >
            <form className="flex w-full flex-col gap-4" onSubmit={(e) => void onSaveServerAndLogin(e)}>
              <div
                className="grid grid-cols-2 gap-1 rounded-lg border border-border bg-secondary/60 p-1"
                role="tablist"
                aria-label="Host"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={hostMode === "saas"}
                  className={cn(
                    "rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    hostMode === "saas"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                  onClick={() => {
                    setHostMode("saas");
                    setBaseUrlInput(OKKEY_SAAS_WEB_BASE_URL);
                  }}
                >
                  SaaS
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={hostMode === "self-hosted"}
                  className={cn(
                    "rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    hostMode === "self-hosted"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                  onClick={() => setHostMode("self-hosted")}
                >
                  Self-hosted
                </button>
              </div>

              {hostMode === "self-hosted" ? (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-1.5">
                    <label className="text-xs font-medium text-muted-foreground" htmlFor="base-url">
                      {t("auth.extension.labelServerUrl")}
                    </label>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          className="inline-flex size-4 items-center justify-center text-muted-foreground hover:text-foreground"
                          aria-label={t("auth.extension.serverUrlTooltip")}
                        >
                          <ServerUrlHelpIcon className="size-3.5" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-[240px]">
                        {t("auth.extension.serverUrlTooltip")}
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <Input
                    ref={serverUrlInputRef}
                    id="base-url"
                    value={baseUrlInput}
                    onChange={(e) => setBaseUrlInput(e.target.value)}
                    placeholder="https://okkey.example.com"
                    autoComplete="off"
                    spellCheck={false}
                  />
                </div>
              ) : null}

              {error ? (
                <Alert variant="error">
                  <AlertTitle>Error</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              ) : null}

              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? <Spinner className="size-4" /> : t("auth.email.submit")}
              </Button>
            </form>
          </AuthShell>
        </TooltipProvider>
      </PopupFrame>
    );
  }

  if (screen === "signing-in") {
    return (
      <PopupFrame>
        <AuthShell
          compact
          hideHeader
          topRight={languageSelect}
          copyright={copyright}
          className="min-h-[450px]"
        >
          <div className="flex min-h-[280px] items-center justify-center" role="status" aria-busy="true">
            <Spinner />
          </div>
          <div className="mt-4 flex flex-col gap-2">
            <Button
              type="button"
              variant="outline"
              className="w-full"
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
              Continue
            </Button>
            <Button type="button" variant="ghost" className="w-full" onClick={() => setScreen("server")}>
              Back
            </Button>
          </div>
        </AuthShell>
      </PopupFrame>
    );
  }

  if (screen === "pending" || screen === "blocked") {
    const blocked = screen === "blocked";
    const approvers: DevicePendingApprover[] = (trust?.approverDevices ?? []).map((device) => ({
      ...device,
      title: formatDeviceTitle(device),
      subtitle: formatDeviceClientOs(device),
    }));

    return (
      <PopupFrame>
        <AuthShell
          compact
          logo={shellLogo}
          title={
            blocked ? t("web.devicePending.blockedTitle") : t("web.devicePending.title")
          }
          description={
            blocked ? t("web.devicePending.blockedBody") : t("web.devicePending.body")
          }
          topRight={languageSelect}
          copyright={copyright}
          contentClassName="max-w-md"
          className="min-h-[450px]"
        >
          <DevicePendingView
            mode={blocked ? "blocked" : "pending"}
            approversHeading={t("web.devicePending.approversHeading")}
            approversEmpty={t("web.devicePending.approversEmpty")}
            waitingLabel={t("web.devicePending.waiting")}
            blockedDetail={
              blocked
                ? trust?.blockedUntil
                  ? t("web.devicePending.blockedUntil", { date: trust.blockedUntil })
                  : t("web.devicePending.blockedForever")
                : undefined
            }
            approvers={approvers}
            footer={
              <Button type="button" variant="ghost" className="w-full" onClick={() => void onLogout()}>
                {t("web.accountMenu.logout")}
              </Button>
            }
          />
        </AuthShell>
      </PopupFrame>
    );
  }

  if (screen === "error") {
    return (
      <PopupFrame>
        <AuthShell
          compact
          logo={shellLogo}
          topRight={languageSelect}
          copyright={copyright}
          className="min-h-[450px]"
        >
          <Alert variant="error">
            <AlertTitle>Something went wrong</AlertTitle>
            <AlertDescription>{error ?? "Unknown error"}</AlertDescription>
          </Alert>
          <Button
            type="button"
            className="mt-4 w-full"
            onClick={() => {
              void clearSession();
              setScreen("server");
            }}
          >
            Back
          </Button>
        </AuthShell>
      </PopupFrame>
    );
  }

  return (
    <PopupFrame>
      <AuthShell
        compact
        logo={shellLogo}
        title="Unlock"
        description="Enter your master password in the extension. Web login does not unlock the vault here."
        topRight={languageSelect}
        copyright={copyright}
        className="min-h-[450px]"
      >
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
        <p className="mt-3 text-xs text-muted-foreground">Profile: {profile?.webBaseUrl ?? "—"}</p>
        <Button type="button" variant="ghost" size="sm" className="mt-2" onClick={() => void onLogout()}>
          {t("web.accountMenu.logout")}
        </Button>
      </AuthShell>
    </PopupFrame>
  );
}

function PopupFrame({ children }: { children: React.ReactNode }) {
  return <div className="h-[450px] w-[600px] overflow-hidden">{children}</div>;
}
