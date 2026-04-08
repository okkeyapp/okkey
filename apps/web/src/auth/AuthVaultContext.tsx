import type { AccessTokenResponseDto } from "@okkey/types";
import { AuthClient } from "@okkey/auth";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  decryptUserIdentityFromEncryptedBlob,
  reconstructVaultKeyWithMasterPassword,
  wipeBytes,
} from "@okkey/crypto";

import { createAuthSdk, createAuthenticatedCoreClient, createPublicApiClient } from "../api/client";
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
import {
  clearStoredSession,
  readStoredSession,
  writeStoredSession,
} from "./sessionAuthStorage";

export const DEFAULT_IDLE_MS = 15 * 60 * 1000;

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
  /** Пока true — идёт попытка подтянуть split-key с API после пустого локального хранилища. */
  vaultUnlockBootstrapLoading: boolean;
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

function NavigationGuards({
  children,
  accessToken,
  vaultUnlocked,
  lockVault,
  lastActivityRef,
  emailChallengeId,
  pendingEmail,
  registrationAuthStateId,
  twoFactorAuthStateId,
}: {
  children: ReactNode;
  accessToken: string | null;
  vaultUnlocked: boolean;
  lockVault: () => void;
  lastActivityRef: React.MutableRefObject<number>;
  emailChallengeId: string | null;
  pendingEmail: string | null;
  registrationAuthStateId: string | null;
  twoFactorAuthStateId: string | null;
}) {
  const location = useLocation();
  const navigate = useNavigate();

  const touch = useCallback(() => {
    lastActivityRef.current = Date.now();
  }, [lastActivityRef]);

  useActivityListeners(touch);

  const handleIdle = useCallback(() => {
    if (!accessToken || !vaultUnlocked) {
      return;
    }
    lockVault();
    const path = `${location.pathname}${location.search}`;
    const redirectParam = encodeURIComponent(path);
    navigate(`/unlock/password?redirect=${redirectParam}`, { replace: true });
  }, [accessToken, vaultUnlocked, lockVault, navigate, location.pathname, location.search]);

  const isDevUi = import.meta.env.DEV && location.pathname === "/dev/ui";

  useEffect(() => {
    if (isDevUi) {
      return;
    }

    const path = location.pathname;

    if (!accessToken) {
      const inOtpFlow = Boolean(emailChallengeId && pendingEmail);
      const allowed =
        path === "/auth/email" ||
        (path === "/auth/otp" && inOtpFlow) ||
        (path === "/auth/registration" && Boolean(registrationAuthStateId)) ||
        (path === "/auth/two-factor" && Boolean(twoFactorAuthStateId));
      if (!allowed) {
        navigate("/auth/email", { replace: true });
      }
      return;
    }

    if (!vaultUnlocked) {
      if (path !== "/unlock/password") {
        const redirectParam = encodeURIComponent(`${location.pathname}${location.search}`);
        navigate(`/unlock/password?redirect=${redirectParam}`, { replace: true });
      }
      return;
    }

    if (path.startsWith("/auth/") || path === "/unlock/password") {
      navigate("/workspaces", { replace: true });
    }
  }, [
    accessToken,
    vaultUnlocked,
    location.pathname,
    location.search,
    navigate,
    isDevUi,
    emailChallengeId,
    pendingEmail,
    registrationAuthStateId,
    twoFactorAuthStateId,
  ]);

  return (
    <>
      <IdleLockWatcher
        enabled={Boolean(accessToken && vaultUnlocked)}
        idleMs={DEFAULT_IDLE_MS}
        lastActivityRef={lastActivityRef}
        onIdle={handleIdle}
      />
      {children}
    </>
  );
}

export function AuthVaultProvider({ children }: { children: ReactNode }) {
  const publicApi = useMemo(() => createPublicApiClient(), []);
  const authClient = useMemo(() => createAuthSdk(publicApi), [publicApi]);

  const vaultKeyRef = useRef<Uint8Array | null>(null);
  const lastActivityRef = useRef<number>(Date.now());

  const [accessToken, setAccessToken] = useState<string | null>(() => readStoredSession()?.access_token ?? null);
  const [userId, setUserId] = useState<string | null>(() => readStoredSession()?.user_id ?? null);
  const [vaultUnlocked, setVaultUnlocked] = useState(false);
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
        const dto = await client.getAccountProfile();
        if (cancelled) {
          return;
        }
        setProfile((prev) => {
          const fromServerFirst = dto.first_name?.trim() || undefined;
          const fromServerLast = dto.last_name?.trim() || undefined;
          const merged: LocalProfile = {
            email: dto.email.trim() || prev?.email || "",
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
    setAccessToken(dto.access_token);
    setUserId(dto.user_id);
    migrateLegacyVaultBundleToUser(dto.user_id);
    const merged = bridgeLocalProfileAfterLogin(dto.user_id);
    if (merged) {
      setProfile(merged);
    }
    lastActivityRef.current = Date.now();
  }, []);

  const logout = useCallback(() => {
    userIdRef.current = null;
    clearStoredSession();
    clearSessionLocalProfile();
    clearVaultBundleSessionMirror();
    clearPendingVaultBundle();
    setAccessToken(null);
    setUserId(null);
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
  }, []);

  const lockVault = useCallback(() => {
    if (vaultKeyRef.current) {
      wipeBytes(vaultKeyRef.current);
      vaultKeyRef.current = null;
    }
    setVaultUnlocked(false);
  }, []);

  const touchActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
  }, []);

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
      setVaultUnlocked(true);
      lastActivityRef.current = Date.now();
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
    ],
  );

  return (
    <AuthVaultContext.Provider value={value}>
      <NavigationGuards
        accessToken={accessToken}
        vaultUnlocked={vaultUnlocked}
        lockVault={lockVault}
        lastActivityRef={lastActivityRef}
        emailChallengeId={emailChallengeId}
        pendingEmail={pendingEmail}
        registrationAuthStateId={registrationAuthStateId}
        twoFactorAuthStateId={twoFactorAuthStateId}
      >
        {children}
      </NavigationGuards>
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
