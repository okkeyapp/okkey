import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import {
  AccountUserBar,
  AuthShell,
  Button,
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
} from "@okkey/ui";
import {
  formatWebMessage,
  getWebLocaleNativeName,
  WEB_LOCALES,
  type WebLocale,
  type WebMessageValues,
} from "@okkey/i18n";
import { toast } from "sonner";

import type { UnlockWithMasterPasswordResult } from "@okkey/vault";

import { Toaster } from "../../components/toaster";
import { createCoreClient } from "../../lib/api";
import {
  buildExtensionAuthStartUrl,
  createPkcePair,
  getExtensionCallbackUrl,
} from "../../lib/pkce";
import { OKKEY_SAAS_WEB_BASE_URL } from "../../lib/deviceChannel";
import {
  type DeviceTrustSnapshot,
  markExtensionDeviceDeferred,
  pollExtensionDeviceTrust,
  resolveExtensionDeviceTrust,
  retryExtensionDeviceRegistration,
  revokeExtensionDeviceBestEffort,
} from "../../lib/deviceTrust";
import {
  unlockExtensionVault,
  wipeUnlockSecrets,
} from "../../lib/extensionUnlock";
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
import { readExtensionVaultBundle } from "../../lib/vaultStorage";
import { VaultPopup } from "./VaultPopup";

type Screen =
  | "loading"
  | "server"
  | "signing-in"
  | "pending"
  | "blocked"
  | "rejected"
  | "unlock"
  | "vault"
  | "error";

type AccountIdentity = {
  email: string;
  firstName: string;
  lastName: string;
};

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

