import type { WebLocale } from "@okkey/i18n";
import { useEffect, useState } from "react";

import { useAuthenticatedCoreClient } from "../../../../auth/AuthVaultContext";
import { normalizeAccountProfileWire } from "../../../../auth/normalizeAccountProfileWire";
import { useLocale } from "../../../../locale/LocaleContext";
import { normalizeRegionCode, type RegionCode } from "../../../../regions/regions";
import { getSettingsPopupCacheState } from "../../../settings/settingsPopupCache";

/** Billing region only — do not invent a browser default (keeps SMTP ≡ direct API). */
function resolvePrefillRegion(billingRegion: string | null | undefined): RegionCode | null {
  return normalizeRegionCode(billingRegion);
}

/** Prefill contact email / region / locale for plan sales request popups. */
export function usePlanRequestProfile(): {
  email: string;
  region: RegionCode | null;
  locale: WebLocale;
} {
  const { locale } = useLocale();
  const core = useAuthenticatedCoreClient();
  const [email, setEmail] = useState("");
  const [region, setRegion] = useState<RegionCode | null>(null);
  const [profileLocale, setProfileLocale] = useState<WebLocale>(locale);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const cachedProfile = getSettingsPopupCacheState().profile.data;
      if (cachedProfile && !cancelled) {
        setEmail(cachedProfile.email);
        setRegion(resolvePrefillRegion(cachedProfile.billing_region));
        if (cachedProfile.locale === "en" || cachedProfile.locale === "ru") {
          setProfileLocale(cachedProfile.locale);
        }
      }

      if (!core) {
        return;
      }
      try {
        const dto = await core.getAccountProfile();
        if (cancelled) {
          return;
        }
        const normalized = normalizeAccountProfileWire(dto);
        if (!normalized) {
          return;
        }
        setEmail(normalized.email);
        setRegion(resolvePrefillRegion(normalized.billing_region));
        if (normalized.locale === "en" || normalized.locale === "ru") {
          setProfileLocale(normalized.locale);
        }
      } catch {
        /* best-effort autofill */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [core]);

  return { email, region, locale: profileLocale };
}
