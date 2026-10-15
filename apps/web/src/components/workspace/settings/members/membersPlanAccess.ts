import type { PlanFeatureOverrides } from "@okkey/types";

import { workspaceHasPlanFeature } from "../../../../workspace/planEntitlements";

type WorkspacePlanLike = {
  planTier?: string | null;
  planCustomOverride?: boolean | null;
  planFeatureOverrides?: PlanFeatureOverrides | null;
};

/**
 * Inviting / managing non-owner members: SaaS `plan_tier`
 * (+ `planFeatureOverrides` when custom override is on) / self-host enterprise modules.
 */
export function canInviteAdditionalWorkspaceMembers(
  workspace: WorkspacePlanLike | null | undefined,
): boolean {
  return workspaceHasPlanFeature(workspace, "additionalWorkspaceMembers");
}