function formatAbsoluteDate(iso: string, locale: WebLocale): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "en-US", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
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
  const [identity, setIdentity] = useState<AccountIdentity | null>(null);
  const [hostMode, setHostMode] = useState<ExtensionHostMode>("saas");
  const [baseUrlInput, setBaseUrlInput] = useState(OKKEY_SAAS_WEB_BASE_URL);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [masterPassword, setMasterPassword] = useState("");
  const [unlockBusy, setUnlockBusy] = useState(false);
  const [unlockSecrets, setUnlockSecrets] = useState<UnlockWithMasterPasswordResult | null>(null);
  const [encryptedPrivateKeyPayload, setEncryptedPrivateKeyPayload] = useState<string | null>(null);
  const serverUrlInputRef = useRef<HTMLInputElement>(null);
  const unlockSecretsRef = useRef<UnlockWithMasterPasswordResult | null>(null);

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

  const loadIdentity = useCallback(async (apiBaseUrl: string, accessToken: string) => {
    try {
      const core = createCoreClient(apiBaseUrl, accessToken);
      const account = await core.getAccountProfile();
      setIdentity({
        email: account.email ?? "",
        firstName: account.first_name ?? "",
        lastName: account.last_name ?? "",
      });
    } catch {
      setIdentity(null);
    }
  }, []);

  const applyTrustSnapshot = useCallback((snapshot: DeviceTrustSnapshot) => {
    setTrust(snapshot);
    if (snapshot.status === "trusted") {
      setScreen("unlock");
    } else if (snapshot.status === "blocked") {
      setScreen("blocked");
    } else if (snapshot.status === "rejected") {
      setScreen("rejected");
    } else if (snapshot.status === "pending" || snapshot.status === "checking") {
      setScreen("pending");
    } else if (snapshot.status === "error") {
      const message = snapshot.errorMessage ?? "Device registration failed";
      setError(message);
      toast.error(message);
      setScreen("error");
    } else {
      setScreen("pending");
    }
  }, []);

  const refreshTrust = useCallback(
    async (apiBaseUrl: string, accessToken: string) => {
      const core = createCoreClient(apiBaseUrl, accessToken);
      const snapshot = await resolveExtensionDeviceTrust(core);
      applyTrustSnapshot(snapshot);
      void loadIdentity(apiBaseUrl, accessToken);
    },
    [applyTrustSnapshot, loadIdentity],
  );

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
    if ((screen !== "pending" && screen !== "blocked") || !profile || !session) {
      return;
    }
    const core = createCoreClient(profile.apiBaseUrl, session.access_token);
    const timer = window.setInterval(() => {
      void pollExtensionDeviceTrust(core, trust?.deviceId ?? null).then(async (snapshot) => {
        if (snapshot.status === "rejected") {
          await markExtensionDeviceDeferred(snapshot.deviceId);
        }
        applyTrustSnapshot(snapshot);
      });
    }, 4_000);
    return () => window.clearInterval(timer);
  }, [screen, profile, session, trust?.deviceId, applyTrustSnapshot]);

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
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      toast.error(message);
      setScreen("server");
    } finally {
      setBusy(false);
    }
  };

  const lockVault = useCallback(() => {
    wipeUnlockSecrets(unlockSecretsRef.current);
    unlockSecretsRef.current = null;
    setUnlockSecrets(null);
    setEncryptedPrivateKeyPayload(null);
    setMasterPassword("");
    setScreen("unlock");
  }, []);

  const onLogout = async () => {
    wipeUnlockSecrets(unlockSecretsRef.current);
    unlockSecretsRef.current = null;
    setUnlockSecrets(null);
    setEncryptedPrivateKeyPayload(null);
    if (profile && session) {
      const core = createCoreClient(profile.apiBaseUrl, session.access_token);
      await revokeExtensionDeviceBestEffort(core, trust?.deviceId ?? (await readDeviceId()));
    }
    await wipeAllExtensionData();
    setProfile(null);
    setSession(null);
    setTrust(null);
    setIdentity(null);
    setMasterPassword("");
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

  const onRetryRegistration = async () => {
    if (!profile || !session || retrying) {
      return;
    }
    setRetrying(true);
    try {
      const core = createCoreClient(profile.apiBaseUrl, session.access_token);
      const snapshot = await retryExtensionDeviceRegistration(core);
      applyTrustSnapshot(snapshot);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      toast.error(message);
      setScreen("error");
    } finally {
      setRetrying(false);
    }
  };

  const onUnlockSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!profile || !session || unlockBusy) {
      return;
    }
    if (!masterPassword.trim()) {
      toast.error(t("unlock.errorTitle"), { description: t("unlock.errorIncorrectPassword") });
      return;
    }
    setUnlockBusy(true);
    void (async () => {
      try {
        const core = createCoreClient(profile.apiBaseUrl, session.access_token);
        const secrets = await unlockExtensionVault({
          core,
          userId: session.user_id,
          masterPassword,
        });
        if (!secrets) {
          toast.error(t("unlock.errorTitle"), { description: t("unlock.errorIncorrectPassword") });
          return;
        }
        const bundle = await readExtensionVaultBundle(session.user_id);
        if (!bundle?.encrypted_private_key?.payload) {
          wipeUnlockSecrets(secrets);
          toast.error(t("unlock.errorTitle"), { description: t("unlock.errorNoLocalVault") });
          return;
        }
        wipeUnlockSecrets(unlockSecretsRef.current);
        unlockSecretsRef.current = secrets;
        setUnlockSecrets(secrets);
        setEncryptedPrivateKeyPayload(bundle.encrypted_private_key.payload);
        setMasterPassword("");
        setScreen("vault");
        void core.recordVaultUnlock().catch(() => {
          /* best-effort */
        });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        toast.error(t("unlock.errorTitle"), { description: message });
      } finally {
        setUnlockBusy(false);
      }
    })();
  };

  const shellLogo = <OkkeyLogoMark className="h-[60px] w-[61px]" />;
  const identityBar =
    identity || session ? (
      <AccountUserBar
        email={identity?.email ?? ""}
        firstName={identity?.firstName ?? ""}
        lastName={identity?.lastName ?? ""}
        signOutLabel={t("unlock.signOut")}
        onSignOut={() => void onLogout()}
      />
    ) : null;

  if (screen === "loading") {
    return (
      <PopupFrame>
        <AuthShell compact hideHeader topRight={languageSelect}>
          <div className="flex items-center justify-center" role="status" aria-busy="true">
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
                  onClick={() => {
                    setHostMode("self-hosted");
                    void (async () => {
                      const last = await readLastServer();
                      if (
                        last?.hostMode === "self-hosted" &&
                        last.webBaseUrl &&
                        (baseUrlInput === OKKEY_SAAS_WEB_BASE_URL || !baseUrlInput.trim())
                      ) {
                        setBaseUrlInput(last.webBaseUrl);
                      } else if (baseUrlInput === OKKEY_SAAS_WEB_BASE_URL) {
                        setBaseUrlInput("");
                      }
                    })();
                  }}
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
        <AuthShell compact hideHeader topRight={languageSelect}>
          <div className="flex flex-col items-center gap-4">
          <div className="flex items-center justify-center" role="status" aria-busy="true">
            <Spinner />
          </div>
          <div className="flex w-full flex-col gap-2">
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
          </div>
        </AuthShell>
      </PopupFrame>
    );
  }

  if (screen === "pending" || screen === "blocked" || screen === "rejected") {
    const blocked = screen === "blocked";
    const rejected = screen === "rejected";
    const title = blocked
      ? t("web.devicePending.blockedTitle")
      : rejected
        ? t("web.devicePending.rejectedTitle")
        : t("web.devicePending.title");
    const description = blocked
      ? t("web.devicePending.blockedBody")
      : rejected
        ? t("web.devicePending.rejectedBody")
        : undefined;

    return (
      <PopupFrame>
        <AuthShell
          compact
          logo={shellLogo}
          title={title}
          description={description}
          topRight={languageSelect}
        >
          <div className="flex w-full flex-col gap-6">
            {identityBar}

            {screen === "pending" ? (
              <div className="flex w-full flex-col items-center gap-6">
                <div
                  className="flex items-center justify-center gap-2 text-sm text-muted-foreground"
                  role="status"
                  aria-busy="true"
                >
                  <Spinner className="size-4" />
                  <span>{t("web.devicePending.waiting")}</span>
                </div>
                <p className="okkey-body text-center text-sm text-muted-foreground">
                  {t("web.devicePending.bodyCompact")}
                </p>
              </div>
            ) : null}

            {blocked ? (
              <p className="text-center text-sm text-muted-foreground">
                {trust?.blockedUntil
                  ? t("web.devicePending.blockedUntil", {
                      date: formatAbsoluteDate(trust.blockedUntil, locale),
                    })
                  : t("web.devicePending.blockedForever")}
              </p>
            ) : null}

            {rejected ? (
              <Button type="button" disabled={retrying} onClick={() => void onRetryRegistration()}>
                {retrying ? <Spinner className="size-4" /> : null}
                {t("web.devicePending.retry")}
              </Button>
            ) : null}
          </div>
        </AuthShell>
      </PopupFrame>
    );
  }

  if (screen === "error") {
    return (
      <PopupFrame>
        <AuthShell compact logo={shellLogo} topRight={languageSelect}>
          <Button
            type="button"
            className="w-full"
            onClick={() => {
              void clearSession();
              setError(null);
              setScreen("server");
            }}
          >
            Back
          </Button>
        </AuthShell>
      </PopupFrame>
    );
  }

  if (screen === "vault" && profile && session && unlockSecrets && encryptedPrivateKeyPayload) {
    return (
      <PopupFrame>
        <VaultPopup
          core={createCoreClient(profile.apiBaseUrl, session.access_token)}
          userId={session.user_id}
          webBaseUrl={profile.webBaseUrl}
          secrets={unlockSecrets}
          encryptedPrivateKeyPayload={encryptedPrivateKeyPayload}
          identity={identity}
          localeSelect={languageSelect}
          signOutLabel={t("unlock.signOut")}
          onSignOut={() => void onLogout()}
          onLock={lockVault}
          t={t}
        />
      </PopupFrame>
    );
  }

  return (
    <PopupFrame>
      <AuthShell compact logo={shellLogo} title={t("unlock.title")} topRight={languageSelect}>
        <form onSubmit={onUnlockSubmit} className="flex w-full flex-col gap-6" noValidate>
          {identityBar}

          <div className="flex w-full flex-col gap-3">
            <label
              htmlFor="unlock-master-password"
              className="min-w-0 flex-1 okkey-small font-medium text-copy-primary"
            >
              {t("unlock.masterPassword")}
            </label>
            <Input
              id="unlock-master-password"
              name="password"
              type="password"
              autoComplete="current-password"
              value={masterPassword}
              onChange={(e) => setMasterPassword(e.target.value)}
              disabled={unlockBusy}
            />
          </div>

          <Button
            type="submit"
            variant="default"
            className="w-full"
            disabled={masterPassword.length === 0 || unlockBusy}
          >
            {unlockBusy ? <Spinner className="size-4" /> : t("unlock.submit")}
          </Button>
        </form>
      </AuthShell>
    </PopupFrame>
  );
}

function PopupFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative h-[450px] w-[600px] overflow-hidden">
      <Toaster />
      {children}
    </div>
  );
}
