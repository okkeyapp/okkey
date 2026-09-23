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
 * Minimum trusted devices (current + at least one more) before the user may
 * enable the trusted-devices recovery method in settings.
 */
export const MIN_TRUSTED_DEVICES_FOR_RECOVERY = 2 as const;

/** Shape needed to gate enabling trusted-devices recovery. */
export type TrustedDeviceGateItem = {
  status: "trusted" | "pending_approval" | "blocked" | string;
  is_current: boolean;
};

/**
 * True when the devices list has ≥ {@link MIN_TRUSTED_DEVICES_FOR_RECOVERY}
 * rows with `status === "trusted"` and at least one of them is `is_current`.
 * Pending / blocked rows do not count.
 */
export function canEnableTrustedDevicesRecovery(
  devices: readonly TrustedDeviceGateItem[] | null | undefined,
): boolean {
  if (!devices?.length) {
    return false;
  }
  const trusted = devices.filter((d) => d.status === "trusted");
  if (trusted.length < MIN_TRUSTED_DEVICES_FOR_RECOVERY) {
    return false;
  }
  return trusted.some((d) => d.is_current);
}

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
