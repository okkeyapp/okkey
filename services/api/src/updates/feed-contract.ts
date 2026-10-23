/**
 * Update feed contract (system-updates-popup subtask 2).
 *
 * One transport-agnostic JSON shape for URL / file / perimeter catalog.
 * Do not hard-require license.okkey.io — empty feed config means no check.
 */

export const UPDATE_FEED_SCHEMA_VERSION = 1 as const;

export type UpdateFeedComponentId = "okkey" | "okkey-enterprise";

export type UpdateFeedComponent = {
  id: UpdateFeedComponentId;
  version: string;
  /** Short changelog / highlights for the modal (optional). */
  notes?: string;
  /** Optional package location (URL or perimeter path); apply flow uses later. */
  packageUrl?: string;
  /** Optional content digest (e.g. sha256:…). */
  digest?: string;
};

export type UpdateFeedDocument = {
  schemaVersion: typeof UPDATE_FEED_SCHEMA_VERSION;
  generatedAt?: string;
  components: UpdateFeedComponent[];
};

export type AvailableUpdate = {
  id: UpdateFeedComponentId;
  from: string;
  to: string;
  notes: string | null;
  packageUrl: string | null;
  digest: string | null;
};

export type UpdateCheckResult = {
  deploymentMode: "self_hosted" | "saas";
  /** True when a feed URL or path is configured. */
  feedConfigured: boolean;
  current: {
    okkey: string;
    enterprise: string | null;
  };
  available: AvailableUpdate[];
};

function isComponentId(value: unknown): value is UpdateFeedComponentId {
  return value === "okkey" || value === "okkey-enterprise";
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/** Parse and validate a feed document; throws on invalid shape. */
export function parseUpdateFeedDocument(raw: unknown): UpdateFeedDocument {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("UPDATE_FEED_INVALID: root must be an object");
  }
  const root = raw as Record<string, unknown>;
  if (root.schemaVersion !== UPDATE_FEED_SCHEMA_VERSION) {
    throw new Error(
      `UPDATE_FEED_INVALID: schemaVersion must be ${UPDATE_FEED_SCHEMA_VERSION}`,
    );
  }
  if (!Array.isArray(root.components)) {
    throw new Error("UPDATE_FEED_INVALID: components must be an array");
  }

  const components: UpdateFeedComponent[] = [];
  for (const item of root.components) {
    if (item === null || typeof item !== "object" || Array.isArray(item)) {
      throw new Error("UPDATE_FEED_INVALID: component must be an object");
    }
    const row = item as Record<string, unknown>;
    if (!isComponentId(row.id)) {
      throw new Error("UPDATE_FEED_INVALID: component.id must be okkey|okkey-enterprise");
    }
    const version = asNonEmptyString(row.version);
    if (!version) {
      throw new Error("UPDATE_FEED_INVALID: component.version required");
    }
    const notes = asNonEmptyString(row.notes) ?? undefined;
    const packageUrl = asNonEmptyString(row.packageUrl) ?? undefined;
    const digest = asNonEmptyString(row.digest) ?? undefined;
    components.push({ id: row.id, version, notes, packageUrl, digest });
  }

  return {
    schemaVersion: UPDATE_FEED_SCHEMA_VERSION,
    generatedAt: asNonEmptyString(root.generatedAt) ?? undefined,
    components,
  };
}

type ParsedProductVersion = {
  core: number[];
  /** null = stable release (e.g. `1.0.0`). */
  prerelease: { label: string; n: number } | null;
};

/**
 * Parse product versions: `1.0.0`, `1.0.0-betta.3` (intentional spelling **betta**).
 * Returns null for opaque tags (`dev`, `staging-2`).
 */
export function parseProductVersion(raw: string): ParsedProductVersion | null {
  const v = raw.trim().replace(/^v/i, "");
  if (v === "") {
    return null;
  }
  const match = /^(\d+(?:\.\d+)*)(?:-([A-Za-z]+)\.(\d+))?$/.exec(v);
  if (!match) {
    return null;
  }
  const core = match[1]!.split(".").map((p) => Number(p));
  if (match[2] !== undefined && match[3] !== undefined) {
    return {
      core,
      prerelease: { label: match[2].toLowerCase(), n: Number(match[3]) },
    };
  }
  return { core, prerelease: null };
}

