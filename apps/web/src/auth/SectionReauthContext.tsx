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
import { useLocation } from "react-router-dom";

import { useAuthVault } from "./AuthVaultContext";
import { resolveSectionReauthZone } from "./sectionReauthZones";
import {
  readVaultDevicePrefs,
  SECTION_REAUTH_PATH_ZONE_IDS,
  type SectionReauthZoneId,
} from "./vaultDevicePrefs";
import SectionReauthPopup from "../components/settings/SectionReauthPopup";

export type RequestZoneUnlockOptions = {
  /** Ignore prefs and always prompt (e.g. workspace delete). */
  force?: boolean;
  /**
   * When true (default), a successful unlock is remembered until cleared.
   * Deletion actions should pass false so each delete re-prompts.
   */
  persist?: boolean;
};

type PendingUnlockRequest = {
  zone: SectionReauthZoneId;
  persist: boolean;
  resolve: (ok: boolean) => void;
};

type SectionReauthContextValue = {
  isZoneUnlocked: (zone: SectionReauthZoneId) => boolean;
  markZoneUnlocked: (zone: SectionReauthZoneId) => void;
  clearZoneUnlocked: (zone: SectionReauthZoneId) => void;
  isZoneRequired: (zone: SectionReauthZoneId) => boolean;
  /**
   * Prompt for master password / PIN / biometrics when the zone is required
   * (or when `force` is set). Resolves true on success, false on cancel.
   */
  requestZoneUnlock: (
    zone: SectionReauthZoneId,
    options?: RequestZoneUnlockOptions,
  ) => Promise<boolean>;
  /** True while a pathname zone is gated and not yet unlocked. */
  isContentBlocked: boolean;
  /** Re-open the confirmation popup after it was dismissed. */
  requestAccess: () => void;
};

const SectionReauthContext = createContext<SectionReauthContextValue | null>(null);

