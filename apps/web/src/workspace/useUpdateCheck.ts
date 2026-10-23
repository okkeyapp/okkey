import { useEffect, useState } from "react";

import { getApiBaseUrl } from "../api/client";

export type AvailableUpdateInfo = {
  id: "okkey" | "okkey-enterprise";
  from: string;
  to: string;
  notes: string | null;
};

export type UpdateCheckInfo = {
  deploymentMode: "self_hosted" | "saas";
  feedConfigured: boolean;
  current: { okkey: string; enterprise: string | null };
  available: AvailableUpdateInfo[];
};

type UpdatesCheckBody = {
  deploymentMode?: unknown;
  feedConfigured?: unknown;
  current?: { okkey?: unknown; enterprise?: unknown };
  available?: unknown;
};

function parseAvailable(raw: unknown): AvailableUpdateInfo[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const out: AvailableUpdateInfo[] = [];
  for (const item of raw) {
    if (item === null || typeof item !== "object" || Array.isArray(item)) {
      continue;
    }
    const row = item as Record<string, unknown>;
    if (row.id !== "okkey" && row.id !== "okkey-enterprise") {
      continue;
    }
    if (typeof row.from !== "string" || typeof row.to !== "string") {
      continue;
    }
    out.push({
      id: row.id,
      from: row.from,
      to: row.to,
      notes: typeof row.notes === "string" ? row.notes : null,
    });
  }
  return out;
}

function parseUpdateCheck(body: UpdatesCheckBody): UpdateCheckInfo | null {
  if (body.deploymentMode !== "self_hosted" && body.deploymentMode !== "saas") {
    return null;
  }
  if (typeof body.current?.okkey !== "string" || body.current.okkey.trim() === "") {
    return null;
  }
  const enterprise =
    typeof body.current.enterprise === "string" && body.current.enterprise.trim() !== ""
      ? body.current.enterprise.trim()
      : null;
  return {
    deploymentMode: body.deploymentMode,
    feedConfigured: body.feedConfigured === true,
    current: { okkey: body.current.okkey.trim(), enterprise },
    available: parseAvailable(body.available),
  };
}

/**
 * Fetch GET /updates/check once for self-host update UX.
 * Fail-soft: null when unreachable / invalid. License is never consulted.
 */
export function useUpdateCheck(): UpdateCheckInfo | null {
  const [info, setInfo] = useState<UpdateCheckInfo | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(`${getApiBaseUrl()}/updates/check`, {
          method: "GET",
          headers: { Accept: "application/json" },
        });
        if (!response.ok || cancelled) {
          return;
        }
        const body = (await response.json()) as UpdatesCheckBody;
        const parsed = parseUpdateCheck(body);
        if (!cancelled && parsed) {
          setInfo(parsed);
        }
      } catch {
        // API unreachable — omit update check.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return info;
}

/** Compact from→to summary for smoke / later sidebar notice (u3). */
export function formatAvailableUpdatesSummary(info: UpdateCheckInfo): string | null {
  if (info.deploymentMode !== "self_hosted" || info.available.length === 0) {
    return null;
  }
  return info.available.map((u) => `${u.id} ${u.from}→${u.to}`).join("; ");
}
