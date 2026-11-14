import { versionSatisfies } from "./update-order";

/** How long to wait for the restarted core to report the target version. */
export const CORE_RESTART_TIMEOUT_MS = 180_000;
/** First pause after a status read that is not on the target version yet. */
export const CORE_RESTART_INITIAL_DELAY_MS = 1_000;
/** Cap so a long restart does not turn into a burst of status requests. */
export const CORE_RESTART_MAX_DELAY_MS = 8_000;

export type CoreRestartPoll = {
  timeoutMs?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
};

/**
 * Poll the system-update status until `currentVersion` is at least `targetVersion`.
 * A failed request means the API is still restarting. The gap between reads grows
 * from one second to eight seconds.
 */
export async function waitForRunningCore(
  targetVersion: string,
  readVersion: () => Promise<string | null>,
  poll: CoreRestartPoll = {},
): Promise<"ready" | "timeout"> {
  const sleep = poll.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  const now = poll.now ?? (() => Date.now());
  const timeoutMs = poll.timeoutMs ?? CORE_RESTART_TIMEOUT_MS;
  const maxDelayMs = poll.maxDelayMs ?? CORE_RESTART_MAX_DELAY_MS;
  let delay = poll.initialDelayMs ?? CORE_RESTART_INITIAL_DELAY_MS;
  const deadline = now() + timeoutMs;

  while (now() < deadline) {
    try {
      const version = await readVersion();
      if (version && versionSatisfies(version, targetVersion)) {
        return "ready";
      }
    } catch {
      // The API process is down or not ready. Wait before the next read.
    }
    const remaining = deadline - now();
    if (remaining <= 0) {
      break;
    }
    await sleep(Math.min(delay, remaining));
    delay = Math.min(delay * 2, maxDelayMs);
  }
  return "timeout";
}
