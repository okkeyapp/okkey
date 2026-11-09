import type { QueryExecutor } from "../storage/postgres.ts";
import { SystemUpdateError } from "./errors.ts";
import { downloadSignedPackage, fetchUpdateFeed, type FeedFetch } from "./feed.ts";
import {
  type SignedOfflinePackage,
  type UpdateComponent,
  type UpdateFeedPackage,
} from "./package-format.ts";
import { isNewerVersion, shouldShowUpdate } from "./versions.ts";
import { memoryDismissalStore, postgresDismissalStore, type DismissalStore } from "./dismiss.ts";

export type AvailableUpdate = {
  component: UpdateComponent;
  fromVersion: string;
  toVersion: string;
  summary: string;
  releasedAt: string;
  source: "feed";
};

export type SystemUpdateStatus = {
  deploymentMode: "self_hosted" | "saas";
  currentVersion: string;
  enterpriseInstalled: boolean;
  enterpriseVersion: string | null;
  feedConfigured: boolean;
  isolated: boolean;
  canApply: boolean;
  updates: AvailableUpdate[];
  dismissed: Partial<Record<UpdateComponent, string>>;
  feedError: string | null;
};

export type UpdateJobPhase = "verifying" | "downloading" | "applying" | "succeeded" | "failed";

export type UpdateJob = {
  id: string;
  status: UpdateJobPhase;
  progress: number;
  component: UpdateComponent;
  fromVersion: string;
  toVersion: string;
  errorCode?: string;
  errorMessage?: string;
};

export type UpdateAgentClient = {
  start(document: SignedOfflinePackage): Promise<UpdateJob>;
  get(jobId: string): Promise<UpdateJob | null>;
};

export type SystemUpdateServiceOptions = {
  deploymentMode: "self_hosted" | "saas";
  currentVersion: string;
  enterpriseInstalled: boolean;
  enterpriseVersion: string;
  feedUrl: string;
  isolated: boolean;
  fetchImpl?: FeedFetch;
  agent: UpdateAgentClient;
  dismissals?: DismissalStore;
  db?: QueryExecutor;
  isAdmin?: (userId: string) => Promise<boolean>;
};

export function createSystemUpdateService(options: SystemUpdateServiceOptions) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const dismissals =
    options.dismissals ??
    (options.db ? postgresDismissalStore(options.db) : memoryDismissalStore());
  const isAdmin =
    options.isAdmin ??
    (async (userId: string) => {
      if (!options.db) {
        return false;
      }
      const rows = await options.db.query<{ ok: number }>(
        "SELECT 1 AS ok FROM workspaces WHERE owner_id = $1 LIMIT 1",
        [userId],
      );
      return rows.length > 0;
    });

  return {
    /** License and plan tier are intentionally not read. */
    async userCanApply(userId: string): Promise<boolean> {
      return isAdmin(userId);
    },

    async statusFor(userId: string): Promise<SystemUpdateStatus> {
      const canApply = await isAdmin(userId);
      const dismissed = await dismissals.read();
      const base: SystemUpdateStatus = {
        deploymentMode: options.deploymentMode,
        currentVersion: options.currentVersion || "unknown",
        enterpriseInstalled: options.enterpriseInstalled,
        enterpriseVersion: options.enterpriseInstalled
          ? options.enterpriseVersion || "unknown"
          : null,
        feedConfigured: options.feedUrl.trim() !== "",
        isolated: options.isolated,
        canApply,
        updates: [],
        dismissed,
        feedError: null,
      };
      if (options.deploymentMode === "saas") {
        return base;
      }
      try {
        const feed = await fetchUpdateFeed(options.feedUrl, options.isolated, fetchImpl);
        if (!feed) {
          return base;
        }
        base.updates = selectUpdates(feed.packages, {
          okkey: base.currentVersion,
          enterprise: options.enterpriseInstalled ? options.enterpriseVersion || "unknown" : null,
        });
        return base;
      } catch (error) {
        base.feedError = error instanceof SystemUpdateError ? error.code : "FEED_FETCH_FAILED";
        return base;
      }
    },

    async dismiss(userId: string, component: UpdateComponent, version: string): Promise<void> {
      if (!(await isAdmin(userId))) {
        throw new SystemUpdateError(403, "NOT_ADMIN", "Only a workspace owner can dismiss updates");
      }
      await dismissals.dismiss(component, version);
    },

    async apply(
      userId: string,
      input: { source: "feed" | "file"; component?: UpdateComponent; document?: unknown },
    ): Promise<UpdateJob> {
      if (!(await isAdmin(userId))) {
        throw new SystemUpdateError(403, "NOT_ADMIN", "Only a workspace owner can apply updates");
      }
      const document = await resolveApplyDocument(input, options, fetchImpl);
      return options.agent.start(document);
    },

    async job(jobId: string): Promise<UpdateJob | null> {
      return options.agent.get(jobId);
    },
  };
}

