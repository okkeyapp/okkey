import type { AccessTokenResponseDto } from "@okkey/types";
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
  type MutableRefObject,
  type ReactNode,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  decryptUserIdentityFromEncryptedBlob,
  reconstructVaultKeyWithMasterPassword,
  wipeBytes,
} from "@okkey/crypto";

import { createAuthSdk, createAuthenticatedCoreClient, createPublicApiClient } from "../api/client";
import { accountLockWithRedirectQuery } from "../routes/paths";
import { base64ToBytes } from "./base64";
import { getOrCreateDeviceFingerprint } from "./deviceFingerprint";
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
import { DEFAULT_VAULT_IDLE_LOCK_MS, vaultIdleLockMsFromServerSeconds } from "./vaultIdleLockMs";
import {
  clearVaultUnlockSession,
  persistVaultUnlockSession,
  readInitialTabVaultSession,
  readVaultUnlockSessionIfFresh,
  touchVaultUnlockSession,
  vaultUnlockSessionExceededIdle,
} from "./vaultUnlockSessionStorage";

export const DEFAULT_IDLE_MS = DEFAULT_VAULT_IDLE_LOCK_MS;

export type AuthVaultContextValue = {
  accessToken: string | null;
  userId: string | null;
  vaultUnlocked: boolean;
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
  updateLocalProfile: (patch: Partial<LocalProfile> & { email?: string }) => void;
  tryUnlockWithMasterPassword: (masterPassword: string) => Promise<boolean>;
  hasVaultBundle: boolean;
  /** While true, split-key is being fetched from the API after an empty local vault bundle. */
  vaultUnlockBootstrapLoading: boolean;
  /** Idle interval before vault locks (ms), from server `vault_idle_lock_seconds`. */
  vaultIdleLockMs: number;
};

const AuthVaultContext = createContext<AuthVaultContextValue | null>(null);

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
  vaultUnlocked,
  vaultIdleLockMs,
  lockVault,
  touchActivity,
  lastActivityRef,
}: {
  accessToken: string | null;
  vaultUnlocked: boolean;
  vaultIdleLockMs: number;
  lockVault: () => void;
  touchActivity: () => void;
  lastActivityRef: MutableRefObject<number>;
}) {
  const navigate = useNavigate();
  const location = useLocation();

  useActivityListeners(touchActivity);

  const handleIdle = useCallback(() => {
    if (!accessToken || !vaultUnlocked) {
      return;
    }
    lockVault();
    const redirect = encodeURIComponent(`${location.pathname}${location.search}`);
    navigate(accountLockWithRedirectQuery(redirect), { replace: true });
  }, [accessToken, vaultUnlocked, lockVault, navigate, location.pathname, location.search]);

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

  const [accessToken, setAccessToken] = useState<string | null>(() => readStoredSession()?.access_token ?? null);
  const [userId, setUserId] = useState<string | null>(() => readStoredSession()?.user_id ?? null);

  const [initialTabVault] = useState(() => {
    const uid = readStoredSession()?.user_id ?? null;
    if (!uid) {
      return { vaultKey: null as Uint8Array | null, lastActivityAt: Date.now(), unlocked: false };
    }
    return readInitialTabVaultSession(uid);
  });

  const vaultKeyRef = useRef<Uint8Array | null>(initialTabVault.vaultKey);
  const lastActivityRef = useRef(initialTabVault.lastActivityAt);
  const vaultUnlockedRef = useRef(initialTabVault.unlocked);
  const [vaultUnlocked, setVaultUnlocked] = useState(initialTabVault.unlocked);
  const [vaultIdleLockMs, setVaultIdleLockMsState] = useState(DEFAULT_VAULT_IDLE_LOCK_MS);
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

  useEffect(() => {
    vaultUnlockedRef.current = vaultUnlocked;
  }, [vaultUnlocked]);

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
    lastActivityRef.current = restored.lastActivityAt;
    vaultUnlockedRef.current = true;
    setVaultUnlocked(true);
  }, [accessToken, userId, vaultIdleLockMs]);

  useEffect(() => {
    if (!accessToken || !userId) {
      setVaultUnlockBootstrapLoading(false);
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
        setVaultIdleLockMsState(vaultIdleLockMsFromServerSeconds(dto.vault_idle_lock_seconds));
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
  }, [accessToken, userId]);

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
    if (vaultKeyRef.current) {
      wipeBytes(vaultKeyRef.current);
      vaultKeyRef.current = null;
    }
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
  }, []);

  const logout = useCallback(() => {
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
    if (vaultKeyRef.current) {
      wipeBytes(vaultKeyRef.current);
      vaultKeyRef.current = null;
    }
    setPendingEmail(null);
    setEmailChallengeId(null);
    setEmailResendAvailableAt(null);
    setRegistrationAuthStateId(null);
    setTwoFactorAuthStateIdState(null);
    setProfile(null);
    setVaultIdleLockMsState(DEFAULT_VAULT_IDLE_LOCK_MS);
  }, []);

  const lockVault = useCallback(() => {
    clearVaultUnlockSession();
    if (vaultKeyRef.current) {
      wipeBytes(vaultKeyRef.current);
      vaultKeyRef.current = null;
    }
    vaultUnlockedRef.current = false;
    setVaultUnlocked(false);
  }, []);

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

  const saveVaultBundle = useCallback(
    (bundle: StoredVaultBundle) => {
      writeVaultBundle(bundle, userId);
    },
    [userId],
  );

  const updateLocalProfile = useCallback((patch: Partial<LocalProfile> & { email?: string }) => {
    setProfile((prev) => {
      const next: LocalProfile = {
        email: patch.email ?? prev?.email ?? "",
        firstName: patch.firstName ?? prev?.firstName,
        lastName: patch.lastName ?? prev?.lastName,
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
      vaultKeyRef.current = vaultKey;
      vaultUnlockedRef.current = true;
      setVaultUnlocked(true);
      lastActivityRef.current = Date.now();
      if (userId) {
        persistVaultUnlockSession(userId, vaultKey);
      }
      wipeBytes(pwd);
      wipeBytes(serverA);
      wipeBytes(deviceB);
      wipeBytes(salt);
      return true;
    } catch {
      wipeBytes(pwd);
      return false;
    }
  }, [userId]);

  const hasVaultBundle = readVaultBundle(userId) !== null;

  const value = useMemo<AuthVaultContextValue>(
    () => ({
      accessToken,
      userId,
      vaultUnlocked,
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
      hasVaultBundle,
      vaultUnlockBootstrapLoading,
      vaultIdleLockMs,
    }),
    [
      accessToken,
      userId,
      vaultUnlocked,
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
      hasVaultBundle,
      vaultUnlockBootstrapLoading,
      vaultIdleLockMs,
    ],
  );

  return (
    <AuthVaultContext.Provider value={value}>
      {children}
      <VaultIdleLockBridge
        accessToken={accessToken}
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
