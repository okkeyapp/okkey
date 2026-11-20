import type { DeviceListItemDto } from "@okkey/types";

/** One approval attempt. A later request for the same device has a new `created_at`. */
export function pendingApprovalKey(
  item: Pick<DeviceListItemDto, "device_id" | "created_at">,
): string {
  return `${item.device_id}\u0000${item.created_at}`;
}

/**
 * Share-delivery approve sets `approved_at` while the device stays pending until the
 * extension claims the envelope. Those rows no longer need an approver click.
 */
export function pendingDeviceNeedsApproverAction(
  item: Pick<DeviceListItemDto, "approved_at">,
): boolean {
  return item.approved_at == null || item.approved_at.trim() === "";
}

export function visiblePendingDevices<
  T extends Pick<DeviceListItemDto, "device_id" | "created_at" | "approved_at">,
>(pending: readonly T[], dismissedRequestKeys: ReadonlySet<string>): T[] {
  return pending.filter(
    (item) =>
      pendingDeviceNeedsApproverAction(item) &&
      !dismissedRequestKeys.has(pendingApprovalKey(item)),
  );
}

/** Share delivery stays pending until the new device confirms. Only `trusted` is full trust. */
export function approvalResponseGrantsTrust(status: string | undefined): boolean {
  return status === "trusted";
}

/**
 * Approver action succeeded: either fully trusted, or envelope stored (`pending_approval`).
 * Both should dismiss the Trust UI without waiting for the extension to claim.
 */
export function approvalResponseCompletesApproverAction(
  status: string | undefined,
): boolean {
  return status === "trusted" || status === "pending_approval";
}

export function deviceDecisionToastKey(
  decision: "approve" | "reject",
  options?: { waitingForExtension?: boolean },
): string {
  if (decision === "reject") {
    return "web.settingsPopup.devices.toast.rejected";
  }
  if (options?.waitingForExtension) {
    return "web.settingsPopup.devices.toast.approvedWaiting";
  }
  return "web.settingsPopup.devices.toast.trusted";
}
