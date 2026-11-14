import type { QueryExecutor } from "../storage/postgres.ts";
import { SystemUpdateError } from "./errors.ts";
import { downloadSignedPackage, fetchUpdateFeed, type FeedFetch } from "./feed.ts";
import { createUpdateFeedCache } from "./feed-cache.ts";
import {
  readRegistryCredentials,
  type RegistryPullCredentials,
  type SignedOfflinePackage,
  type UpdateComponent,
  type UpdateFeedDocument,
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
  minCoreVersion: string | null;
  releaseNotesUrl: string | null;
};

export type ComponentCheckError = "FEED_FETCH_FAILED" | "FEED_INVALID";

/** One component in the system-update popup. A check failure stays on this row. */
export type ComponentUpdateStatus = {
  component: UpdateComponent;
  installedVersion: string;
  update: AvailableUpdate | null;
  checkError: ComponentCheckError | null;
  feedConfigured: boolean;
  minCoreVersion: string | null;
  releaseNotesUrl: string | null;
};

export type SystemUpdateStatus = {
  deploymentMode: "self_hosted" | "saas";
  currentVersion: string;
  commitSha: string | null;
  releaseTag: string | null;
  enterpriseInstalled: boolean;
  enterpriseVersion: string | null;
  feedConfigured: boolean;
  isolated: boolean;
  canApply: boolean;
  updates: AvailableUpdate[];
  /** Okkey, plus Enterprise when those modules are installed. */
  components: ComponentUpdateStatus[];
  dismissed: Partial<Record<UpdateComponent, string>>;
  seen: Partial<Record<UpdateComponent, string>>;
  /**
   * Set only when every configured feed failed.
   * A single feed failure is `components[].checkError` and leaves the other row usable.
   */
  feedError: string | null;
  /**
   * Combined offline archives are listed in the popup.
   * True when POST /system/updates/apply accepts an okkey-offline-bundle document.
   */
  offlineArchiveSupported: boolean;
};

export type UpdateComponentResult = {
  component: UpdateComponent;
  version: string;
  applied: boolean;
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
  /** Set for an offline bundle. Core is first. */
  components?: UpdateComponentResult[];
};

export type UpdateAgentClient = {
  start(
    document: unknown,
    options?: { registryCredentials?: RegistryPullCredentials },
  ): Promise<UpdateJob>;
  get(jobId: string): Promise<UpdateJob | null>;
};

export type SystemUpdateServiceOptions = {
  deploymentMode: "self_hosted" | "saas";
  currentVersion: string;
  /** Full git commit (`OKKEY_GIT_SHA`). Empty on a tagged release. */
  commitSha?: string;
  /** Release tag (`OKKEY_RELEASE_TAG`), for example `v1.0.0-beta.3`. */
  releaseTag?: string;
  enterpriseInstalled: boolean;
  enterpriseVersion: string;
  /** Core (okkey) feed. Resolved from config, including the GitHub Releases default. */
  coreFeedUrl: string;
  /** Separate enterprise feed. Empty keeps enterprise packages on the core feed. */
  enterpriseFeedUrl?: string;
  isolated: boolean;
  /** Clock for the once-a-day feed cache. */
  now?: () => number;
  feedCacheTtlMs?: number;
  fetchImpl?: FeedFetch;
  agent: UpdateAgentClient;
  dismissals?: DismissalStore;
  db?: QueryExecutor;
  isAdmin?: (userId: string) => Promise<boolean>;
};

