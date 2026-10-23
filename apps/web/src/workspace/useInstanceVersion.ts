import type { WebMessageValues } from "@okkey/i18n";
import { useEffect, useState } from "react";

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

/**
 * Fetch GET /version once for the workspace shell footer.
 * Fail-soft: returns null when the API is unreachable or the payload is invalid.
 */
export function useInstanceVersion(): InstanceVersionInfo | null {
  const [info, setInfo] = useState<InstanceVersionInfo | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(`${getApiBaseUrl()}/version`, {
          method: "GET",
          headers: { Accept: "application/json" },
        });
        if (!response.ok || cancelled) {
          return;
        }
        const body = (await response.json()) as VersionResponseBody;
        const parsed = parseVersionResponse(body);
        if (!cancelled && parsed) {
          setInfo(parsed);
        }
      } catch {
        // API unreachable during boot — omit version line.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return info;
}

export function formatInstanceVersionLabel(
  info: InstanceVersionInfo,
  t: (key: string, values?: WebMessageValues) => string,
): string {
  if (info.enterprise) {
    return t("web.nav.versionWithEnterprise", {
      version: info.okkey,
      enterprise: info.enterprise,
    });
  }
  return t("web.nav.version", { version: info.okkey });
}
