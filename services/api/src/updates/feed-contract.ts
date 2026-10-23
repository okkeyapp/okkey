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

/**
 * Compare version strings for "is feed newer than current?".
 * Prefer dotted numeric / semver-like; otherwise any non-equal feed version counts as available
 * (supports mock tags like `staging-2` vs `dev`).
 */
export function isFeedVersionNewer(current: string, feed: string): boolean {
  const a = current.trim();
  const b = feed.trim();
  if (a === "" || b === "" || a === b) {
    return false;
  }

  const parseParts = (v: string): number[] | null => {
    const core = v.replace(/^v/i, "").split("-")[0] ?? v;
    if (!/^\d+(\.\d+)*$/.test(core)) {
      return null;
    }
    return core.split(".").map((p) => Number(p));
  };

  const pa = parseParts(a);
  const pb = parseParts(b);
  if (pa && pb) {
    const len = Math.max(pa.length, pb.length);
    for (let i = 0; i < len; i += 1) {
      const x = pa[i] ?? 0;
      const y = pb[i] ?? 0;
      if (y > x) return true;
      if (y < x) return false;
    }
    // Equal numeric core: treat pre-release / tag suffix difference as newer when strings differ.
    return b !== a;
  }

  return true;
}

export function diffAvailableUpdates(input: {
  deploymentMode: "self_hosted" | "saas";
  feedConfigured: boolean;
  currentOkkey: string;
  currentEnterprise: string | null;
  feed: UpdateFeedDocument | null;
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

  const available: AvailableUpdate[] = [];
  for (const component of input.feed.components) {
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
    // okkey-enterprise: only when enterprise is installed (current version known).
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
