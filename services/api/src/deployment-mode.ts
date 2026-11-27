/**
 * Effective product deployment mode.
 *
 * Hosted (`saas`) is real only when the env requests it **and** the loaded
 * enterprise plugin confirms a signed hosted token via
 * `setHostedDeploymentConfirmed(true)`. An environment variable alone never
 * makes an instance hosted — without confirmation the instance runs as
 * self-hosted (license verify/lapse gates apply; `plan_tier` is ignored).
 */
import type { DeploymentMode } from "./config.ts";

export type DeploymentModeResolutionInput = {
  /**
   * Env request (`OKKEY_DEPLOYMENT_MODE`). When set, hosted requires
   * {@link hostedDeploymentConfirmed} as well.
   */
  deploymentModeRequested?: DeploymentMode | null;
  /**
   * Plugin confirmation of a signed hosted token. Default / unset → not confirmed
   * when {@link deploymentModeRequested} is present.
   */
  hostedDeploymentConfirmed?: boolean | null;
  /**
   * Already-effective mode (synced `ApiConfig.deploymentMode`) or a legacy
   * single-field caller. Used when `deploymentModeRequested` is omitted.
   */
  deploymentMode?: DeploymentMode | null;
};

/**
 * Resolve hosted vs self-hosted for entitlements, routes, and `/public/features`.
 * Call this instead of reading `OKKEY_DEPLOYMENT_MODE` / raw env.
 */
export function effectiveDeploymentMode(input: DeploymentModeResolutionInput): DeploymentMode {
  if (input.deploymentModeRequested != null) {
    return input.deploymentModeRequested === "saas" && input.hostedDeploymentConfirmed === true
      ? "saas"
      : "self_hosted";
  }
  // Synced effective value or legacy callers that only pass `deploymentMode`.
  if (input.hostedDeploymentConfirmed === false) {
    return "self_hosted";
  }
  return input.deploymentMode === "saas" ? "saas" : "self_hosted";
}

/** True when the env asks for hosted but the plugin has not confirmed it. */
export function hostedDeploymentRequestedWithoutConfirmation(input: {
  deploymentModeRequested: DeploymentMode;
  hostedDeploymentConfirmed: boolean;
}): boolean {
  return input.deploymentModeRequested === "saas" && input.hostedDeploymentConfirmed !== true;
}
