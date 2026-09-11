import { useEffect, useRef, useState } from "react";

import { useSectionReauth } from "./SectionReauthContext";
import type { SectionReauthZoneId } from "./vaultDevicePrefs";

/**
 * Gates URL-driven popups behind section reauth when the zone is enabled.
 * Returns true only when the popup may render its content.
 */
export function usePopupZoneGate(
  zone: SectionReauthZoneId,
  open: boolean,
  onCancel: () => void,
): boolean {
  const { isZoneRequired, isZoneUnlocked, requestZoneUnlock } = useSectionReauth();
  const [allowed, setAllowed] = useState(false);
  const onCancelRef = useRef(onCancel);
  onCancelRef.current = onCancel;
  const requestSeq = useRef(0);

  useEffect(() => {
    if (!open) {
      setAllowed(false);
      return;
    }
    if (!isZoneRequired(zone) || isZoneUnlocked(zone)) {
      setAllowed(true);
      return;
    }
    setAllowed(false);
    const seq = ++requestSeq.current;
    void requestZoneUnlock(zone).then((ok) => {
      if (seq !== requestSeq.current) {
        return;
      }
      if (ok) {
        setAllowed(true);
      } else {
        onCancelRef.current();
      }
    });
  }, [open, zone, isZoneRequired, isZoneUnlocked, requestZoneUnlock]);

  return open && allowed;
}
