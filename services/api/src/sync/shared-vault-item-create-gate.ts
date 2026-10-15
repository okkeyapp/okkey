import type { VaultRecord, WorkspaceRecord } from "../storage/repositories.ts";
import {
  workspaceHasPlanFeature,
  type PlanEntitlementRuntimeConfig,
} from "../plan-entitlements.ts";

export type SharedVaultItemCreateGateResult =
  | { ok: true }
  | { ok: false; code: "PLAN_FEATURE_REQUIRED" | "WORKSPACE_NOT_FOUND"; statusCode: number; message: string };

/**
 * After EE→FREE, existing shared vaults stay readable/editable, but ITEM_CREATE
 * (including move-into shared) requires the `sharedVaults` plan feature.
 */
export function evaluateSharedVaultItemCreateGate(input: {
  vault: VaultRecord;
  workspace: WorkspaceRecord | null;
  config: PlanEntitlementRuntimeConfig;
}): SharedVaultItemCreateGateResult {
  if (input.vault.isPersonal) {
    return { ok: true };
  }
  if (!input.workspace) {
    return {
      ok: false,
      code: "WORKSPACE_NOT_FOUND",
      statusCode: 404,
      message: "workspace not found",
    };
  }
  if (!workspaceHasPlanFeature(input.config, input.workspace, "sharedVaults")) {
    return {
      ok: false,
      code: "PLAN_FEATURE_REQUIRED",
      statusCode: 403,
      message: "shared vaults require a paid plan",
    };
  }
  return { ok: true };
}