export type SystemUpdateService = ReturnType<typeof createSystemUpdateService>;

export function selectUpdates(
  packages: readonly UpdateFeedPackage[],
  installed: { okkey: string; enterprise: string | null },
): AvailableUpdate[] {
  const best = new Map<UpdateComponent, UpdateFeedPackage>();
  for (const entry of packages) {
    if (entry.component === "enterprise" && installed.enterprise === null) {
      continue;
    }
    const current = entry.component === "okkey" ? installed.okkey : installed.enterprise ?? "unknown";
    if (!isNewerVersion(entry.version, current)) {
      continue;
    }
    const previous = best.get(entry.component);
    if (!previous || isNewerVersion(entry.version, previous.version)) {
      best.set(entry.component, entry);
    }
  }
  return [...best.values()]
    .sort((left, right) => Number(left.component !== "okkey") - Number(right.component !== "okkey"))
    .map((entry) => ({
    component: entry.component,
    fromVersion: entry.component === "okkey" ? installed.okkey : installed.enterprise ?? "unknown",
    toVersion: entry.version,
    summary: entry.summary,
    releasedAt: entry.releasedAt,
    source: "feed" as const,
  }));
}

export function visibleUpdates(
  updates: readonly AvailableUpdate[],
  dismissed: Partial<Record<UpdateComponent, string>>,
  localDismissed: Partial<Record<UpdateComponent, string>> = {},
): AvailableUpdate[] {
  return updates.filter((update) => {
    const server = dismissed[update.component];
    const local = localDismissed[update.component];
    return shouldShowUpdate(update.toVersion, server) && shouldShowUpdate(update.toVersion, local);
  });
}

async function resolveApplyDocument(
  input: { source: "feed" | "file"; component?: UpdateComponent; document?: unknown },
  options: SystemUpdateServiceOptions,
  fetchImpl: FeedFetch,
): Promise<SignedOfflinePackage> {
  if (input.source === "file") {
    if (!input.document || typeof input.document !== "object") {
      throw new SystemUpdateError(400, "PACKAGE_INVALID", "A package file is required");
    }
    return input.document as SignedOfflinePackage;
  }
  if (options.isolated || options.feedUrl.trim() === "") {
    throw new SystemUpdateError(
      400,
      "FEED_UNAVAILABLE",
      "No update feed is configured. Select an offline package file.",
    );
  }
  if (input.component !== "okkey" && input.component !== "enterprise") {
    throw new SystemUpdateError(400, "PACKAGE_INVALID", "A package component is required");
  }
  const feed = await fetchUpdateFeed(options.feedUrl, options.isolated, fetchImpl);
  const match = feed?.packages
    .filter((entry) => entry.component === input.component)
    .sort((left, right) => (isNewerVersion(left.version, right.version) ? -1 : 1))[0];
  if (!feed || !match) {
    throw new SystemUpdateError(404, "FEED_UNAVAILABLE", "The feed has no package for that component");
  }
  return downloadSignedPackage(match.packageUrl, match.packageSha256, fetchImpl);
}