export function createSystemUpdateService(options: SystemUpdateServiceOptions) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const feedCache = createUpdateFeedCache({ now: options.now, ttlMs: options.feedCacheTtlMs });
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
      const seen = await dismissals.readSeen();
      const enterpriseFeedUrl = (options.enterpriseFeedUrl ?? "").trim();
      const loads =
        options.deploymentMode === "saas"
          ? []
          : await loadComponentFeeds(options, enterpriseFeedUrl, (url) =>
              feedCache.load(url, options.isolated, fetchImpl),
            );
      const installed = {
        okkey: options.currentVersion || "unknown",
        enterprise: options.enterpriseInstalled ? options.enterpriseVersion || "unknown" : null,
      };
      const packages =
        options.deploymentMode === "saas" ? [] : packagesFromFeeds(loads, enterpriseFeedUrl);
      const updates = packages.length > 0 ? selectUpdates(packages, installed) : [];
      const base: SystemUpdateStatus = {
        deploymentMode: options.deploymentMode,
        currentVersion: installed.okkey,
        commitSha: emptyToNull(options.commitSha),
        releaseTag: emptyToNull(options.releaseTag),
        enterpriseInstalled: options.enterpriseInstalled,
        enterpriseVersion: installed.enterprise,
        feedConfigured: configuredFeedUrls(options).some((url) => url.trim() !== ""),
        isolated: options.isolated,
        canApply,
        updates,
        components: componentStatuses(options, loads, updates, installed),
        dismissed,
        seen,
        feedError: aggregateFeedError(loads),
        offlineArchiveSupported: true,
      };
      return base;
    },

    async markSeen(_userId: string, component: UpdateComponent, version: string): Promise<void> {
      await dismissals.markSeen(component, version);
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
      const resolved = await resolveApplyDocument(input, options, fetchImpl);
      return options.agent.start(
        resolved.document,
        resolved.registryCredentials ? { registryCredentials: resolved.registryCredentials } : undefined,
      );
    },

    async job(jobId: string): Promise<UpdateJob | null> {
      return options.agent.get(jobId);
    },
  };
}

export type SystemUpdateService = ReturnType<typeof createSystemUpdateService>;

/** Feed URLs configured for this installation. Each URL is cached on its own. */
function configuredFeedUrls(options: SystemUpdateServiceOptions): string[] {
  return [options.coreFeedUrl, options.enterpriseFeedUrl ?? ""];
}

type FeedLoad = {
  component: UpdateComponent;
  configured: boolean;
  document: { packages: readonly UpdateFeedPackage[] } | null;
  error: ComponentCheckError | null;
};

async function loadComponentFeeds(
  options: SystemUpdateServiceOptions,
  enterpriseFeedUrl: string,
  load: (url: string) => Promise<{ packages: readonly UpdateFeedPackage[] } | null>,
): Promise<FeedLoad[]> {
  const loads: FeedLoad[] = [await readFeed("okkey", options.coreFeedUrl, options.isolated, load)];
  if (options.enterpriseInstalled) {
    loads.push(await readFeed("enterprise", enterpriseFeedUrl, options.isolated, load));
  }
  return loads;
}

async function readFeed(
  component: UpdateComponent,
  feedUrl: string,
  isolated: boolean,
  load: (url: string) => Promise<{ packages: readonly UpdateFeedPackage[] } | null>,
): Promise<FeedLoad> {
  const configured = feedUrl.trim() !== "";
  if (!configured || isolated) {
    return { component, configured, document: null, error: null };
  }
  try {
    const document = await load(feedUrl);
    return { component, configured: true, document, error: null };
  } catch (error) {
    const code =
      error instanceof SystemUpdateError && error.code === "FEED_INVALID"
        ? "FEED_INVALID"
        : "FEED_FETCH_FAILED";
    return { component, configured: true, document: null, error: code };
  }
}

function packagesFromFeeds(loads: readonly FeedLoad[], enterpriseFeedUrl: string): UpdateFeedPackage[] {
  const packages: UpdateFeedPackage[] = [];
  const core = loads.find((load) => load.component === "okkey");
  const enterprise = loads.find((load) => load.component === "enterprise");
  if (core?.document) {
    for (const entry of core.document.packages) {
      if (entry.component === "enterprise" && enterpriseFeedUrl !== "") {
        continue;
      }
      packages.push(entry);
    }
  }
  if (enterprise?.document) {
    for (const entry of enterprise.document.packages) {
      if (entry.component === "enterprise") {
        packages.push(entry);
      }
    }
  }
  return packages;
}

