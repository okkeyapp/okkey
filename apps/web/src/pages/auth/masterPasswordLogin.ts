import type { EmailAuthStartResponse } from "@okkey/types";

/**
 * Show the master-password step instead of the emailed code when the server
 * says mail is not deliverable. First-run and invite-link registration skip both.
 */
export function shouldPromptMasterPasswordLogin(
  start: Pick<
    EmailAuthStartResponse,
    "emailDeliverable" | "bootstrapRequired" | "inviteRegistration"
  >,
): boolean {
  return (
    start.emailDeliverable === false &&
    start.bootstrapRequired !== true &&
    start.inviteRegistration !== true
  );
}
