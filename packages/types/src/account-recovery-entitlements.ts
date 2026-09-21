/**
 * Account-level recovery entitlements (Phase 2).
 *
 * Recovery **key** is available to every account (including FREE).
 * Trusted **devices** / **contacts** require membership in at least one workspace
 * that grants the related plan features (after custom overrides).
 *
 * Workspace matrix keys:
 * - `accountRecovery` → trusted devices recovery method
 * - `trustedContacts` → trusted contacts recovery method
 */
import {
  hasPlanFeature,
  planEntitlementOptionsFromWorkspace,
  type PlanFeatureOverrides,
} from "./plan-features.js";

/** Workspace-shaped input for account-level recovery resolution. */
export type AccountRecoveryWorkspaceLike = {
  planTier?: string | null;
  planCustomOverride?: boolean | null;
  planFeatureOverrides?: PlanFeatureOverrides | null;
};

export type AccountRecoveryEntitlements = {
  /** Always true — recovery key is available on FREE and paid. */
  recoveryKey: true;
  /** True when any accessible workspace grants `accountRecovery`. */
  trustedDevices: boolean;
  /** True when any accessible workspace grants `trustedContacts`. */
  trustedContacts: boolean;
};

export const MIN_TRUSTED_CONTACTS_CONFIRMED = 3 as const;

/**
 * Resolve account-level recovery method entitlements from the user's
 * accessible workspaces (owner or member). Empty list → FREE-only (key only).
 */
export function resolveAccountRecoveryEntitlements(
  workspaces: readonly AccountRecoveryWorkspaceLike[],
): AccountRecoveryEntitlements {
  let trustedDevices = false;
  let trustedContacts = false;
  for (const workspace of workspaces) {
    const options = planEntitlementOptionsFromWorkspace(workspace);
    if (!trustedDevices && hasPlanFeature(workspace.planTier, "accountRecovery", options)) {
      trustedDevices = true;
    }
    if (!trustedContacts && hasPlanFeature(workspace.planTier, "trustedContacts", options)) {
      trustedContacts = true;
    }
    if (trustedDevices && trustedContacts) {
      break;
    }
  }
  return {
    recoveryKey: true,
    trustedDevices,
    trustedContacts,
  };
}