export function SectionReauthProvider({ children }: { children: ReactNode }) {
  const { userId } = useAuthVault();
  const location = useLocation();
  const [unlockedZones, setUnlockedZones] = useState<Set<SectionReauthZoneId>>(() => new Set());
  const [promptOpen, setPromptOpen] = useState(false);
  const [pendingRequest, setPendingRequest] = useState<PendingUnlockRequest | null>(null);
  const [prefsTick, setPrefsTick] = useState(0);
  const unlockedZonesRef = useRef(unlockedZones);
  unlockedZonesRef.current = unlockedZones;
  const pendingRequestRef = useRef(pendingRequest);
  pendingRequestRef.current = pendingRequest;

  useEffect(() => {
    const onPrefs = () => setPrefsTick((n) => n + 1);
    window.addEventListener("okkey:vault-device-prefs", onPrefs);
    return () => window.removeEventListener("okkey:vault-device-prefs", onPrefs);
  }, []);

  const prefsZones = useMemo(() => {
    void prefsTick;
    if (!userId) {
      return [] as SectionReauthZoneId[];
    }
    return readVaultDevicePrefs(userId).requireReauthZones;
  }, [userId, prefsTick]);

  const prefsZonesKey = useMemo(() => [...prefsZones].sort().join("\0"), [prefsZones]);

  useEffect(() => {
    setUnlockedZones(new Set());
    setPendingRequest((prev) => {
      if (prev) {
        prev.resolve(false);
      }
      return null;
    });
  }, [userId, prefsZonesKey]);

  const currentZone = resolveSectionReauthZone(location.pathname);

  const blockedZone =
    currentZone && prefsZones.includes(currentZone) && !unlockedZones.has(currentZone)
      ? currentZone
      : null;

  useEffect(() => {
    setUnlockedZones((prev) => {
      let changed = false;
      const next = new Set(prev);
      for (const zone of SECTION_REAUTH_PATH_ZONE_IDS) {
        if (zone !== currentZone && next.has(zone)) {
          next.delete(zone);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [currentZone]);

  useEffect(() => {
    // Entering a gated path zone opens the prompt; leaving or unlocking closes it.
    // On-demand requests manage their own overlay via `pendingRequest`.
    if (pendingRequest) {
      return;
    }
    setPromptOpen(blockedZone !== null);
  }, [blockedZone, pendingRequest]);

  const markZoneUnlocked = useCallback((zone: SectionReauthZoneId) => {
    setUnlockedZones((prev) => new Set(prev).add(zone));
    setPromptOpen(false);
  }, []);

  const clearZoneUnlocked = useCallback((zone: SectionReauthZoneId) => {
    setUnlockedZones((prev) => {
      if (!prev.has(zone)) {
        return prev;
      }
      const next = new Set(prev);
      next.delete(zone);
      return next;
    });
  }, []);

  const isZoneUnlocked = useCallback(
    (zone: SectionReauthZoneId) => unlockedZones.has(zone),
    [unlockedZones],
  );

  const isZoneRequired = useCallback(
    (zone: SectionReauthZoneId) => prefsZones.includes(zone),
    [prefsZones],
  );

  const requestZoneUnlock = useCallback(
    (zone: SectionReauthZoneId, options?: RequestZoneUnlockOptions): Promise<boolean> => {
      const force = options?.force === true;
      const persist = options?.persist !== false;
      if (!force && !prefsZones.includes(zone)) {
        return Promise.resolve(true);
      }
      if (persist && unlockedZonesRef.current.has(zone)) {
        return Promise.resolve(true);
      }
      const existing = pendingRequestRef.current;
      if (existing) {
        existing.resolve(false);
      }
      return new Promise<boolean>((resolve) => {
        setPendingRequest({ zone, persist, resolve });
      });
    },
    [prefsZones],
  );

  const requestAccess = useCallback(() => {
    if (blockedZone && !pendingRequestRef.current) {
      setPromptOpen(true);
    }
  }, [blockedZone]);

  const dismissPrompt = useCallback(() => {
    setPromptOpen(false);
  }, []);

  const activePromptZone = pendingRequest?.zone ?? (promptOpen ? blockedZone : null);

  const handleUnlocked = useCallback(() => {
    const pending = pendingRequestRef.current;
    if (pending) {
      if (pending.persist) {
        setUnlockedZones((prev) => new Set(prev).add(pending.zone));
      }
      pending.resolve(true);
      setPendingRequest(null);
      return;
    }
    if (blockedZone) {
      markZoneUnlocked(blockedZone);
    }
  }, [blockedZone, markZoneUnlocked]);

  const handleCancel = useCallback(() => {
    const pending = pendingRequestRef.current;
    if (pending) {
      pending.resolve(false);
      setPendingRequest(null);
      return;
    }
    dismissPrompt();
  }, [dismissPrompt]);

  const isContentBlocked = blockedZone !== null;

  const value = useMemo(
    () => ({
      isZoneUnlocked,
      markZoneUnlocked,
      clearZoneUnlocked,
      isZoneRequired,
      requestZoneUnlock,
      isContentBlocked,
      requestAccess,
    }),
    [
      isZoneUnlocked,
      markZoneUnlocked,
      clearZoneUnlocked,
      isZoneRequired,
      requestZoneUnlock,
      isContentBlocked,
      requestAccess,
    ],
  );

  return (
    <SectionReauthContext.Provider value={value}>
      {children}
      {activePromptZone ? (
        <SectionReauthPopup
          zone={activePromptZone}
          onUnlocked={handleUnlocked}
          onCancel={handleCancel}
        />
      ) : null}
    </SectionReauthContext.Provider>
  );
}

export function useSectionReauth(): SectionReauthContextValue {
  const ctx = useContext(SectionReauthContext);
  if (!ctx) {
    throw new Error("useSectionReauth must be used within SectionReauthProvider");
  }
  return ctx;
}
