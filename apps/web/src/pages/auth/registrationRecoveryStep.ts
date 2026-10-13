/**
 * Post-signup recovery export must stay on `/account/new` after
 * `completeRegistration` clears `registrationAuthStateId` and while enroll runs
 * (or stays on `enrollFailed` until retry succeeds).
 */
export type RegistrationStep = "form" | "enrolling" | "enrollFailed" | "recoveryKey";

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

/** Enroll must succeed before leave/handoff; failure stays on a blocking step. */
export function registrationStepAfterRecoveryEnroll(enrolled: boolean): "recoveryKey" | "enrollFailed" {
  return enrolled ? "recoveryKey" : "enrollFailed";
}
