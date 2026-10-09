import type { AccessTokenResponseDto, DeviceListItemDto } from "@okkey/types";
import { AuthClient } from "@okkey/auth";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type Context,
  type MutableRefObject,
  type ReactNode,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  decryptUserIdentityFromEncryptedBlob,
  reconstructVaultKeyWithMasterPassword,
  rebalanceServerShareForNewPassword,
  derivePasswordShareC,
  wipeBytes,
} from "@okkey/crypto";

import { createAuthSdk, createAuthenticatedCoreClient, createPublicApiClient } from "../api/client";
import { clearSettingsPopupCache } from "../components/settings/settingsPopupCache";
import { migratePersonalFoldersAfterPasswordChange } from "../folders/migratePersonalFoldersAfterPasswordChange";
import { accountLockWithRedirectQuery } from "../routes/paths";
import { base64ToBytes, bytesToBase64 } from "./base64";
import { getOrCreateDeviceFingerprint } from "./deviceFingerprint";
import {
  pollDeviceTrust,
  registerCurrentBrowserDevice,
  resolveDeviceTrust,
  type DeviceTrustStatus,
} from "./deviceTrust";
import {
  clearPendingVaultBundle,
  clearVaultBundleSessionMirror,
  mapVaultUnlockBootstrapToStored,
  migrateLegacyVaultBundleToUser,
  readVaultBundle,
  writeVaultBundle,
  type StoredVaultBundle,
} from "./localVaultBundle";
import {
  bridgeLocalProfileAfterLogin,
  clearSessionLocalProfile,
  readLocalProfile,
  writeLocalProfile,
  type LocalProfile,
} from "./localProfileStorage";
import { normalizeAccountProfileWire } from "./normalizeAccountProfileWire";
import {
  clearStoredSession,
  readStoredSession,
  writeStoredSession,
} from "./sessionAuthStorage";
import { clearStoredCurrentWorkspaceId } from "./workspaceStorage";
import { clearDeviceUnlockSecrets } from "./vaultDeviceUnlockStore";
import { patchVaultDevicePrefs, readVaultDevicePrefs } from "./vaultDevicePrefs";
import { scheduleClipboardClearAfterCopy } from "./vaultClipboardClear";
import { DEFAULT_VAULT_IDLE_LOCK_MS, vaultIdleLockMsFromServerSeconds } from "./vaultIdleLockMs";
import {
  clearVaultUnlockSession,
  persistVaultUnlockSession,
  readInitialTabVaultSession,
  readVaultUnlockSessionIfFresh,
  touchVaultUnlockSession,
  vaultUnlockSessionExceededIdle,
} from "./vaultUnlockSessionStorage";
import { useLocale } from "../locale/LocaleContext";

export const DEFAULT_IDLE_MS = DEFAULT_VAULT_IDLE_LOCK_MS;

export type AuthVaultContextValue = {
  accessToken: string | null;
  userId: string | null;
  vaultUnlocked: boolean;
  /** 32-byte password share C while vault is unlocked (for workspace personal metadata key). */
  passwordShareC: Uint8Array | null;
  /** 32-byte account vault key while unlocked (personal vault item encryption). */
  vaultKey: Uint8Array | null;
  pendingEmail: string | null;
  emailChallengeId: string | null;
  /** ISO time from last start/resend until another resend is allowed */
  emailResendAvailableAt: string | null;
  registrationAuthStateId: string | null;
  twoFactorAuthStateId: string | null;
  authClient: AuthClient;
  profile: LocalProfile | null;
  setEmailChallenge: (email: string, challengeId: string, resendAvailableAt?: string) => void;
  /** Clears OTP / resend state after login or registration (profile email is unchanged). */
  clearEmailLoginFlow: () => void;
  setRegistrationAuthStateId: (id: string | null) => void;
  setTwoFactorAuthStateId: (id: string | null) => void;
  applyAccessTokenResponse: (dto: AccessTokenResponseDto) => void;
  logout: () => void;
  lockVault: () => void;
  touchActivity: () => void;
  saveVaultBundle: (bundle: StoredVaultBundle) => void;
  updateLocalProfile: (patch: { email?: string; firstName?: string | null; lastName?: string | null }) => void;
  tryUnlockWithMasterPassword: (masterPassword: string) => Promise<boolean>;
  /** Re-fetch A+B from server when local vault bundle is missing (trusted device). */
  ensureVaultBundleForUnlock: () => Promise<boolean>;
  /** Apply unlock material from PIN / biometric unwrap (VaultKey + C already verified). */
  applyUnlockedSecrets: (vaultKey: Uint8Array, passwordShareC: Uint8Array) => void;
  /** Verify master password without changing unlock state (for section re-auth). */
  verifyMasterPassword: (masterPassword: string) => Promise<boolean>;
  changeMasterPassword: (input: {
    oldPassword: string;
    newPassword: string;
    workspaceIds: string[];
  }) => Promise<{ ok: true; masterPasswordChangedAt: string } | { ok: false; error: string }>;
  setVaultIdleLockMs: (ms: number) => void;
  masterPasswordChangedAt: string | null;
  hasVaultBundle: boolean;
  /** While true, split-key is being fetched from the API after an empty local vault bundle. */
  vaultUnlockBootstrapLoading: boolean;
  /** Idle interval before vault locks (ms), from device-local prefs (migrated from server once). */
  vaultIdleLockMs: number;
  /** Current browser device trust vs account devices (gates unlock). */
  deviceTrustStatus: DeviceTrustStatus | "idle";
  /** When status is blocked; null means permanently blocked. */
  deviceBlockedUntil: string | null;
  /** Server device id for this browser when known. */
  currentDeviceId: string | null;
  /** Trusted devices that can approve a pending login on this browser. */
  deviceApprovers: DeviceListItemDto[];
  /** Re-check pending/rejected device status (poll helper for wait UI). */
  refreshDeviceTrust: () => Promise<void>;
  /** Force local blocked state (e.g. recovery closed_reason=blocked before poll catches up). */
  markDeviceBlockedForever: () => void;
  /** After rejection: register again and wait for a new approval. */
  retryDeviceRegistration: () => Promise<void>;
};

