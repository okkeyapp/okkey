/**
 * Self-host code entry tells the operator where to read the code when mail
 * cannot be delivered. SaaS and deliverable mail leave the screen unchanged.
 * `undefined` (older server, flag omitted) stays hidden.
 */
export function shouldShowMailNotConfiguredHint(
  emailDeliverable: boolean | null | undefined,
): boolean {
  return emailDeliverable === false;
}
