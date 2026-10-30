import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type FormEvent,
  type KeyboardEvent,
} from "react";
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
import { buildVaultUnlockAttestation, unwrapUnlockMaterialWithPin, wipeBytes } from "@okkey/crypto";
import { toast } from "sonner";

import {
  VAULT_UNLOCK_SESSION_STORAGE_KEY,
  type UnlockWithMasterPasswordResult,
} from "@okkey/vault";

import { Toaster } from "../../components/toaster";
import { AUTOFILL_MSG } from "../../lib/autofillMessages";
import { createCoreClient, isUnauthorizedApiError } from "../../lib/api";
import { applyExtensionStoredTheme } from "../../lib/applyExtensionTheme";
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
import { clearExtensionDeviceSigningKey } from "../../lib/deviceSigningKey";
import { readExtensionPinUnlockWrap } from "../../lib/extensionDeviceUnlockStore";
import {
  ensureExtensionVaultBundle,
  unlockExtensionVault,
  wipeUnlockSecrets,
} from "../../lib/extensionUnlock";
import { initExtensionCrypto } from "../../lib/initExtensionCrypto";
import {
  loadExtensionLocale,
  readStoredExtensionLocale,
  writeStoredExtensionLocale,
} from "../../lib/locale";
import { flushPendingClipboardClearInPage, POPUP_PORT_NAME } from "../../lib/extensionVaultLifecycle";
import {
  clearExtensionUnlockSession,
  DEFAULT_EXTENSION_IDLE_LOCK_MS,
  extensionUnlockSessionExceededIdle,
  persistExtensionUnlockSession,
  readExtensionDevicePrefs,
  readExtensionUnlockSessionIfFresh,
  resolveExtensionIdleLockMs,
  vaultIdleLockMsFromServerSeconds,
} from "../../lib/extensionVaultSession";
import { clearPinFailures, isPinLocked, recordPinFailure } from "../../lib/pinRateLimit";
import {
  WEB_BASE_URL_UNREACHABLE_ERROR,
  probeWebBaseUrl,
} from "../../lib/probeWebBaseUrl";
import {
  clearExtensionSessionArea,
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
  WEB_BASE_URL_REQUIRED_ERROR,
  WEB_BASE_URL_SCHEME_ERROR,
  type ExtensionHostMode,
  type ExtensionProfile,
  type ExtensionSession,
} from "../../lib/storage";
import { readExtensionVaultBundle } from "../../lib/vaultStorage";
import { VaultPopup } from "./VaultPopup";

type UnlockMode = "pin" | "master";

/**
 * MVP: self-hosted server URL only. Set true (or wire to env later) to restore
 * SaaS / Self-hosted tabs without rewriting the sign-in flow.
 */
const ENABLE_SAAS_SIGNIN = false;

const PIN_LENGTH = 6;

const pinCellClassName =
  "h-[54px] w-full min-w-0 p-0 text-center text-lg font-semibold tabular-nums";

function emptyPinDigits(): string[] {
  return Array.from({ length: PIN_LENGTH }, () => "");
}