/**
 * HMR-safe Context identity. Vite Fast Refresh can re-evaluate this module while
 * children still hold a stale module binding; a new createContext() then makes
 * useAuthVault() miss the Provider ("must be used within AuthVaultProvider").
 * Pin the Context object on globalThis (and import.meta.hot.data) so Provider and
 * consumers always share the same identity across soft refreshes.
 */
const AUTH_VAULT_CONTEXT_GLOBAL_KEY = "__okkey_AuthVaultContext__" as const;

type AuthVaultContextGlobal = typeof globalThis & {
  [AUTH_VAULT_CONTEXT_GLOBAL_KEY]?: Context<AuthVaultContextValue | null>;
};

function createAuthVaultContext(): Context<AuthVaultContextValue | null> {
  const fromHot = import.meta.hot?.data?.authVaultContext as
    | Context<AuthVaultContextValue | null>
    | undefined;
  if (fromHot) {
    return fromHot;
  }
  const g = globalThis as AuthVaultContextGlobal;
  if (!g[AUTH_VAULT_CONTEXT_GLOBAL_KEY]) {
    g[AUTH_VAULT_CONTEXT_GLOBAL_KEY] = createContext<AuthVaultContextValue | null>(null);
  }
  return g[AUTH_VAULT_CONTEXT_GLOBAL_KEY];
}

const AuthVaultContext = createAuthVaultContext();

if (import.meta.hot) {
  import.meta.hot.data.authVaultContext = AuthVaultContext;
  (globalThis as AuthVaultContextGlobal)[AUTH_VAULT_CONTEXT_GLOBAL_KEY] = AuthVaultContext;
}

function useActivityListeners(touch: () => void): void {
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible") {
        touch();
      }
    };
    const opts = { capture: true };
    window.addEventListener("pointerdown", touch, opts);
    window.addEventListener("keydown", touch, opts);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("pointerdown", touch, opts);
      window.removeEventListener("keydown", touch, opts);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [touch]);
}

function deviceApproversEqual(a: DeviceListItemDto[], b: DeviceListItemDto[]): boolean {
  if (a === b) {
    return true;
  }
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i += 1) {
    const left = a[i];
    const right = b[i];
    if (
      !left ||
      !right ||
      left.device_id !== right.device_id ||
      left.device_name !== right.device_name ||
      left.status !== right.status ||
      left.platform !== right.platform ||
      left.is_current !== right.is_current ||
      left.approval_expires_at !== right.approval_expires_at ||
      left.blocked_until !== right.blocked_until
    ) {
      return false;
    }
  }
  return true;
}

function IdleLockWatcher({
  enabled,
  idleMs,
  lastActivityRef,
  onIdle,
}: {
  enabled: boolean;
  idleMs: number;
  lastActivityRef: React.MutableRefObject<number>;
  onIdle: () => void;
}) {
  useEffect(() => {
    if (!enabled) {
      return;
    }
    const id = window.setInterval(() => {
      if (Date.now() - lastActivityRef.current >= idleMs) {
        onIdle();
      }
    }, 3000);
    return () => window.clearInterval(id);
  }, [enabled, idleMs, lastActivityRef, onIdle]);
  return null;
}

