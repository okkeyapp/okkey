/**
 * Wires pending-approval pickup to extension storage + Core API.
 * Kept separate from pure backoff helpers so unit tests stay lightweight.
 */
import { createCoreClient } from "./api.ts";
import { hasExtensionShareDeliveryKey } from "./deviceShareDelivery.ts";
import { pollExtensionDeviceTrust } from "./deviceTrust.ts";
import {
  PENDING_APPROVAL_PICKUP_ALARM,
  runPendingApprovalPickupTick,
  schedulePendingApprovalPickupAlarm,
  type PendingApprovalPickupOutcome,
} from "./pendingApprovalPickup.ts";
import { readDeviceFingerprint, readDeviceId, readProfile, readSession } from "./storage.ts";

let pickupAttempt = 0;

export function resetPendingApprovalPickupAttempt(): void {
  pickupAttempt = 0;
}

export async function runBackgroundPendingApprovalPickup(alarms?: {
  create: (name: string, info: { when: number }) => Promise<void> | void;
  clear: (name: string) => Promise<boolean> | boolean;
}): Promise<PendingApprovalPickupOutcome> {
  const outcome = await runPendingApprovalPickupTick({
    readSession,
    readProfile,
    readDeviceId,
    readDeviceFingerprint,
    hasShareDeliveryKey: hasExtensionShareDeliveryKey,
    poll: async (apiBaseUrl, accessToken, pendingDeviceId) => {
      const core = createCoreClient(apiBaseUrl, accessToken);
      return pollExtensionDeviceTrust(core, pendingDeviceId);
    },
  });

  const alarmApi = alarms ?? browser.alarms;
  if (outcome === "pending" || outcome === "error") {
    await schedulePendingApprovalPickupAlarm(alarmApi, outcome, pickupAttempt);
    pickupAttempt += 1;
  } else {
    pickupAttempt = 0;
    await schedulePendingApprovalPickupAlarm(alarmApi, outcome, 0);
  }
  return outcome;
}

export { PENDING_APPROVAL_PICKUP_ALARM };
