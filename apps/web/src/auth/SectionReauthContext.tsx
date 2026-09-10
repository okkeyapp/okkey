import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useLocation } from "react-router-dom";

import { useAuthVault } from "./AuthVaultContext";
import { resolveSectionReauthZone } from "./sectionReauthZones";
import { readVaultDevicePrefs, type SectionReauthZoneId } from "./vaultDevicePrefs";
import SectionReauthPopup from "../components/settings/SectionReauthPopup";

type SectionReauthContextValue = {
  isZoneUnlocked: (zone: SectionReauthZoneId) => boolean;
  markZoneUnlocked: (zone: SectionReauthZoneId) => void;
  clearZoneUnlocked: (zone: SectionReauthZoneId) => void;
  isZoneRequired: (zone: SectionReauthZoneId) => boolean;
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
  const [prefsTick, setPrefsTick] = useState(0);

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

  const currentZone = resolveSectionReauthZone(location.pathname);

  const blockedZone =
    currentZone && prefsZones.includes(currentZone) && !unlockedZones.has(currentZone)
      ? currentZone
      : null;

  useEffect(() => {
    setUnlockedZones((prev) => {
      if (!currentZone) {
        return new Set();
      }
      if (prev.has(currentZone)) {
        return new Set([currentZone]);
      }
      return new Set();
    });
  }, [currentZone]);

  useEffect(() => {
    // Entering a gated zone opens the prompt; leaving or unlocking closes it.
    setPromptOpen(blockedZone !== null);
  }, [blockedZone]);

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

  const requestAccess = useCallback(() => {
    if (blockedZone) {
      setPromptOpen(true);
    }
  }, [blockedZone]);

  const dismissPrompt = useCallback(() => {
    setPromptOpen(false);
  }, []);

  const isContentBlocked = blockedZone !== null;

  const value = useMemo(
    () => ({
      isZoneUnlocked,
      markZoneUnlocked,
      clearZoneUnlocked,
      isZoneRequired,
      isContentBlocked,
      requestAccess,
    }),
    [isZoneUnlocked, markZoneUnlocked, clearZoneUnlocked, isZoneRequired, isContentBlocked, requestAccess],
  );

  return (
    <SectionReauthContext.Provider value={value}>
      {children}
      {blockedZone && promptOpen ? (
        <SectionReauthPopup
          zone={blockedZone}
          onUnlocked={() => markZoneUnlocked(blockedZone)}
          onCancel={dismissPrompt}
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
