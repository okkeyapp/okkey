import type { DeviceListItemDto } from "@okkey/types";

/** One approval attempt. A later request for the same device has a new `created_at`. */
export function pendingApprovalKey(
  item: Pick<DeviceListItemDto, "device_id" | "created_at">,
): string {
  return `${item.device_id}\u0000${item.created_at}`;
}

export function visiblePendingDevices<T extends Pick<DeviceListItemDto, "device_id" | "created_at">>(
  pending: readonly T[],
  dismissedRequestKeys: ReadonlySet<string>,
): T[] {
  return pending.filter((item) => !dismissedRequestKeys.has(pendingApprovalKey(item)));
}

/** Share delivery stays pending until the new device confirms. Only `trusted` is an approval. */
export function approvalResponseGrantsTrust(status: string | undefined): boolean {
  return status === "trusted";
}

export function deviceDecisionToastKey(decision: "approve" | "reject"): string {
  return decision === "approve"
    ? "web.settingsPopup.devices.toast.trusted"
    : "web.settingsPopup.devices.toast.rejected";
}
