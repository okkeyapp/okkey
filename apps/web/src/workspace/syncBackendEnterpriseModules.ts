import { getApiBaseUrl } from "../api/client";
import { setBackendEnterpriseModulesActive } from "./planEntitlements";

type PublicFeaturesResponse = {
  enterpriseModulesActive?: unknown;
};

/**
 * Probe API GET /public/features so Vite ACTIVE cannot show EE UI when the backend is FREE.
 * Fail-open on network errors (keep Vite flag) — only downgrade on an explicit `false`.
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
  } catch {
    // API unreachable during boot — keep Vite-only entitlements.
  }
}