function VaultIdleLockBridge({
  accessToken,
  userId,
  vaultUnlocked,
  vaultIdleLockMs,
  lockVault,
  touchActivity,
  lastActivityRef,
}: {
  accessToken: string | null;
  userId: string | null;
  vaultUnlocked: boolean;
  vaultIdleLockMs: number;
  lockVault: () => void;
  touchActivity: () => void;
  lastActivityRef: MutableRefObject<number>;
}) {
  const navigate = useNavigate();
  const location = useLocation();

  useActivityListeners(touchActivity);

  const navigateToLock = useCallback(() => {
    if (!accessToken || !vaultUnlocked) {
      return;
    }
    lockVault();
    const redirect = encodeURIComponent(`${location.pathname}${location.search}`);
    navigate(accountLockWithRedirectQuery(redirect), { replace: true });
  }, [accessToken, vaultUnlocked, lockVault, navigate, location.pathname, location.search]);

  const handleIdle = useCallback(() => {
    navigateToLock();
  }, [navigateToLock]);

  useEffect(() => {
    if (!accessToken || !vaultUnlocked || !userId) {
      return;
    }
    const onVis = () => {
      if (document.visibilityState !== "hidden") {
        return;
      }
      if (!readVaultDevicePrefs(userId).lockOnDeviceSleep) {
        return;
      }
      navigateToLock();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [accessToken, userId, vaultUnlocked, navigateToLock]);

  return (
    <IdleLockWatcher
      enabled={Boolean(accessToken && vaultUnlocked)}
      idleMs={vaultIdleLockMs}
      lastActivityRef={lastActivityRef}
      onIdle={handleIdle}
    />
  );
}

export function AuthVaultProvider({ children }: { children: ReactNode }) {
  const publicApi = useMemo(() => createPublicApiClient(), []);
  const authClient = useMemo(() => createAuthSdk(publicApi), [publicApi]);
  const { setLocale } = useLocale();

  const [accessToken, setAccessToken] = useState<string | null>(() => readStoredSession()?.access_token ?? null);
  const [userId, setUserId] = useState<string | null>(() => readStoredSession()?.user_id ?? null);

  const [initialTabVault] = useState(() => {
    const uid = readStoredSession()?.user_id ?? null;
    if (!uid) {
      return {
        vaultKey: null as Uint8Array | null,
        passwordShareC: null as Uint8Array | null,
        lastActivityAt: Date.now(),
        unlocked: false,
      };
    }
    return readInitialTabVaultSession(uid);
  });

  const vaultKeyRef = useRef<Uint8Array | null>(initialTabVault.vaultKey);
  const passwordShareCRef = useRef<Uint8Array | null>(initialTabVault.passwordShareC);
  const lastActivityRef = useRef(initialTabVault.lastActivityAt);
  const vaultUnlockedRef = useRef(initialTabVault.unlocked);
  const [vaultUnlocked, setVaultUnlocked] = useState(initialTabVault.unlocked);
  const [passwordShareC, setPasswordShareC] = useState<Uint8Array | null>(initialTabVault.passwordShareC);
  const [vaultKey, setVaultKey] = useState<Uint8Array | null>(initialTabVault.vaultKey);
  const [vaultIdleLockMs, setVaultIdleLockMsState] = useState(DEFAULT_VAULT_IDLE_LOCK_MS);
  const [masterPasswordChangedAt, setMasterPasswordChangedAt] = useState<string | null>(null);
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [emailChallengeId, setEmailChallengeId] = useState<string | null>(null);
  const [emailResendAvailableAt, setEmailResendAvailableAt] = useState<string | null>(null);
  const [registrationAuthStateId, setRegistrationAuthStateId] = useState<string | null>(null);
  const [twoFactorAuthStateId, setTwoFactorAuthStateIdState] = useState<string | null>(null);
  const [profile, setProfile] = useState<LocalProfile | null>(() =>
    readLocalProfile(readStoredSession()?.user_id ?? null),
  );

  const userIdRef = useRef<string | null>(readStoredSession()?.user_id ?? null);
  userIdRef.current = userId;

  const [vaultUnlockBootstrapLoading, setVaultUnlockBootstrapLoading] = useState(false);
  const [deviceTrustStatus, setDeviceTrustStatus] = useState<DeviceTrustStatus | "idle">("idle");
  const [deviceBlockedUntil, setDeviceBlockedUntil] = useState<string | null>(null);
  const [currentDeviceId, setCurrentDeviceId] = useState<string | null>(null);
  const [deviceApprovers, setDeviceApprovers] = useState<DeviceListItemDto[]>([]);
  const pendingDeviceIdRef = useRef<string | null>(null);
  const currentDeviceIdRef = useRef<string | null>(null);
  /** Sticky forever-block so poll cannot bounce back to unlock/restore. */
  const foreverBlockedRef = useRef(false);

  useEffect(() => {
    vaultUnlockedRef.current = vaultUnlocked;
  }, [vaultUnlocked]);

  const clearPasswordShareSecrets = useCallback(() => {
    if (passwordShareCRef.current) {
      wipeBytes(passwordShareCRef.current);
      passwordShareCRef.current = null;
    }
    setPasswordShareC(null);
  }, []);

  const clearVaultKeySecret = useCallback(() => {
    if (vaultKeyRef.current) {
      wipeBytes(vaultKeyRef.current);
      vaultKeyRef.current = null;
    }
    setVaultKey(null);
  }, []);

  useLayoutEffect(() => {
    if (!accessToken || !userId) {
      return;
    }
    if (vaultUnlockedRef.current && vaultKeyRef.current) {
      return;
    }
    const restored = readVaultUnlockSessionIfFresh(userId, vaultIdleLockMs);
    if (!restored) {
      return;
    }
    if (vaultKeyRef.current) {
      wipeBytes(vaultKeyRef.current);
    }
    vaultKeyRef.current = restored.vaultKey;
    setVaultKey(restored.vaultKey);
    if (passwordShareCRef.current) {
      wipeBytes(passwordShareCRef.current);
    }
    passwordShareCRef.current = restored.passwordShareC;
    setPasswordShareC(restored.passwordShareC);
    lastActivityRef.current = restored.lastActivityAt;
    vaultUnlockedRef.current = true;
    setVaultUnlocked(true);
  }, [accessToken, userId, vaultIdleLockMs]);

  useEffect(() => {
    if (!accessToken || !userId) {
      setDeviceTrustStatus("idle");
      setDeviceBlockedUntil(null);
      setCurrentDeviceId(null);
      currentDeviceIdRef.current = null;
      setDeviceApprovers([]);
      pendingDeviceIdRef.current = null;
      foreverBlockedRef.current = false;
      setVaultUnlockBootstrapLoading(false);
      return;
    }

    let cancelled = false;
    setDeviceTrustStatus("checking");
    void (async () => {
      const client = createAuthenticatedCoreClient(accessToken);
      const snapshot = await resolveDeviceTrust(client, userId);
      if (cancelled) {
        return;
      }
      if (snapshot.status === "blocked" && snapshot.blockedUntil == null) {
        foreverBlockedRef.current = true;
      } else {
        foreverBlockedRef.current = false;
      }
      pendingDeviceIdRef.current =
        snapshot.status === "pending" ||
        snapshot.status === "rejected" ||
        snapshot.status === "blocked"
          ? snapshot.deviceId
          : snapshot.status === "trusted"
            ? null
            : pendingDeviceIdRef.current;
      setDeviceTrustStatus(snapshot.status);
      setDeviceBlockedUntil(
        snapshot.status === "blocked" ? (snapshot.blockedUntil ?? null) : null,
      );
      setCurrentDeviceId(snapshot.deviceId);
      currentDeviceIdRef.current = snapshot.deviceId;
      setDeviceApprovers(snapshot.approverDevices);
    })();

    return () => {
      cancelled = true;
    };
  }, [accessToken, userId]);

  useEffect(() => {
    if (!accessToken || !userId) {
      setVaultUnlockBootstrapLoading(false);
      return;
    }
    if (deviceTrustStatus !== "trusted") {
      setVaultUnlockBootstrapLoading(deviceTrustStatus === "checking");
      return;
    }
    if (readVaultBundle(userId)) {
      setVaultUnlockBootstrapLoading(false);
      return;
    }

    setVaultUnlockBootstrapLoading(true);
    let cancelled = false;
    void (async () => {
      try {
        const fp = getOrCreateDeviceFingerprint();
        const client = createAuthenticatedCoreClient(accessToken);
        const dto = await client.getVaultUnlockBootstrap(fp);
        if (cancelled) {
          return;
        }
        writeVaultBundle(mapVaultUnlockBootstrapToStored(dto), userId);
      } catch {
        /* No trusted device / offline — unlock stays without local bundle. */
      } finally {
        if (!cancelled) {
          setVaultUnlockBootstrapLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [accessToken, userId, deviceTrustStatus]);

  const ensureVaultBundleForUnlock = useCallback(async (): Promise<boolean> => {
    if (!accessToken || !userId) {
      return false;
    }
    if (readVaultBundle(userId)) {
      return true;
    }
    try {
      const fp = getOrCreateDeviceFingerprint();
      const client = createAuthenticatedCoreClient(accessToken);
      const dto = await client.getVaultUnlockBootstrap(fp);
      writeVaultBundle(mapVaultUnlockBootstrapToStored(dto), userId);
      return true;
    } catch {
      return false;
    }
  }, [accessToken, userId]);

  useEffect(() => {
    if (!accessToken || !userId) {
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const client = createAuthenticatedCoreClient(accessToken);
        const raw = (await client.getAccountProfile()) as unknown;
        if (cancelled) {
          return;
        }
        const dto = normalizeAccountProfileWire(raw);
        if (!dto) {
          return;
        }
        // Locale from account profile must apply before Settings opens (clear-cache → login).
        if (dto.locale === "en" || dto.locale === "ru") {
          setLocale(dto.locale);
        }
        // Idle lock is device-local; migrate former server value once if unset on this device.
        const prefs = readVaultDevicePrefs(userId);
        if (typeof prefs.idleLockSeconds === "number" && Number.isFinite(prefs.idleLockSeconds)) {
          setVaultIdleLockMsState(vaultIdleLockMsFromServerSeconds(prefs.idleLockSeconds));
        } else {
          const migratedSeconds = dto.vault_idle_lock_seconds;
          patchVaultDevicePrefs(userId, { idleLockSeconds: Math.trunc(migratedSeconds) });
          setVaultIdleLockMsState(vaultIdleLockMsFromServerSeconds(migratedSeconds));
        }
        if (dto.master_password_changed_at) {
          setMasterPasswordChangedAt(dto.master_password_changed_at);
        }
        setProfile((prev) => {
          const fromServerFirst = dto.first_name ?? undefined;
          const fromServerLast = dto.last_name ?? undefined;
          const merged: LocalProfile = {
            email: dto.email || prev?.email || "",
            firstName: fromServerFirst ?? prev?.firstName,
            lastName: fromServerLast ?? prev?.lastName,
          };
          writeLocalProfile(merged, userId);
          return merged;
        });
      } catch {
        /* Offline or older API — keep profile from bridgeLocalProfile / session only. */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [accessToken, userId, setLocale]);

  // Prefer already-migrated local idle prefs as soon as userId is known (before profile fetch).
  useEffect(() => {
    if (!userId) {
      return;
    }
    const prefs = readVaultDevicePrefs(userId);
    if (typeof prefs.idleLockSeconds === "number" && Number.isFinite(prefs.idleLockSeconds)) {
      setVaultIdleLockMsState(vaultIdleLockMsFromServerSeconds(prefs.idleLockSeconds));
    }
  }, [userId]);

  const setEmailChallenge = useCallback((email: string, challengeId: string, resendAvailableAt?: string) => {
    setPendingEmail(email);
    setEmailChallengeId(challengeId);
    setEmailResendAvailableAt(resendAvailableAt ?? null);
  }, []);

  const clearEmailLoginFlow = useCallback(() => {
    setPendingEmail(null);
    setEmailChallengeId(null);
    setEmailResendAvailableAt(null);
  }, []);

  const applyAccessTokenResponse = useCallback((dto: AccessTokenResponseDto) => {
    userIdRef.current = dto.user_id;
    writeStoredSession({
      access_token: dto.access_token,
      user_id: dto.user_id,
      expires_at: dto.expires_at,
    });
    clearVaultKeySecret();
    clearPasswordShareSecrets();
    vaultUnlockedRef.current = false;
    setVaultUnlocked(false);
    setAccessToken(dto.access_token);
    setUserId(dto.user_id);
    setVaultIdleLockMsState(DEFAULT_VAULT_IDLE_LOCK_MS);
    migrateLegacyVaultBundleToUser(dto.user_id);
    const merged = bridgeLocalProfileAfterLogin(dto.user_id);
    if (merged) {
      setProfile(merged);
    }
    lastActivityRef.current = Date.now();
  }, [clearPasswordShareSecrets, clearVaultKeySecret]);

  const logout = useCallback(() => {
    const workspaceUserId = userIdRef.current;
    if (workspaceUserId) {
      clearStoredCurrentWorkspaceId(workspaceUserId);
    }
    userIdRef.current = null;
    clearVaultUnlockSession();
    clearStoredSession();
    clearSessionLocalProfile();
    clearVaultBundleSessionMirror();
    clearPendingVaultBundle();
    setAccessToken(null);
    setUserId(null);
    vaultUnlockedRef.current = false;
    setVaultUnlocked(false);
    clearVaultKeySecret();
    clearPasswordShareSecrets();
    setPendingEmail(null);
    setEmailChallengeId(null);
    setEmailResendAvailableAt(null);
    setRegistrationAuthStateId(null);
    setTwoFactorAuthStateIdState(null);
    setProfile(null);
    setVaultIdleLockMsState(DEFAULT_VAULT_IDLE_LOCK_MS);
    setDeviceTrustStatus("idle");
    setDeviceBlockedUntil(null);
    setCurrentDeviceId(null);
    currentDeviceIdRef.current = null;
    setDeviceApprovers([]);
    pendingDeviceIdRef.current = null;
    foreverBlockedRef.current = false;
    clearSettingsPopupCache();
  }, [clearPasswordShareSecrets, clearVaultKeySecret]);

  const lockVault = useCallback(() => {
    clearVaultUnlockSession();
    clearVaultKeySecret();
    clearPasswordShareSecrets();
    vaultUnlockedRef.current = false;
    setVaultUnlocked(false);
    clearSettingsPopupCache();
  }, [clearPasswordShareSecrets]);

  const touchActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
    if (userIdRef.current && vaultUnlockedRef.current) {
      touchVaultUnlockSession(userIdRef.current);
    }
  }, []);

  useEffect(() => {
    if (!accessToken || !userId || !vaultUnlocked) {
      return;
    }
    if (vaultUnlockSessionExceededIdle(userId, vaultIdleLockMs)) {
      lockVault();
    }
  }, [accessToken, userId, vaultUnlocked, vaultIdleLockMs, lockVault]);

  useEffect(() => {
    const onCopy = (event: Event) => {
      const detail =
        event instanceof CustomEvent ? (event as CustomEvent<{ text?: unknown }>).detail : undefined;
      const text = typeof detail?.text === "string" ? detail.text : undefined;
      scheduleClipboardClearAfterCopy(userIdRef.current, text);
    };
    window.addEventListener("okkey:sensitive-clipboard", onCopy);
    return () => window.removeEventListener("okkey:sensitive-clipboard", onCopy);
  }, []);

  const saveVaultBundle = useCallback(
    (bundle: StoredVaultBundle) => {
      writeVaultBundle(bundle, userId);
    },
    [userId],
  );

  const updateLocalProfile = useCallback((patch: { email?: string; firstName?: string | null; lastName?: string | null }) => {
    setProfile((prev) => {
      const next: LocalProfile = {
        email: patch.email ?? prev?.email ?? "",
        firstName: Object.prototype.hasOwnProperty.call(patch, "firstName")
          ? patch.firstName ?? undefined
          : prev?.firstName,
        lastName: Object.prototype.hasOwnProperty.call(patch, "lastName")
          ? patch.lastName ?? undefined
          : prev?.lastName,
      };
      if (next.email) {
        writeLocalProfile(next, userIdRef.current);
        return next;
      }
      return prev;
    });
  }, []);

  const tryUnlockWithMasterPassword = useCallback(async (masterPassword: string): Promise<boolean> => {
    const bundle = readVaultBundle(userId);
    if (!bundle) {
      return false;
    }
    const pwd = new TextEncoder().encode(masterPassword);
    try {
      const serverA = base64ToBytes(bundle.server_key_share_b64);
      const deviceB = base64ToBytes(bundle.device_share_b64);
      const salt = base64ToBytes(bundle.password_kdf_salt_b64);
      const shareC = await derivePasswordShareC({
        masterPasswordUtf8: pwd,
        passwordKdfSalt: salt,
        passwordKdfParamsVersion: bundle.password_kdf_params_version,
      });
      const vaultKey = await reconstructVaultKeyWithMasterPassword({
        masterPasswordUtf8: pwd,
        serverKeyShare: serverA,
        deviceShare: deviceB,
        passwordKdfSalt: salt,
        passwordKdfParamsVersion: bundle.password_kdf_params_version,
      });
      await decryptUserIdentityFromEncryptedBlob(vaultKey, bundle.encrypted_private_key.payload);
      if (vaultKeyRef.current) {
        wipeBytes(vaultKeyRef.current);
      }
      if (passwordShareCRef.current) {
        wipeBytes(passwordShareCRef.current);
      }
      vaultKeyRef.current = vaultKey;
      passwordShareCRef.current = shareC;
      setVaultKey(vaultKey);
      setPasswordShareC(shareC);
      vaultUnlockedRef.current = true;
      setVaultUnlocked(true);
      lastActivityRef.current = Date.now();
      if (userId) {
        persistVaultUnlockSession(userId, vaultKey, shareC);
      }
      wipeBytes(pwd);
      wipeBytes(serverA);
      wipeBytes(deviceB);
      wipeBytes(salt);
      const token = accessToken;
      if (token) {
        void createAuthenticatedCoreClient(token)
          .recordVaultUnlock()
          .catch(() => {
            /* best-effort: unlock UI must not fail if telemetry POST fails */
          });
      }
      return true;
    } catch {
      wipeBytes(pwd);
      return false;
    }
  }, [userId, accessToken]);

  const applyUnlockedSecrets = useCallback(
    (nextVaultKey: Uint8Array, nextShareC: Uint8Array) => {
      if (vaultKeyRef.current) {
        wipeBytes(vaultKeyRef.current);
      }
      if (passwordShareCRef.current) {
        wipeBytes(passwordShareCRef.current);
      }
      vaultKeyRef.current = nextVaultKey;
      passwordShareCRef.current = nextShareC;
      setVaultKey(nextVaultKey);
      setPasswordShareC(nextShareC);
      vaultUnlockedRef.current = true;
      setVaultUnlocked(true);
      lastActivityRef.current = Date.now();
      if (userId) {
        persistVaultUnlockSession(userId, nextVaultKey, nextShareC);
      }
      const token = accessToken;
      if (token) {
        void createAuthenticatedCoreClient(token)
          .recordVaultUnlock()
          .catch(() => {
            /* best-effort */
          });
      }
    },
    [userId, accessToken],
  );

  const verifyMasterPassword = useCallback(
    async (masterPassword: string): Promise<boolean> => {
      const bundle = readVaultBundle(userId);
      if (!bundle) {
        return false;
      }
      const pwd = new TextEncoder().encode(masterPassword);
      try {
        const serverA = base64ToBytes(bundle.server_key_share_b64);
        const deviceB = base64ToBytes(bundle.device_share_b64);
        const salt = base64ToBytes(bundle.password_kdf_salt_b64);
        const vaultKey = await reconstructVaultKeyWithMasterPassword({
          masterPasswordUtf8: pwd,
          serverKeyShare: serverA,
          deviceShare: deviceB,
          passwordKdfSalt: salt,
          passwordKdfParamsVersion: bundle.password_kdf_params_version,
        });
        await decryptUserIdentityFromEncryptedBlob(vaultKey, bundle.encrypted_private_key.payload);
        wipeBytes(pwd);
        wipeBytes(serverA);
        wipeBytes(deviceB);
        wipeBytes(salt);
        wipeBytes(vaultKey);
        return true;
      } catch {
        wipeBytes(pwd);
        return false;
      }
    },
    [userId],
  );

  const changeMasterPassword = useCallback(
    async (input: {
      oldPassword: string;
      newPassword: string;
      workspaceIds: string[];
    }): Promise<{ ok: true; masterPasswordChangedAt: string } | { ok: false; error: string }> => {
      if (!accessToken || !userId || !vaultKeyRef.current || !passwordShareCRef.current) {
        return { ok: false, error: "not_unlocked" };
      }
      const bundle = readVaultBundle(userId);
      if (!bundle) {
        return { ok: false, error: "no_bundle" };
      }

      const oldPwd = new TextEncoder().encode(input.oldPassword);
      const newPwd = new TextEncoder().encode(input.newPassword);
      let oldShareC: Uint8Array | null = null;
      let rebalanced: Awaited<ReturnType<typeof rebalanceServerShareForNewPassword>> | null = null;

      try {
        const serverA = base64ToBytes(bundle.server_key_share_b64);
        const deviceB = base64ToBytes(bundle.device_share_b64);
        const salt = base64ToBytes(bundle.password_kdf_salt_b64);
        try {
          const reconstructed = await reconstructVaultKeyWithMasterPassword({
            masterPasswordUtf8: oldPwd,
            serverKeyShare: serverA,
            deviceShare: deviceB,
            passwordKdfSalt: salt,
            passwordKdfParamsVersion: bundle.password_kdf_params_version,
          });
          await decryptUserIdentityFromEncryptedBlob(reconstructed, bundle.encrypted_private_key.payload);
          wipeBytes(reconstructed);
          oldShareC = await derivePasswordShareC({
            masterPasswordUtf8: oldPwd,
            passwordKdfSalt: salt,
            passwordKdfParamsVersion: bundle.password_kdf_params_version,
          });
        } catch {
          return { ok: false, error: "wrong_old_password" };
        } finally {
          wipeBytes(serverA);
          wipeBytes(salt);
        }

        rebalanced = await rebalanceServerShareForNewPassword({
          newMasterPasswordUtf8: newPwd,
          vaultKey: vaultKeyRef.current,
          deviceShare: deviceB,
          passwordKdfParamsVersion: bundle.password_kdf_params_version,
        });
        wipeBytes(deviceB);

        const client = createAuthenticatedCoreClient(accessToken);
        if (input.workspaceIds.length > 0 && oldShareC) {
          await migratePersonalFoldersAfterPasswordChange({
            core: client,
            workspaceIds: input.workspaceIds,
            oldPasswordShareC: oldShareC,
            newPasswordShareC: rebalanced.passwordShareC,
          });
        }

        const response = await client.changeMasterPassword({
          server_key_share: bytesToBase64(rebalanced.serverKeyShare),
          password_kdf_salt: bytesToBase64(rebalanced.passwordKdfSalt),
          password_kdf_params_version: rebalanced.passwordKdfParamsVersion,
        });

        writeVaultBundle(
          {
            ...bundle,
            server_key_share_b64: bytesToBase64(rebalanced.serverKeyShare),
            password_kdf_salt_b64: bytesToBase64(rebalanced.passwordKdfSalt),
            password_kdf_params_version: rebalanced.passwordKdfParamsVersion,
          },
          userId,
        );

        if (passwordShareCRef.current) {
          wipeBytes(passwordShareCRef.current);
        }
        passwordShareCRef.current = rebalanced.passwordShareC;
        setPasswordShareC(rebalanced.passwordShareC);
        persistVaultUnlockSession(userId, vaultKeyRef.current, rebalanced.passwordShareC);
        setMasterPasswordChangedAt(response.master_password_changed_at);
        clearDeviceUnlockSecrets(userId);
        window.dispatchEvent(new CustomEvent("okkey:master-password-changed"));

        wipeBytes(rebalanced.serverKeyShare);
        wipeBytes(rebalanced.passwordKdfSalt);
        rebalanced = null;

        return { ok: true, masterPasswordChangedAt: response.master_password_changed_at };
      } catch {
        return { ok: false, error: "change_failed" };
      } finally {
        wipeBytes(oldPwd);
        wipeBytes(newPwd);
        if (oldShareC) {
          wipeBytes(oldShareC);
        }
        if (rebalanced) {
          wipeBytes(rebalanced.passwordShareC);
          wipeBytes(rebalanced.serverKeyShare);
          wipeBytes(rebalanced.passwordKdfSalt);
        }
      }
    },
    [accessToken, userId],
  );

  const setVaultIdleLockMs = useCallback((ms: number) => {
    setVaultIdleLockMsState(ms);
  }, []);

  const refreshDeviceTrust = useCallback(async () => {
    if (!accessToken || !userId) {
      return;
    }
    try {
      const client = createAuthenticatedCoreClient(accessToken);
      const fingerprint = getOrCreateDeviceFingerprint();
      const knownDeviceId = pendingDeviceIdRef.current ?? currentDeviceIdRef.current;
      const snapshot = await pollDeviceTrust(client, fingerprint, knownDeviceId);
      // Sticky forever-block is optimistic only; clear when server is no longer blocked
      // (Settings unblock / re-trust must leave /account/device-pending without reload).
      if (snapshot.status === "blocked" && snapshot.blockedUntil == null) {
        foreverBlockedRef.current = true;
      } else {
        foreverBlockedRef.current = false;
      }
      pendingDeviceIdRef.current =
        snapshot.status === "pending" ||
        snapshot.status === "rejected" ||
        snapshot.status === "blocked"
          ? snapshot.deviceId
          : null;
      setDeviceTrustStatus(snapshot.status);
      setDeviceBlockedUntil(
        snapshot.status === "blocked" ? (snapshot.blockedUntil ?? null) : null,
      );
      setCurrentDeviceId(snapshot.deviceId);
      currentDeviceIdRef.current = snapshot.deviceId;
      // Poll returns a fresh array every 2s; keep previous reference when equal so
      // AuthVault context consumers (item forms / datepicker) do not re-render on a tick.
      setDeviceApprovers((prev) =>
        deviceApproversEqual(prev, snapshot.approverDevices) ? prev : snapshot.approverDevices,
      );
      // Revoke/block from another browser must drop local unlock immediately.
      if (snapshot.status !== "trusted" && vaultUnlockedRef.current) {
        lockVault();
      }
    } catch {
      // Best-effort; keep last known trust status on transient network errors.
    }
  }, [accessToken, lockVault, userId]);

  const markDeviceBlockedForever = useCallback(() => {
    foreverBlockedRef.current = true;
    setDeviceTrustStatus("blocked");
    setDeviceBlockedUntil(null);
    if (vaultUnlockedRef.current) {
      lockVault();
    }
  }, [lockVault]);

  // Keep trust live so revoke/block on another device ends access without a full reload.
  useEffect(() => {
    if (!accessToken || !userId) {
      return;
    }
    const timer = window.setInterval(() => {
      void refreshDeviceTrust();
    }, 2_000);
    return () => window.clearInterval(timer);
  }, [accessToken, refreshDeviceTrust, userId]);

  const retryDeviceRegistration = useCallback(async () => {
    if (!accessToken || !userId) {
      return;
    }
    foreverBlockedRef.current = false;
    setDeviceTrustStatus("checking");
    setDeviceBlockedUntil(null);
    const client = createAuthenticatedCoreClient(accessToken);
    try {
      const registered = await registerCurrentBrowserDevice(client);
      pendingDeviceIdRef.current = registered.device_id;
      if (registered.status === "trusted") {
        setDeviceTrustStatus("trusted");
        setCurrentDeviceId(registered.device_id);
        const listed = await client.listDevices(getOrCreateDeviceFingerprint()).catch(() => null);
        setDeviceApprovers(listed?.devices ?? []);
        return;
      }
      if (registered.status === "blocked") {
        setDeviceTrustStatus("blocked");
        setDeviceBlockedUntil(registered.blocked_until ?? null);
        setCurrentDeviceId(registered.device_id);
        const listed = await client.listDevices(getOrCreateDeviceFingerprint()).catch(() => null);
        setDeviceApprovers(listed?.devices ?? []);
        return;
      }
      setDeviceTrustStatus("pending");
      setCurrentDeviceId(registered.device_id);
      const listed = await client.listDevices(getOrCreateDeviceFingerprint()).catch(() => null);
      setDeviceApprovers(listed?.devices ?? []);
    } catch {
      setDeviceTrustStatus("error");
    }
  }, [accessToken, userId]);

  const hasVaultBundle = readVaultBundle(userId) !== null;

  const value = useMemo<AuthVaultContextValue>(
    () => ({
      accessToken,
      userId,
      vaultUnlocked,
      passwordShareC,
      vaultKey,
      pendingEmail,
      emailChallengeId,
      emailResendAvailableAt,
      registrationAuthStateId,
      twoFactorAuthStateId,
      authClient,
      profile,
      setEmailChallenge,
      clearEmailLoginFlow,
      setRegistrationAuthStateId,
      setTwoFactorAuthStateId: setTwoFactorAuthStateIdState,
      applyAccessTokenResponse,
      logout,
      lockVault,
      touchActivity,
      saveVaultBundle,
      updateLocalProfile,
      tryUnlockWithMasterPassword,
      ensureVaultBundleForUnlock,
      applyUnlockedSecrets,
      verifyMasterPassword,
      changeMasterPassword,
      setVaultIdleLockMs,
      masterPasswordChangedAt,
      hasVaultBundle,
      vaultUnlockBootstrapLoading,
      vaultIdleLockMs,
      deviceTrustStatus,
      deviceBlockedUntil,
      currentDeviceId,
      deviceApprovers,
      refreshDeviceTrust,
      markDeviceBlockedForever,
      retryDeviceRegistration,
    }),
    [
      accessToken,
      userId,
      vaultUnlocked,
      passwordShareC,
      vaultKey,
      pendingEmail,
      emailChallengeId,
      emailResendAvailableAt,
      registrationAuthStateId,
      twoFactorAuthStateId,
      authClient,
      profile,
      setEmailChallenge,
      clearEmailLoginFlow,
      applyAccessTokenResponse,
      logout,
      lockVault,
      touchActivity,
      saveVaultBundle,
      updateLocalProfile,
      tryUnlockWithMasterPassword,
      ensureVaultBundleForUnlock,
      applyUnlockedSecrets,
      verifyMasterPassword,
      changeMasterPassword,
      setVaultIdleLockMs,
      masterPasswordChangedAt,
      hasVaultBundle,
      vaultUnlockBootstrapLoading,
      vaultIdleLockMs,
      deviceTrustStatus,
      deviceBlockedUntil,
      currentDeviceId,
      deviceApprovers,
      refreshDeviceTrust,
      markDeviceBlockedForever,
      retryDeviceRegistration,
    ],
  );

  return (
    <AuthVaultContext.Provider value={value}>
      {children}
      <VaultIdleLockBridge
        accessToken={accessToken}
        userId={userId}
        vaultUnlocked={vaultUnlocked}
        vaultIdleLockMs={vaultIdleLockMs}
        lockVault={lockVault}
        touchActivity={touchActivity}
        lastActivityRef={lastActivityRef}
      />
    </AuthVaultContext.Provider>
  );
}

export function useAuthVault(): AuthVaultContextValue {
  const ctx = useContext(AuthVaultContext);
  if (ctx == null) {
    throw new Error("useAuthVault must be used within AuthVaultProvider");
  }
  return ctx;
}

export function useAuthenticatedCoreClient() {
  const { accessToken } = useAuthVault();
  return useMemo(() => {
    if (!accessToken) {
      return null;
    }
    return createAuthenticatedCoreClient(accessToken);
  }, [accessToken]);
}
