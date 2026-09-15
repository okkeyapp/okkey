/** Web copy for `Workspace.planTier` (aligned with i18n `plan.*`). */
export function planTierLabel(planTier: string, t: (key: string) => string): string {
  switch (planTier) {
    case "PREMIUM":
      return t("plan.premium");
    case "FAMILY":
      return t("plan.family");
    case "TEAM":
      return t("plan.team");
    case "ENTERPRISE":
      return t("plan.enterprise");
    case "FREE":
    default:
      return t("plan.free");
  }
}