function componentStatuses(
  options: SystemUpdateServiceOptions,
  loads: readonly FeedLoad[],
  updates: readonly AvailableUpdate[],
  installed: { okkey: string; enterprise: string | null },
): ComponentUpdateStatus[] {
  const enterpriseFeedUrl = (options.enterpriseFeedUrl ?? "").trim();
  const core = loads.find((load) => load.component === "okkey");
  const enterprise = loads.find((load) => load.component === "enterprise");
  const rows: ComponentUpdateStatus[] = [
    componentStatus("okkey", installed.okkey, core?.error ?? null, Boolean(core?.configured), updates),
  ];
  if (options.enterpriseInstalled && installed.enterprise) {
    const sharedCoreFeed = enterpriseFeedUrl === "";
    rows.push(
      componentStatus(
        "enterprise",
        installed.enterprise,
        sharedCoreFeed ? core?.error ?? null : enterprise?.error ?? null,
        sharedCoreFeed ? Boolean(core?.configured) : Boolean(enterprise?.configured),
        updates,
      ),
    );
  }
  return rows;
}

function componentStatus(
  component: UpdateComponent,
  installedVersion: string,
  checkError: ComponentCheckError | null,
  feedConfigured: boolean,
  updates: readonly AvailableUpdate[],
): ComponentUpdateStatus {
  const update = checkError ? null : updates.find((entry) => entry.component === component) ?? null;
  return {
    component,
    installedVersion,
    update,
    checkError,
    feedConfigured,
    minCoreVersion: update?.minCoreVersion ?? null,
    releaseNotesUrl: update?.releaseNotesUrl ?? null,
  };
}

function aggregateFeedError(loads: readonly FeedLoad[]): string | null {
  const configured = loads.filter((load) => load.configured && load.error);
  const attempted = loads.filter((load) => load.configured);
  if (attempted.length === 0 || configured.length !== attempted.length) {
    return null;
  }
  return configured[0]?.error ?? "FEED_FETCH_FAILED";
}

function emptyToNull(value: string | undefined): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed ? trimmed : null;
}

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
      minCoreVersion: entry.minCoreVersion,
      releaseNotesUrl: entry.releaseNotesUrl,
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
): Promise<{ document: unknown; registryCredentials?: RegistryPullCredentials }> {
  if (input.source === "file") {
    if (!input.document || typeof input.document !== "object" || Array.isArray(input.document)) {
      throw new SystemUpdateError(400, "PACKAGE_INVALID", "A package file is required");
    }
    const record = { ...(input.document as Record<string, unknown>) };
    const registryCredentials = readRegistryCredentials(record.registryCredentials, "PACKAGE_INVALID");
    delete record.registryCredentials;
    const document = record as SignedOfflinePackage;
    if (document.payload?.component !== "enterprise") {
      return { document };
    }
    return { document, registryCredentials };
  }
  if (input.component !== "okkey" && input.component !== "enterprise") {
    throw new SystemUpdateError(400, "PACKAGE_INVALID", "A package component is required");
  }
  const feedUrl = feedUrlForComponent(input.component, options);
  if (options.isolated || feedUrl.trim() === "") {
    throw new SystemUpdateError(
      400,
      "FEED_UNAVAILABLE",
      "No update feed is configured. Select an offline package file.",
    );
  }
  const feed = await fetchUpdateFeed(feedUrl, options.isolated, fetchImpl);
  const match = feed?.packages
    .filter((entry) => entry.component === input.component)
    .sort((left, right) => (isNewerVersion(left.version, right.version) ? -1 : 1))[0];
  if (!feed || !match) {
    throw new SystemUpdateError(404, "FEED_UNAVAILABLE", "The feed has no package for that component");
  }
  const document = await downloadSignedPackage(match.packageUrl, match.packageSha256, fetchImpl);
  const registryCredentials =
    input.component === "enterprise" ? (match.registryCredentials ?? feed.registryCredentials) : undefined;
  return { document, registryCredentials };
}

function feedUrlForComponent(
  component: UpdateComponent,
  options: SystemUpdateServiceOptions,
): string {
  const enterpriseFeedUrl = (options.enterpriseFeedUrl ?? "").trim();
  if (component === "enterprise" && enterpriseFeedUrl !== "") {
    return enterpriseFeedUrl;
  }
  return options.coreFeedUrl;
}
