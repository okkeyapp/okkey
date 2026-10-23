import type { WebMessageValues } from "@okkey/i18n";
import { useCallback, useEffect, useState } from "react";

import { getApiBaseUrl } from "../api/client";

export type InstanceVersionInfo = {
  okkey: string;
  enterprise: string | null;
  deploymentMode: "self_hosted" | "saas";
  enterpriseModulesEnabled: boolean;
};

type VersionResponseBody = {
  okkey?: unknown;
  enterprise?: unknown;
  deploymentMode?: unknown;
  enterpriseModulesEnabled?: unknown;
};

function parseVersionResponse(body: VersionResponseBody): InstanceVersionInfo | null {
  if (typeof body.okkey !== "string" || body.okkey.trim() === "") {
    return null;
  }
  const deploymentMode =
    body.deploymentMode === "saas" || body.deploymentMode === "self_hosted"
      ? body.deploymentMode
      : null;
  if (!deploymentMode) {
    return null;
  }
  const enterprise =
    typeof body.enterprise === "string" && body.enterprise.trim() !== ""
      ? body.enterprise.trim()
      : null;
  return {
    okkey: body.okkey.trim(),
    enterprise,
    deploymentMode,
    enterpriseModulesEnabled: body.enterpriseModulesEnabled === true,
  };
}

export async function fetchInstanceVersion(
  signal?: AbortSignal,
): Promise<InstanceVersionInfo | null> {
  try {
    const response = await fetch(`${getApiBaseUrl()}/version`, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal,
      cache: "no-store",
    });
    if (!response.ok) {
      return null;
    }
    const body = (await response.json()) as VersionResponseBody;
    return parseVersionResponse(body);
  } catch {
    return null;
  }
}

/**
 * Fetch GET /version for the workspace shell footer.
 * Fail-soft: returns null when the API is unreachable or the payload is invalid.
 */
export function useInstanceVersion(): {
  info: InstanceVersionInfo | null;
  refetch: () => Promise<InstanceVersionInfo | null>;
} {
  const [info, setInfo] = useState<InstanceVersionInfo | null>(null);

  const refetch = useCallback(async (): Promise<InstanceVersionInfo | null> => {
    const parsed = await fetchInstanceVersion();
    setInfo(parsed);
    return parsed;
  }, []);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    void (async () => {
      const parsed = await fetchInstanceVersion(controller.signal);
      if (!cancelled) {
        setInfo(parsed);
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, []);

  return { info, refetch };
}

/**
 * Single product line for the sidebar plaque: `Okkey v{okkey}` from `/version`.
 * Do not split okkey vs okkey-enterprise in the UI — versions coincide for product display.
 */
export function formatInstanceVersionLabel(
  info: InstanceVersionInfo,
  t: (key: string, values?: WebMessageValues) => string,
): string {
  return t("web.nav.okkeyVersion", { version: info.okkey });
}
