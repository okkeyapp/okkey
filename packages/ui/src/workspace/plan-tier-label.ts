import { normalizePlanTier } from "@okkey/types";

/** Copy for `Workspace.planTier` (aligned with i18n `plan.*`). */
export function planTierLabel(planTier: string, t: (key: string) => string): string {
  switch (normalizePlanTier(planTier)) {
    case "PREMIUM":
      return t("plan.premium");
    case "TEAM":
      return t("plan.team");
    case "ENTERPRISE":
      return t("plan.enterprise");
    case "FREE":
    default:
      return t("plan.free");
  }
}