/**
 * Compare version strings for "is feed newer than current?".
 * Product scheme: `1.0.0-betta.N` prereleases, then stable `1.0.0`.
 * - `1.0.0-betta.4` > `1.0.0-betta.3`
 * - stable `1.0.0` > any `1.0.0-betta.*`
 * Opaque tags (`staging-2` vs `dev`): any non-equal feed counts as available.
 */
export function isFeedVersionNewer(current: string, feed: string): boolean {
  const a = current.trim();
  const b = feed.trim();
  if (a === "" || b === "" || a === b) {
    return false;
  }

  const pa = parseProductVersion(a);
  const pb = parseProductVersion(b);
  if (pa && pb) {
    const len = Math.max(pa.core.length, pb.core.length);
    for (let i = 0; i < len; i += 1) {
      const x = pa.core[i] ?? 0;
      const y = pb.core[i] ?? 0;
      if (y > x) return true;
      if (y < x) return false;
    }
    // Equal numeric core: stable > any prerelease; else compare label then N.
    if (pa.prerelease === null && pb.prerelease === null) {
      return false;
    }
    if (pa.prerelease !== null && pb.prerelease === null) {
      return true; // feed is stable
    }
    if (pa.prerelease === null && pb.prerelease !== null) {
      return false; // current already stable
    }
    const la = pa.prerelease!;
    const lb = pb.prerelease!;
    if (la.label !== lb.label) {
      return lb.label > la.label;
    }
    return lb.n > la.n;
  }

  return true;
}

/**
 * Which feed components to consider for this workspace plan.
 * FREE (and non-ENTERPRISE) → okkey only; ENTERPRISE → okkey + okkey-enterprise.
 * Gate on plan_tier / entitlement, not only enterpriseModulesEnabled.
 */
export function updateComponentsForPlanTier(
  planTier: string | null | undefined,
): ReadonlySet<UpdateFeedComponentId> {
  const tier = (planTier ?? "").trim().toUpperCase();
  if (tier === "ENTERPRISE") {
    return new Set<UpdateFeedComponentId>(["okkey", "okkey-enterprise"]);
  }
  return new Set<UpdateFeedComponentId>(["okkey"]);
}

export function diffAvailableUpdates(input: {
  deploymentMode: "self_hosted" | "saas";
  feedConfigured: boolean;
  currentOkkey: string;
  currentEnterprise: string | null;
  feed: UpdateFeedDocument | null;
  /**
   * Workspace plan_tier (or entitlement). Defaults to FREE-style (okkey only).
   * ENTERPRISE also considers okkey-enterprise when a current enterprise version is known.
   */
  planTier?: string | null;
}): UpdateCheckResult {
  const current = {
    okkey: input.currentOkkey,
    enterprise: input.currentEnterprise,
  };

  if (input.deploymentMode !== "self_hosted" || !input.feedConfigured || !input.feed) {
    return {
      deploymentMode: input.deploymentMode,
      feedConfigured: input.feedConfigured,
      current,
      available: [],
    };
  }

  const allowed = updateComponentsForPlanTier(input.planTier);
  const available: AvailableUpdate[] = [];
  for (const component of input.feed.components) {
    if (!allowed.has(component.id)) {
      continue;
    }
    if (component.id === "okkey") {
      if (isFeedVersionNewer(input.currentOkkey, component.version)) {
        available.push({
          id: "okkey",
          from: input.currentOkkey,
          to: component.version,
          notes: component.notes ?? null,
          packageUrl: component.packageUrl ?? null,
          digest: component.digest ?? null,
        });
      }
      continue;
    }
    // okkey-enterprise: ENTERPRISE plan only, and only when a current version is known.
    if (input.currentEnterprise === null) {
      continue;
    }
    if (isFeedVersionNewer(input.currentEnterprise, component.version)) {
      available.push({
        id: "okkey-enterprise",
        from: input.currentEnterprise,
        to: component.version,
        notes: component.notes ?? null,
        packageUrl: component.packageUrl ?? null,
        digest: component.digest ?? null,
      });
    }
  }

  return {
    deploymentMode: input.deploymentMode,
    feedConfigured: true,
    current,
    available,
  };
}
