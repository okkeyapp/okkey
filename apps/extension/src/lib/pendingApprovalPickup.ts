/**
 * Background pickup of device share-delivery approval while the popup is closed.
 * Uses the same claim path as the popup (`pollExtensionDeviceTrust`); does not
 * grant vault access until claim + confirm succeed.
 */

export const PENDING_APPROVAL_PICKUP_ALARM = "okkey.pendingApprovalPickup";

/** Initial delay between background polls while a pending approval exists. */
export const PENDING_APPROVAL_PICKUP_BASE_MS = 4_000;
/** Cap for exponential backoff between polls. */
export const PENDING_APPROVAL_PICKUP_MAX_MS = 60_000;

export type PendingApprovalPickupOutcome =
  | "trusted"
  | "pending"
  | "rejected"
  | "blocked"
  | "idle"
  | "error";

export type PendingApprovalTrustStatus =
  | "checking"
  | "trusted"
  | "pending"
  | "blocked"
  | "rejected"
  | "error";

/**
 * Next delay for a pending-approval poll attempt (exponential backoff, capped).
 * `attempt` is 0-based (first retry after the initial probe).
 */
export function nextPendingApprovalBackoffMs(attempt: number): number {
  const safeAttempt = Number.isFinite(attempt) && attempt > 0 ? Math.floor(attempt) : 0;
  const delay = PENDING_APPROVAL_PICKUP_BASE_MS * 2 ** safeAttempt;
  return Math.min(PENDING_APPROVAL_PICKUP_MAX_MS, delay);
}

export function pendingApprovalPickupContinues(status: PendingApprovalTrustStatus): boolean {
  return status === "pending" || status === "checking";
}

export function pendingApprovalOutcomeFromTrustStatus(
  status: PendingApprovalTrustStatus,
): PendingApprovalPickupOutcome {
  if (status === "trusted") {
    return "trusted";
  }
  if (status === "rejected") {
    return "rejected";
  }
  if (status === "blocked") {
    return "blocked";
  }
  if (pendingApprovalPickupContinues(status)) {
    return "pending";
  }
  return "idle";
}

/**
 * Schedule the next chrome.alarms tick for pending-approval pickup.
 * Clears the alarm when pickup should stop.
 */
export async function schedulePendingApprovalPickupAlarm(
  alarms: {
    create: (name: string, info: { when: number }) => Promise<void> | void;
    clear: (name: string) => Promise<boolean> | boolean;
  },
  outcome: PendingApprovalPickupOutcome,
  attempt: number,
  now: () => number = () => Date.now(),
): Promise<number | null> {
  if (outcome !== "pending" && outcome !== "error") {
    await alarms.clear(PENDING_APPROVAL_PICKUP_ALARM);
    return null;
  }
  const delayMs = nextPendingApprovalBackoffMs(attempt);
  await alarms.create(PENDING_APPROVAL_PICKUP_ALARM, { when: now() + delayMs });
  return delayMs;
}

/**
 * One background tick: list/claim via the same verification as the popup poller.
 * Returns `idle` when there is no session or no pending install to watch.
 *
 * Injected deps keep this unit-testable without loading the full crypto/API graph.
 */
export async function runPendingApprovalPickupTick(deps: {
  readSession: () => Promise<{ access_token: string; user_id: string } | null>;
  readProfile: () => Promise<{ apiBaseUrl: string } | null>;
  readDeviceId: () => Promise<string | null>;
  readDeviceFingerprint: () => Promise<string | null>;
  hasShareDeliveryKey: (fingerprint: string) => Promise<boolean>;
  poll: (
    apiBaseUrl: string,
    accessToken: string,
    pendingDeviceId: string | null,
  ) => Promise<{ status: PendingApprovalTrustStatus }>;
}): Promise<PendingApprovalPickupOutcome> {
  const session = await deps.readSession();
  const profile = await deps.readProfile();
  if (!session || !profile) {
    return "idle";
  }

  const fingerprint = await deps.readDeviceFingerprint();
  const deviceId = await deps.readDeviceId();
  const hasDeliveryKey = fingerprint
    ? await deps.hasShareDeliveryKey(fingerprint)
    : false;
  // Without a pending device id or one-time key there is nothing to claim in the background.
  if (!deviceId && !hasDeliveryKey) {
    return "idle";
  }

  try {
    const snapshot = await deps.poll(profile.apiBaseUrl, session.access_token, deviceId);
    return pendingApprovalOutcomeFromTrustStatus(snapshot.status);
  } catch {
    return "error";
  }
}
