/**
 * Post-signup recovery export must stay on `/account/new` after
 * `completeRegistration` clears `registrationAuthStateId` and while enroll runs.
 */
export type RegistrationStep = "form" | "enrolling" | "recoveryKey";

export function shouldRedirectAwayFromRegistrationForm(args: {
  step: RegistrationStep;
  registrationAuthStateId: string | null;
  email: string;
}): boolean {
  if (args.step !== "form") {
    return false;
  }
  return !args.registrationAuthStateId || !args.email;
}
