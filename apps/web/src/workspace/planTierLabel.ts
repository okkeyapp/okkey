/** Web copy for `Workspace.planTier` (aligned with `WorkspacesContent` / i18n `plan.*`). */
export function planTierLabel(planTier: string, t: (key: string) => string): string {
  if (planTier === "FREE") {
    return t("plan.free");
  }
  return t("plan.enterprise");
}
