import { getApiBaseUrl } from "../api/client";
import {
  setBackendDeploymentMode,
  setBackendEnterpriseModulesActive,
} from "./planEntitlements";
import type { DeploymentMode } from "@okkey/types";

type PublicFeaturesResponse = {
  enterpriseModulesActive?: unknown;
  deploymentMode?: unknown;
};

/**
 * Probe API GET /public/features so Vite ACTIVE cannot show EE UI when the backend is FREE,
 * and so hosted mode is taken only from the API effective mode (never from Vite alone).
 * Fail-open on network errors for modules (keep Vite flag) — only downgrade on an explicit `false`.
 * Hosted mode stays self-hosted until the API reports `saas`.
 */
export async function syncBackendEnterpriseModules(): Promise<void> {
  try {
    const response = await fetch(`${getApiBaseUrl()}/public/features`, {
      method: "GET",
      headers: { Accept: "application/json" },
    });
    if (!response.ok) {
      return;
    }
    const body = (await response.json()) as PublicFeaturesResponse;
    if (typeof body.enterpriseModulesActive === "boolean") {
      setBackendEnterpriseModulesActive(body.enterpriseModulesActive);
    }
    if (body.deploymentMode === "saas" || body.deploymentMode === "self_hosted") {
      setBackendDeploymentMode(body.deploymentMode as DeploymentMode);
    }
  } catch {
    // API unreachable during boot — keep Vite-only module entitlements;
    // hosted mode stays fail-closed (self-hosted) until a successful probe.
  }
}
