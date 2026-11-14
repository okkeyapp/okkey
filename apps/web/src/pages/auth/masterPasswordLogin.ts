import type { EmailAuthStartResponse } from "@okkey/types";

/**
 * Show the master-password step instead of the emailed code when the server
 * says mail is not deliverable. First-run registration still skips both.
 */
export function shouldPromptMasterPasswordLogin(
  start: Pick<EmailAuthStartResponse, "emailDeliverable" | "bootstrapRequired">,
): boolean {
  return start.emailDeliverable === false && start.bootstrapRequired !== true;
}
