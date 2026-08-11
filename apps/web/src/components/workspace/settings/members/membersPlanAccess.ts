import { hasPlanFeature } from "@okkey/types";

/** Inviting / managing non-owner members requires the ENTERPRISE plan feature. */
export function canInviteAdditionalWorkspaceMembers(planTier: string | undefined): boolean {
  return hasPlanFeature(planTier, "additionalWorkspaceMembers");
}
