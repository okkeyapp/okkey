import { workspaceHasPlanFeature } from "../../../../workspace/planEntitlements";

/** Inviting / managing non-owner members: SaaS `plan_tier` / self-host enterprise modules. */
export function canInviteAdditionalWorkspaceMembers(planTier: string | undefined): boolean {
  return workspaceHasPlanFeature({ planTier }, "additionalWorkspaceMembers");
}
