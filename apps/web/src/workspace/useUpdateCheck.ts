import { useCallback, useEffect, useState } from "react";

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

/** Client-side gate aligned with `/updates/check?planTier=`: FREE → okkey only. */
export function filterAvailableUpdatesForPlanTier(
  available: readonly AvailableUpdateInfo[],
  planTier: string | null | undefined,
): AvailableUpdateInfo[] {
  const tier = (planTier ?? "").trim().toUpperCase();
  if (tier === "ENTERPRISE") {
    return [...available];
  }
  return available.filter((item) => item.id === "okkey");
}

export type FetchUpdateCheckOptions = {
  planTier?: string | null;
  /** Abort in-flight request when the caller unmounts / supersedes. */
  signal?: AbortSignal;
};

/**
 * Fetch GET /updates/check (always hits the network — used for plaque click re-check).
 * Fail-soft: null when unreachable / invalid. License is never consulted.
 */
export async function fetchUpdateCheck(
  options: FetchUpdateCheckOptions = {},
): Promise<UpdateCheckInfo | null> {
  const params = new URLSearchParams();
  const planTier = options.planTier?.trim();
  if (planTier) {
    params.set("planTier", planTier);
  }
  const query = params.toString();
  const url = `${getApiBaseUrl()}/updates/check${query ? `?${query}` : ""}`;
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: options.signal,
      cache: "no-store",
    });
    if (!response.ok) {
      return null;
    }
    const body = (await response.json()) as UpdatesCheckBody;
    const parsed = parseUpdateCheck(body);
    if (!parsed) {
      return null;
    }
    return {
      ...parsed,
      available: filterAvailableUpdatesForPlanTier(parsed.available, options.planTier),
    };
  } catch {
    return null;
  }
}

export type UseUpdateCheckResult = {
  info: UpdateCheckInfo | null;
  /** True while a check (auto or manual) is in flight. */
  checking: boolean;
  /** Re-fetch `/updates/check` (no stale cache). */
  refetch: () => Promise<UpdateCheckInfo | null>;
  setInfo: (info: UpdateCheckInfo | null) => void;
};

/**
 * Background probe of GET /updates/check for self-host update UX.
 * Pass workspace `planTier` so FREE never surfaces okkey-enterprise rows.
 */
export function useUpdateCheck(planTier?: string | null): UseUpdateCheckResult {
  const [info, setInfo] = useState<UpdateCheckInfo | null>(null);
  const [checking, setChecking] = useState(false);

  const refetch = useCallback(async (): Promise<UpdateCheckInfo | null> => {
    setChecking(true);
    try {
      const parsed = await fetchUpdateCheck({ planTier });
      setInfo(parsed);
      return parsed;
    } finally {
      setChecking(false);
    }
  }, [planTier]);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    setChecking(true);
    void (async () => {
      const parsed = await fetchUpdateCheck({ planTier, signal: controller.signal });
      if (!cancelled) {
        setInfo(parsed);
        setChecking(false);
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [planTier]);

  return { info, checking, refetch, setInfo };
}

/** Product target version for plaque/popup (okkey component, else first available). */
export function primaryUpdateTargetVersion(info: UpdateCheckInfo): string | null {
  const okkey = info.available.find((u) => u.id === "okkey");
  if (okkey) {
    return okkey.to;
  }
  return info.available[0]?.to ?? null;
}

/** Short changelog bullets from available notes (newline / `;` / `•` separated). */
export function updateChangelogBullets(
  info: UpdateCheckInfo,
  maxItems = 5,
): string[] {
  const chunks: string[] = [];
  for (const item of info.available) {
    if (!item.notes?.trim()) {
      continue;
    }
    for (const part of item.notes.split(/[\n;•]+/)) {
      const trimmed = part.trim();
      if (trimmed) {
        chunks.push(trimmed);
      }
    }
  }
  return chunks.slice(0, maxItems);
}

/** Public release notes URL for the target Core version. */
export function okkeyReleaseNotesUrl(version: string): string {
  const v = version.trim().replace(/^v/i, "");
  return `https://github.com/okkeyapp/okkey/releases/tag/v${encodeURIComponent(v)}`;
}

/** True when self-host has at least one available update (after plan filter). */
export function hasAvailableUpdates(info: UpdateCheckInfo | null): boolean {
  return Boolean(info && info.deploymentMode === "self_hosted" && info.available.length > 0);
}

/** Compact from→to summary for smoke / diagnostics. */
export function formatAvailableUpdatesSummary(info: UpdateCheckInfo): string | null {
  if (info.deploymentMode !== "self_hosted" || info.available.length === 0) {
    return null;
  }
  return info.available.map((u) => `${u.id} ${u.from}→${u.to}`).join("; ");
}
