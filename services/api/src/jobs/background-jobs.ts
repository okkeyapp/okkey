import type { CapsuleService } from "../capsule/service.ts";
import type { ItemPurgeService } from "../item-purge/service.ts";
import type { Logger } from "../logger.ts";

export type BackgroundJobHandles = {
  stop(): void;
};

export type BackgroundJobsDeps = {
  itemPurgeService: Pick<ItemPurgeService, "purgeExpiredSoftDeletes">;
  capsuleService: Pick<CapsuleService, "purgeDueCapsules">;
  logger: Pick<Logger, "info" | "error">;
  /** Soft-deleted vault items hard-purge interval (default 1h). */
  itemPurgeIntervalMs?: number;
  /** Expired capsule cleanup interval (default 60s). */
  capsuleCleanupIntervalMs?: number;
  /** When true, run each job once immediately on start. */
  runImmediately?: boolean;
};

/**
 * Periodic background jobs for Okkey Core.
 *
 * Jobs:
 * - `item-purge` — hard-delete soft-deleted vault items past retention (and their attachments)
 * - `capsule-cleanup` — delete capsules past `delete_at` and their object-storage files
 *
 * Transactional email is still sent from the API process (sync / fire-and-forget).
 * A Redis-backed email/outbox consumer can plug in here later without changing the API surface.
 */
export function startBackgroundJobs(deps: BackgroundJobsDeps): BackgroundJobHandles {
  const itemPurgeIntervalMs = deps.itemPurgeIntervalMs ?? 60 * 60 * 1000;
  const capsuleCleanupIntervalMs = deps.capsuleCleanupIntervalMs ?? 60_000;

  const runItemPurge = (): void => {
    void deps.itemPurgeService.purgeExpiredSoftDeletes().catch((error: unknown) => {
      deps.logger.error("deleted items purge failed", {
        error: error instanceof Error ? error.message : "unknown error",
      });
    });
  };

  const runCapsuleCleanup = (): void => {
    void deps.capsuleService.purgeDueCapsules().catch((error: unknown) => {
      deps.logger.error("capsule cleanup failed", {
        error: error instanceof Error ? error.message : "unknown error",
      });
    });
  };

  if (deps.runImmediately !== false) {
    runItemPurge();
    runCapsuleCleanup();
  }

  const purgeTimer = setInterval(runItemPurge, itemPurgeIntervalMs);
  purgeTimer.unref();

  const capsuleCleanupTimer = setInterval(runCapsuleCleanup, capsuleCleanupIntervalMs);
  capsuleCleanupTimer.unref();

  deps.logger.info("background jobs started", {
    jobs: ["item-purge", "capsule-cleanup"],
    itemPurgeIntervalMs,
    capsuleCleanupIntervalMs,
  });

  return {
    stop() {
      clearInterval(purgeTimer);
      clearInterval(capsuleCleanupTimer);
      deps.logger.info("background jobs stopped");
    },
  };
}

/** Default: run in-process on API when not production; disable in prod compose (`RUN_BACKGROUND_JOBS=false`). */
export function shouldRunBackgroundJobsInApiProcess(
  nodeEnv: string,
  envValue: string | undefined = process.env.RUN_BACKGROUND_JOBS,
): boolean {
  if (envValue !== undefined) {
    const normalized = envValue.toLowerCase().trim();
    if (normalized === "true" || normalized === "1" || normalized === "yes") {
      return true;
    }
    if (normalized === "false" || normalized === "0" || normalized === "no") {
      return false;
    }
  }
  return nodeEnv !== "production";
}