/**
 * Device sleep / OS lock and idle-after-popup-close are owned by the background
 * service worker (chrome.idle + chrome.alarms + popup port disconnect).
 * Do NOT use document.visibilitychange / window blur here — popup close would
 * false-trigger a lock. Optional lock-on-popup-close is a user setting (default off).
 * While the popup is open we still poll idle for in-popup inactivity.
 */

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
  const [locale, setLocale] = useState<WebLocale>(() => readStoredExtensionLocale());
  const [profile, setProfile] = useState<ExtensionProfile | null>(null);
  const [session, setSession] = useState<ExtensionSession | null>(null);
  const [trust, setTrust] = useState<DeviceTrustSnapshot | null>(null);
  const [identity, setIdentity] = useState<AccountIdentity | null>(null);
  const [hostMode, setHostMode] = useState<ExtensionHostMode>(
    ENABLE_SAAS_SIGNIN ? "saas" : "self-hosted",
  );
  const [baseUrlInput, setBaseUrlInput] = useState(
    ENABLE_SAAS_SIGNIN ? OKKEY_SAAS_WEB_BASE_URL : "",
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [masterPassword, setMasterPassword] = useState("");
  const [unlockBusy, setUnlockBusy] = useState(false);
  const [unlockMode, setUnlockMode] = useState<UnlockMode>("master");
  const [pinEnabled, setPinEnabled] = useState(false);
  const [pinDigits, setPinDigits] = useState(emptyPinDigits);
  const [pinError, setPinError] = useState<string | null>(null);
  const [unlockSecrets, setUnlockSecrets] = useState<UnlockWithMasterPasswordResult | null>(null);
  const [encryptedPrivateKeyPayload, setEncryptedPrivateKeyPayload] = useState<string | null>(null);
  const [vaultIdleLockMs, setVaultIdleLockMs] = useState(DEFAULT_EXTENSION_IDLE_LOCK_MS);
  const serverUrlInputRef = useRef<HTMLInputElement>(null);
  const masterPasswordInputRef = useRef<HTMLInputElement>(null);
  const pinInputsRef = useRef<(HTMLInputElement | null)[]>([]);
  const pinAutoSubmitEnabledRef = useRef(true);
  const pinSubmitInFlightRef = useRef(false);
  const unlockSecretsRef = useRef<UnlockWithMasterPasswordResult | null>(null);
  const pinLabelId = "unlock-pin-label";
  const pinValue = pinDigits.join("");

  const t = useCallback(
    (key: string, values?: WebMessageValues) => formatWebMessage(locale, key, values ?? {}),
    [locale],
  );

  const formatServerUrlError = useCallback(
    (err: unknown): string => {
      const message = err instanceof Error ? err.message : String(err);
      if (message === WEB_BASE_URL_REQUIRED_ERROR) {
        return t("auth.extension.errorBaseUrlRequired");
      }
      if (message === WEB_BASE_URL_SCHEME_ERROR) {
        return t("auth.extension.errorBaseUrlScheme");
      }
      if (message === WEB_BASE_URL_UNREACHABLE_ERROR) {
        return t("auth.extension.errorServerUnreachable");
      }
      return message;
    },
    [t],
  );

  const onLocaleChange = (next: WebLocale) => {
    setLocale(next);
    void writeStoredExtensionLocale(next);
  };

  useEffect(() => {
    void loadExtensionLocale().then((stored) => {
      setLocale((current) => (current === stored ? current : stored));
    });
  }, []);

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

  const loadIdentity = useCallback(async (apiBaseUrl: string, accessToken: string, userId?: string) => {
    try {
      const core = createCoreClient(apiBaseUrl, accessToken);
      const account = await core.getAccountProfile();
      setIdentity({
        email: account.email ?? "",
        firstName: account.first_name ?? "",
        lastName: account.last_name ?? "",
      });
      if (userId) {
        const idleMs = await resolveExtensionIdleLockMs({
          userId,
          serverIdleLockSeconds: account.vault_idle_lock_seconds,
        });
        setVaultIdleLockMs(idleMs);
      } else {
        setVaultIdleLockMs(vaultIdleLockMsFromServerSeconds(account.vault_idle_lock_seconds));
      }
      return account;
    } catch (err: unknown) {
      if (isUnauthorizedApiError(err)) {
        throw err;
      }
      setIdentity(null);
      return null;
    }
  }, []);

  const tryRestoreUnlockSession = useCallback(async (userId: string): Promise<boolean> => {
    const fresh = await readExtensionUnlockSessionIfFresh(userId);
    // Share C must exist to restore; null means incomplete / mismatched session — do not unlock.
    if (!fresh?.passwordShareC) {
      return false;
    }
    const bundle = await readExtensionVaultBundle(userId);
    if (!bundle?.encrypted_private_key?.payload) {
      return false;
    }
    // Popup JS context is destroyed on close. Session restore must re-init WASM
    // before folder metadata / attachment decrypt (unlike unlock-with-MP, which
    // already calls initExtensionCrypto inside unlockExtensionVault).
    try {
      await initExtensionCrypto();
    } catch (err: unknown) {
      console.error("[extension] crypto init failed on session restore", err);
      return false;
    }
    const secrets: UnlockWithMasterPasswordResult = {
      vaultKey: fresh.vaultKey,
      passwordShareC: fresh.passwordShareC,
    };
    wipeUnlockSecrets(unlockSecretsRef.current);
    unlockSecretsRef.current = secrets;
    setUnlockSecrets(secrets);
    setEncryptedPrivateKeyPayload(bundle.encrypted_private_key.payload);
    setVaultIdleLockMs(fresh.idleLockMs);
    setMasterPassword("");
    void applyExtensionStoredTheme();
    setScreen("vault");
    void browser.runtime.sendMessage({ type: AUTOFILL_MSG.unlocked }).catch(() => {
      /* popup may be the only listener besides SW */
    });
    return true;
  }, []);

  const applyServerPreference = useCallback((mode: ExtensionHostMode, webBaseUrl: string) => {
    setHostMode(mode);
    setBaseUrlInput(mode === "saas" ? OKKEY_SAAS_WEB_BASE_URL : webBaseUrl);
  }, []);

  const resetToServerAfterWipe = useCallback(async () => {
    setProfile(null);
    setSession(null);
    setTrust(null);
    setIdentity(null);
    setMasterPassword("");
    setUnlockSecrets(null);
    setEncryptedPrivateKeyPayload(null);
    const lastServer = await readLastServer();
    if (lastServer) {
      const mode: ExtensionHostMode =
        !ENABLE_SAAS_SIGNIN || lastServer.hostMode !== "saas" ? "self-hosted" : "saas";
      applyServerPreference(
        mode,
        mode === "self-hosted"
          ? lastServer.hostMode === "self-hosted"
            ? lastServer.webBaseUrl
            : ""
          : OKKEY_SAAS_WEB_BASE_URL,
      );
    } else if (ENABLE_SAAS_SIGNIN) {
      applyServerPreference("saas", OKKEY_SAAS_WEB_BASE_URL);
    } else {
      applyServerPreference("self-hosted", "");
    }
    setScreen("server");
  }, [applyServerPreference]);

  const wipeLocalAndReset = useCallback(async () => {
    wipeUnlockSecrets(unlockSecretsRef.current);
    unlockSecretsRef.current = null;
    setUnlockSecrets(null);
    setEncryptedPrivateKeyPayload(null);
    // Preserve device signing keys across 401 / account wipe so re-login can still
    // prove bind-session. Blocked/rejected paths clear keys inside deviceTrust.
    await wipeAllExtensionData();
    await resetToServerAfterWipe();
  }, [resetToServerAfterWipe]);

  const applyTrustSnapshot = useCallback(
    async (snapshot: DeviceTrustSnapshot, userId?: string) => {
      if (snapshot.status === "blocked" || snapshot.status === "rejected") {
        toast.error(
          snapshot.status === "blocked"
            ? t("web.devicePending.blockedTitle")
            : t("web.devicePending.rejectedTitle"),
        );
        // deviceTrust already cleared the signing key for blocked/rejected.
        await wipeLocalAndReset();
        return;
      }
      setTrust(snapshot);
      if (snapshot.status === "trusted") {
        if (userId) {
          const restored = await tryRestoreUnlockSession(userId);
          if (restored) {
            return;
          }
        }
        setScreen("unlock");
      } else if (snapshot.status === "error") {
        // Drop unlock / pending-save material; keep account session so the user can retry.
        wipeUnlockSecrets(unlockSecretsRef.current);
        unlockSecretsRef.current = null;
        setUnlockSecrets(null);
        setEncryptedPrivateKeyPayload(null);
        void clearExtensionSessionArea();
        const message = snapshot.errorMessage ?? "Device registration failed";
        setError(message);
        toast.error(message);
        setScreen("error");
      } else if (snapshot.status === "pending" || snapshot.status === "checking") {
        // Defense in depth: unlock secrets must not survive lost device trust
        // (e.g. web revoke → re-pending) even if resolve already cleared session.
        wipeUnlockSecrets(unlockSecretsRef.current);
        unlockSecretsRef.current = null;
        setUnlockSecrets(null);
        setEncryptedPrivateKeyPayload(null);
        void clearExtensionSessionArea();
        setScreen("pending");
      } else {
        wipeUnlockSecrets(unlockSecretsRef.current);
        unlockSecretsRef.current = null;
        setUnlockSecrets(null);
        setEncryptedPrivateKeyPayload(null);
        void clearExtensionSessionArea();
        setScreen("pending");
      }
    },
    [t, tryRestoreUnlockSession, wipeLocalAndReset],
  );

  const refreshTrust = useCallback(
    async (apiBaseUrl: string, accessToken: string, userId?: string) => {
      try {
        const core = createCoreClient(apiBaseUrl, accessToken);
        const snapshot = await resolveExtensionDeviceTrust(core);
        await applyTrustSnapshot(snapshot, userId);
        void loadIdentity(apiBaseUrl, accessToken, userId).catch(async (err: unknown) => {
          if (isUnauthorizedApiError(err)) {
            await wipeLocalAndReset();
          }
        });
      } catch (err: unknown) {
        if (isUnauthorizedApiError(err)) {
          await wipeLocalAndReset();
          return;
        }
        throw err;
      }
    },
    [applyTrustSnapshot, loadIdentity, wipeLocalAndReset],
  );

  useEffect(() => {
    void applyExtensionStoredTheme();
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function boot(): Promise<void> {
      void applyExtensionStoredTheme();
      const existingProfile = await readProfile();
      const existingSession = await readSession();
      const lastServer = await readLastServer();
      if (cancelled) return;
      if (existingProfile) {
        setProfile(existingProfile);
        const mode: ExtensionHostMode =
          !ENABLE_SAAS_SIGNIN || existingProfile.webBaseUrl !== OKKEY_SAAS_WEB_BASE_URL
            ? "self-hosted"
            : "saas";
        applyServerPreference(mode, existingProfile.webBaseUrl);
      } else if (lastServer) {
        const mode: ExtensionHostMode =
          !ENABLE_SAAS_SIGNIN || lastServer.hostMode !== "saas" ? "self-hosted" : "saas";
        applyServerPreference(
          mode,
          mode === "self-hosted"
            ? lastServer.hostMode === "self-hosted"
              ? lastServer.webBaseUrl
              : ""
            : OKKEY_SAAS_WEB_BASE_URL,
        );
      } else if (!ENABLE_SAAS_SIGNIN) {
        applyServerPreference("self-hosted", "");
      }
      if (existingProfile && existingSession) {
        setSession(existingSession);
        await refreshTrust(
          existingProfile.apiBaseUrl,
          existingSession.access_token,
          existingSession.user_id,
        );
        return;
      }
      setScreen("server");
    }
    void boot();
    return () => {
      cancelled = true;
      // Do NOT clearExtensionUnlockSession or wipeUnlockSecrets on popup unmount —
      // closing the popup must leave the session in chrome.storage.session for restore.
    };
  }, [applyServerPreference, refreshTrust]);

  // Tell the background SW the popup is open (resets idle) / closed (starts idle or locks).
  useEffect(() => {
    const port = browser.runtime.connect({ name: POPUP_PORT_NAME });
    void flushPendingClipboardClearInPage();
    return () => {
      try {
        port.disconnect();
      } catch {
        /* ignore */
      }
    };
  }, []);

  // Idle lock while vault is open. Background alarms cover closed-popup idle.
  // Do not use visibilitychange: popup close hides the document and is not sleep.
  useEffect(() => {
    if (screen !== "vault" || !session) {
      return;
    }
    const userId = session.user_id;
    const tick = () => {
      void extensionUnlockSessionExceededIdle(userId).then((exceeded) => {
        if (exceeded) {
          wipeUnlockSecrets(unlockSecretsRef.current);
          unlockSecretsRef.current = null;
          setUnlockSecrets(null);
          setEncryptedPrivateKeyPayload(null);
          setMasterPassword("");
          void clearExtensionUnlockSession();
          setScreen("unlock");
        }
      });
    };
    const timer = window.setInterval(tick, Math.min(5_000, Math.max(1_000, vaultIdleLockMs / 12)));
    return () => window.clearInterval(timer);
  }, [screen, session, vaultIdleLockMs]);

  // Background may clear the unlock session (device lock, idle alarm, lock-on-close).
  useEffect(() => {
    const area = browser.storage?.session;
    if (!area?.onChanged) {
      return;
    }
    const onChanged: Parameters<typeof area.onChanged.addListener>[0] = (changes) => {
      const change = changes[VAULT_UNLOCK_SESSION_STORAGE_KEY];
      if (!change || change.newValue != null) {
        return;
      }
      if (screen !== "vault") {
        return;
      }
      wipeUnlockSecrets(unlockSecretsRef.current);
      unlockSecretsRef.current = null;
      setUnlockSecrets(null);
      setEncryptedPrivateKeyPayload(null);
      setMasterPassword("");
      setScreen("unlock");
    };
    area.onChanged.addListener(onChanged);
    return () => {
      area.onChanged.removeListener(onChanged);
    };
  }, [screen]);

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

  // Prefer PIN when enabled on this device (same as web unlock).
  useEffect(() => {
    if (screen !== "unlock" || !session) {
      return;
    }
    let cancelled = false;
    void (async () => {
      const prefs = await readExtensionDevicePrefs(session.user_id);
      const wrap = prefs.pinEnabled ? await readExtensionPinUnlockWrap(session.user_id) : null;
      if (cancelled) {
        return;
      }
      const enabled = Boolean(prefs.pinEnabled && wrap);
      setPinEnabled(enabled);
      setUnlockMode(enabled ? "pin" : "master");
      setPinDigits(emptyPinDigits());
      setPinError(null);
      pinAutoSubmitEnabledRef.current = true;
    })();
    return () => {
      cancelled = true;
    };
  }, [screen, session]);

  // Locked vault: focus PIN / master password on open, but do not steal focus
  // if the user (or assistive tech) already focused something else in the popup.
  useEffect(() => {
    if (screen !== "unlock") {
      return;
    }
    const id = window.setTimeout(() => {
      const input =
        unlockMode === "pin" ? pinInputsRef.current[0] : masterPasswordInputRef.current;
      if (!input) {
        return;
      }
      const active = document.activeElement;
      if (
        active instanceof HTMLElement &&
        active !== document.body &&
        active !== document.documentElement &&
        active !== input &&
        document.documentElement.contains(active)
      ) {
        return;
      }
      input.focus({ preventScroll: true });
    }, 0);
    return () => window.clearTimeout(id);
  }, [screen, unlockMode]);

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
        await applyTrustSnapshot(snapshot, session.user_id);
      });
    }, 4_000);
    return () => window.clearInterval(timer);
  }, [screen, profile, session, trust?.deviceId, applyTrustSnapshot]);

  const onSaveServerAndLogin = async (event?: FormEvent) => {
    event?.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const effectiveHostMode: ExtensionHostMode =
        ENABLE_SAAS_SIGNIN && hostMode === "saas" ? "saas" : "self-hosted";
      const rawUrl =
        effectiveHostMode === "saas" ? OKKEY_SAAS_WEB_BASE_URL : baseUrlInput;
      const webBaseUrl = normalizeWebBaseUrl(rawUrl);
      const apiBaseUrl = resolveApiBaseFromWebBase(webBaseUrl);
      // Reachability before PKCE / auth tab — avoids chrome-error:// and stuck signing-in.
      await probeWebBaseUrl(webBaseUrl);
      const previous = await readProfile();
      if (previous && previous.webBaseUrl !== webBaseUrl) {
        const priorToken = session?.access_token ?? null;
        const priorApiBase = previous.apiBaseUrl;
        const priorDeviceId = trust?.deviceId ?? (await readDeviceId());
        // Local wipe first so unlock / pending-save cannot survive a hung revoke.
        await wipeAllExtensionData();
        if (priorToken) {
          const core = createCoreClient(priorApiBase, priorToken);
          await revokeExtensionDeviceBestEffort(core, priorDeviceId);
        }
      }
      const nextProfile: ExtensionProfile = {
        webBaseUrl,
        apiBaseUrl,
        updatedAt: Date.now(),
      };
      await writeProfile(nextProfile);
      await writeLastServer({
        hostMode: effectiveHostMode,
        webBaseUrl:
          effectiveHostMode === "self-hosted" ? webBaseUrl : OKKEY_SAAS_WEB_BASE_URL,
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
      const message = formatServerUrlError(err);
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
    void clearExtensionUnlockSession();
    setScreen("unlock");
  }, []);

  const onLogout = async () => {
    const priorProfile = profile;
    const priorSession = session;
    const priorDeviceId = trust?.deviceId ?? (await readDeviceId());
    wipeUnlockSecrets(unlockSecretsRef.current);
    unlockSecretsRef.current = null;
    setUnlockSecrets(null);
    setEncryptedPrivateKeyPayload(null);
    // Wipe account/session state first; keep device signing keys unless revoke succeeds
    // so a failed revoke still allows proof-before-bind on the next login.
    await wipeAllExtensionData();
    await resetToServerAfterWipe();
    if (priorProfile && priorSession) {
      const core = createCoreClient(priorProfile.apiBaseUrl, priorSession.access_token);
      await revokeExtensionDeviceBestEffort(core, priorDeviceId);
      // Device row revoked — seed must not survive for a 409 re-register.
      await clearExtensionDeviceSigningKey();
    }
  };

  const onRetryRegistration = async () => {
    if (!profile || !session || retrying) {
      return;
    }
    setRetrying(true);
    try {
      const core = createCoreClient(profile.apiBaseUrl, session.access_token);
      const snapshot = await retryExtensionDeviceRegistration(core);
      await applyTrustSnapshot(snapshot, session.user_id);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      toast.error(message);
      setScreen("error");
    } finally {
      setRetrying(false);
    }
  };

  const finishUnlockWithSecrets = useCallback(
    async (secrets: UnlockWithMasterPasswordResult) => {
      if (!profile || !session) {
        wipeUnlockSecrets(secrets);
        return false;
      }
      const core = createCoreClient(profile.apiBaseUrl, session.access_token);
      await ensureExtensionVaultBundle({ core, userId: session.user_id });
      const bundle = await readExtensionVaultBundle(session.user_id);
      if (!bundle?.encrypted_private_key?.payload) {
        wipeUnlockSecrets(secrets);
        toast.error(t("unlock.errorTitle"), { description: t("unlock.errorNoLocalVault") });
        return false;
      }
      let idleMs = vaultIdleLockMs;
      try {
        const account = await core.getAccountProfile();
        idleMs = await resolveExtensionIdleLockMs({
          userId: session.user_id,
          serverIdleLockSeconds: account.vault_idle_lock_seconds,
        });
        setVaultIdleLockMs(idleMs);
        setIdentity({
          email: account.email ?? "",
          firstName: account.first_name ?? "",
          lastName: account.last_name ?? "",
        });
      } catch {
        /* keep previous idle / identity */
      }
      wipeUnlockSecrets(unlockSecretsRef.current);
      unlockSecretsRef.current = secrets;
      setUnlockSecrets(secrets);
      setEncryptedPrivateKeyPayload(bundle.encrypted_private_key.payload);
      setMasterPassword("");
      setPinDigits(emptyPinDigits());
      setPinError(null);
      await persistExtensionUnlockSession({
        userId: session.user_id,
        secrets,
        idleLockMs: idleMs,
      });
      void applyExtensionStoredTheme();
      setScreen("vault");
      void browser.runtime.sendMessage({ type: AUTOFILL_MSG.unlocked }).catch(() => {
        /* best-effort */
      });
      void buildVaultUnlockAttestation({
        userId: session.user_id,
        vaultKey: secrets.vaultKey,
        encryptedPrivateKeyPayloadB64: bundle.encrypted_private_key.payload,
      })
        .then((attestation) => core.recordVaultUnlock(attestation))
        .catch(() => {
          /* best-effort */
        });
      return true;
    },
    [profile, session, t, vaultIdleLockMs],
  );

  const setPinDigitAt = useCallback((index: number, char: string) => {
    const d = char.replace(/\D/g, "").slice(-1);
    setPinDigits((prev) => {
      const next = [...prev];
      next[index] = d;
      return next;
    });
    if (d && index < PIN_LENGTH - 1) {
      pinInputsRef.current[index + 1]?.focus();
    }
  }, []);

  const handlePinCellChange = useCallback(
    (index: number, value: string) => {
      setPinError(null);
      if (value.length > 1) {
        const pasted = value.replace(/\D/g, "").slice(0, PIN_LENGTH);
        if (pasted) {
          setPinDigits(Array.from({ length: PIN_LENGTH }, (_, i) => pasted[i] ?? ""));
          pinInputsRef.current[Math.min(pasted.length, PIN_LENGTH - 1)]?.focus();
        }
        return;
      }
      setPinDigitAt(index, value);
    },
    [setPinDigitAt],
  );

  const handlePinKeyDown = useCallback(
    (index: number, e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Backspace" && !pinDigits[index] && index > 0) {
        pinInputsRef.current[index - 1]?.focus();
      }
      if (e.key === "ArrowLeft" && index > 0) {
        pinInputsRef.current[index - 1]?.focus();
      }
      if (e.key === "ArrowRight" && index < PIN_LENGTH - 1) {
        pinInputsRef.current[index + 1]?.focus();
      }
    },
    [pinDigits],
  );

  const handlePinPaste = useCallback((e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    setPinError(null);
    const text = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, PIN_LENGTH);
    if (!text) {
      return;
    }
    setPinDigits(Array.from({ length: PIN_LENGTH }, (_, i) => text[i] ?? ""));
    pinInputsRef.current[Math.min(text.length, PIN_LENGTH - 1)]?.focus();
  }, []);

  const submitPinUnlock = useCallback(async () => {
    if (!profile || !session || pinSubmitInFlightRef.current || unlockBusy) {
      return;
    }
    const code = pinDigits.join("");
    if (code.length !== PIN_LENGTH) {
      return;
    }
    pinSubmitInFlightRef.current = true;
    setUnlockBusy(true);
    setPinError(null);
    try {
      if (isPinLocked(session.user_id)) {
        setPinError(t("unlock.pinLocked"));
        return;
      }
      const wrap = await readExtensionPinUnlockWrap(session.user_id);
      if (!wrap) {
        setPinEnabled(false);
        setUnlockMode("master");
        return;
      }
      await initExtensionCrypto();
      const pinBytes = new TextEncoder().encode(code);
      try {
        const unlocked = await unwrapUnlockMaterialWithPin({ wrap, pinUtf8: pinBytes });
        clearPinFailures(session.user_id);
        const secrets: UnlockWithMasterPasswordResult = {
          vaultKey: unlocked.vaultKey,
          passwordShareC: unlocked.passwordShareC,
        };
        await finishUnlockWithSecrets(secrets);
      } catch {
        const result = recordPinFailure(session.user_id);
        setPinError(result.locked ? t("unlock.pinLocked") : t("unlock.pinIncorrect"));
        setPinDigits(emptyPinDigits());
        window.setTimeout(() => pinInputsRef.current[0]?.focus(), 0);
      } finally {
        wipeBytes(pinBytes);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      toast.error(t("unlock.errorTitle"), { description: message });
    } finally {
      pinSubmitInFlightRef.current = false;
      setUnlockBusy(false);
    }
  }, [finishUnlockWithSecrets, pinDigits, profile, session, t, unlockBusy]);

  useEffect(() => {
    if (screen !== "unlock" || unlockMode !== "pin" || !pinAutoSubmitEnabledRef.current || unlockBusy) {
      return;
    }
    if (pinDigits.join("").length !== PIN_LENGTH) {
      return;
    }
    pinAutoSubmitEnabledRef.current = false;
    void submitPinUnlock();
  }, [screen, unlockMode, pinDigits, unlockBusy, submitPinUnlock]);

  const onUnlockSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!profile || !session || unlockBusy) {
      return;
    }
    if (unlockMode === "pin") {
      pinAutoSubmitEnabledRef.current = false;
      void submitPinUnlock();
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
        await finishUnlockWithSecrets(secrets);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        toast.error(t("unlock.errorTitle"), { description: message });
      } finally {
        setUnlockBusy(false);
      }
    })();
  };

  const shellLogo = <OkkeyLogoMark className="h-[60px] w-[61px]" />;
  const vaultCore = useMemo(() => {
    if (!profile || !session) {
      return null;
    }
    return createCoreClient(profile.apiBaseUrl, session.access_token);
  }, [profile, session]);
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
              {ENABLE_SAAS_SIGNIN ? (
                <div
                  className="grid grid-cols-2 gap-1 rounded-lg border border-border bg-secondary/60 p-1"
                  role="tablist"
                  aria-label={t("auth.extension.hostModeLabel")}
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
                    {t("auth.extension.hostSaas")}
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
                    {t("auth.extension.hostSelfHosted")}
                  </button>
                </div>
              ) : null}

              {hostMode === "self-hosted" || !ENABLE_SAAS_SIGNIN ? (
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

              <Button type="submit" className="w-full" disabled={busy} aria-busy={busy || undefined}>
                {busy ? <Spinner className="size-4" /> : null}
                {t("auth.email.submit")}
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
                    await refreshTrust(
                      nextProfile.apiBaseUrl,
                      nextSession.access_token,
                      nextSession.user_id,
                    );
                  }
                })();
              }}
            >
              {t("auth.extension.signingInContinue")}
            </Button>
            <Button type="button" variant="ghost" className="w-full" onClick={() => setScreen("server")}>
              {t("auth.extension.signingInBack")}
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
              <Button
                type="button"
                disabled={retrying}
                aria-busy={retrying || undefined}
                onClick={() => void onRetryRegistration()}
              >
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
              void (async () => {
                await wipeLocalAndReset();
                setError(null);
              })();
            }}
          >
            {t("auth.extension.signingInBack")}
          </Button>
        </AuthShell>
      </PopupFrame>
    );
  }

  if (screen === "vault" && profile && session && unlockSecrets && encryptedPrivateKeyPayload && vaultCore) {
    return (
      <PopupFrame>
        <VaultPopup
          core={vaultCore}
          userId={session.user_id}
          accessToken={session.access_token}
          apiBaseUrl={profile.apiBaseUrl}
          webBaseUrl={profile.webBaseUrl}
          secrets={unlockSecrets}
          encryptedPrivateKeyPayload={encryptedPrivateKeyPayload}
          identity={identity}
          locale={locale}
          onLocaleChange={onLocaleChange}
          signOutLabel={t("unlock.signOut")}
          onSignOut={() => void onLogout()}
          onUnauthorized={() => void wipeLocalAndReset()}
          onChangeServer={() => void onLogout()}
          onLock={lockVault}
          idleLockMs={vaultIdleLockMs}
          onIdleLockMsChange={(ms) => {
            setVaultIdleLockMs(ms);
            if (session && unlockSecrets) {
              void persistExtensionUnlockSession({
                userId: session.user_id,
                secrets: unlockSecrets,
                idleLockMs: ms,
              });
            }
          }}
          t={t}
        />
      </PopupFrame>
    );
  }

  const pinLocked = session?.user_id ? isPinLocked(session.user_id) : false;
  const pinFieldsDisabled = unlockBusy || pinLocked;
  const unlockSubmitDisabled =
    unlockBusy ||
    (unlockMode === "pin" ? pinValue.length !== PIN_LENGTH || pinLocked : masterPassword.length === 0);

  return (
    <PopupFrame>
      <AuthShell compact logo={shellLogo} title={t("unlock.title")} topRight={languageSelect}>
        <form onSubmit={onUnlockSubmit} className="flex w-full flex-col gap-6" noValidate>
          {identityBar}

          {unlockMode === "pin" ? (
            <div className="flex w-full flex-col gap-3">
              <div className="flex items-center gap-2">
                <span
                  id={pinLabelId}
                  className="min-w-0 flex-1 okkey-small font-medium text-copy-primary"
                >
                  {t("unlock.pin")}
                </span>
                <button
                  type="button"
                  className="okkey-small shrink-0 text-copy-secondary underline decoration-solid underline-offset-2 hover:text-copy-primary"
                  disabled={unlockBusy}
                  onClick={() => {
                    setPinDigits(emptyPinDigits());
                    setMasterPassword("");
                    setPinError(null);
                    setUnlockMode("master");
                  }}
                >
                  {t("unlock.useMasterPassword")}
                </button>
              </div>
              <div role="group" aria-labelledby={pinLabelId} className="grid w-full grid-cols-6 gap-2.5">
                {pinDigits.map((digit, index) => (
                  <Input
                    key={index}
                    ref={(el) => {
                      pinInputsRef.current[index] = el;
                    }}
                    type="password"
                    inputMode="numeric"
                    autoComplete={index === 0 ? "one-time-code" : "off"}
                    name={`unlock-pin-${index}`}
                    maxLength={1}
                    value={digit}
                    disabled={pinFieldsDisabled}
                    aria-label={t("auth.otp.digitAriaLabel", { n: index + 1, total: PIN_LENGTH })}
                    className={pinCellClassName}
                    onChange={(event) => handlePinCellChange(index, event.target.value)}
                    onKeyDown={(event) => handlePinKeyDown(index, event)}
                    onPaste={index === 0 ? handlePinPaste : undefined}
                  />
                ))}
              </div>
            </div>
          ) : null}

          {unlockMode === "master" ? (
            <div className="flex w-full flex-col gap-3">
              <div className="flex items-center gap-2">
                <label
                  htmlFor="unlock-master-password"
                  className="min-w-0 flex-1 okkey-small font-medium text-copy-primary"
                >
                  {t("unlock.masterPassword")}
                </label>
                {pinEnabled ? (
                  <button
                    type="button"
                    className="okkey-small shrink-0 text-copy-secondary underline decoration-solid underline-offset-2 hover:text-copy-primary"
                    disabled={unlockBusy}
                    onClick={() => {
                      setPinDigits(emptyPinDigits());
                      setMasterPassword("");
                      setPinError(null);
                      pinAutoSubmitEnabledRef.current = true;
                      setUnlockMode("pin");
                    }}
                  >
                    {t("unlock.usePin")}
                  </button>
                ) : null}
              </div>
              <Input
                ref={masterPasswordInputRef}
                id="unlock-master-password"
                name="password"
                type="password"
                autoComplete="current-password"
                value={masterPassword}
                onChange={(e) => setMasterPassword(e.target.value)}
                disabled={unlockBusy}
              />
            </div>
          ) : null}

          {pinError ? (
            <p className="okkey-small text-destructive" role="alert">
              {pinError}
            </p>
          ) : null}

          <Button
            type="submit"
            variant="default"
            className="w-full"
            disabled={unlockSubmitDisabled}
            aria-busy={unlockBusy || undefined}
          >
            {unlockBusy ? <Spinner className="size-4" /> : null}
            {t("unlock.submit")}
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
