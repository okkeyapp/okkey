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
};

const SectionReauthContext = createContext<SectionReauthContextValue | null>(null);

export function SectionReauthProvider({ children }: { children: ReactNode }) {
  const { userId } = useAuthVault();
  const location = useLocation();
  const [unlockedZones, setUnlockedZones] = useState<Set<SectionReauthZoneId>>(() => new Set());
  const [pendingZone, setPendingZone] = useState<SectionReauthZoneId | null>(null);
  const [prefsTick, setPrefsTick] = useState(0);

  useEffect(() => {
    const onPrefs = () => setPrefsTick((n) => n + 1);
    window.addEventListener("okkey:vault-device-prefs", onPrefs);
    return () => window.removeEventListener("okkey:vault-device-prefs", onPrefs);
  }, []);

  const prefsZonesKey = useMemo(() => {
    void prefsTick;
    if (!userId) {
      return "";
    }
    return readVaultDevicePrefs(userId).requireReauthZones.slice().sort().join(",");
  }, [userId, prefsTick]);
  const prefsZones = prefsZonesKey
    ? (prefsZonesKey.split(",") as SectionReauthZoneId[])
    : [];
  const currentZone = resolveSectionReauthZone(location.pathname);

  useEffect(() => {
    setUnlockedZones((prev) => {
      if (!currentZone) {
        return new Set();
      }
      const next = new Set<SectionReauthZoneId>();
      if (prev.has(currentZone)) {
        next.add(currentZone);
      }
      return next;
    });
  }, [currentZone]);

  useEffect(() => {
    if (!currentZone) {
      setPendingZone(null);
      return;
    }
    if (!prefsZones.includes(currentZone)) {
      setPendingZone(null);
      return;
    }
    if (unlockedZones.has(currentZone)) {
      setPendingZone(null);
      return;
    }
    setPendingZone(currentZone);
  }, [currentZone, prefsZonesKey, unlockedZones]);

  const markZoneUnlocked = useCallback((zone: SectionReauthZoneId) => {
    setUnlockedZones((prev) => new Set(prev).add(zone));
    setPendingZone(null);
  }, []);

  const isZoneUnlocked = useCallback(
    (zone: SectionReauthZoneId) => unlockedZones.has(zone),
    [unlockedZones],
  );

  const value = useMemo(
    () => ({ isZoneUnlocked, markZoneUnlocked }),
    [isZoneUnlocked, markZoneUnlocked],
  );

  const blocked = pendingZone !== null;

  return (
    <SectionReauthContext.Provider value={value}>
      <div className={blocked ? "pointer-events-none select-none blur-[2px]" : undefined} aria-hidden={blocked}>
        {children}
      </div>
      {pendingZone ? (
        <SectionReauthPopup
          zone={pendingZone}
          onUnlocked={() => markZoneUnlocked(pendingZone)}
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
