import { ApiRequestError, type ApiClient } from "@okkey/api";

export type ApprovedRecoveryChannel = "devices" | "contacts";

export type ApprovedRecoveryCompleteResult = "completed" | "absent";

/** Plugin route that marks the current session recovery-proved. Open core returns 404. */
export function approvedRecoveryCompletePath(
  channel: ApprovedRecoveryChannel,
  requestId: string,
): string {
  const id = encodeURIComponent(requestId);
  const segment = channel === "devices" ? "devices" : "contacts";
  return `/enterprise/account/recovery/${segment}/requests/${id}/complete`;
}

/**
 * Ask the recovery plugin to mark this session proved.
 * A 404 means the plugin is not installed and is ignored.
 * Any other failure is returned to the caller so the master password is not changed.
 */
export async function completeApprovedRecoveryRequest(
  api: Pick<ApiClient, "post">,
  channel: ApprovedRecoveryChannel,
  requestId: string,
): Promise<ApprovedRecoveryCompleteResult> {
  const id = requestId.trim();
  if (!id) {
    return "absent";
  }
  try {
    await api.post(approvedRecoveryCompletePath(channel, id), {});
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 404) {
      return "absent";
    }
    if (error instanceof SyntaxError) {
      // 2xx with an empty body still means the plugin accepted the call.
      return "completed";
    }
    throw error;
  }
  return "completed";
}
